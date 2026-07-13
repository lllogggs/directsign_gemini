import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import {
  hasMalformedCollectedText,
  sanitizeCollectedText,
} from "./lib/influencer-text-quality.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const apply = process.argv.includes("--apply");
const auditedAt = new Date().toISOString();
const auditVersion = "2026-07-12-quality-v1";
const outputDir = path.join(process.cwd(), "docs", "discovery");
const manifestPath = path.join(
  outputDir,
  "influencer-data-quality-repair-latest.json",
);
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function readAllRows() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/discovered_influencer_profiles?select=*&order=id.asc&limit=1000&offset=${offset}`,
      { headers },
    );
    if (!response.ok) throw new Error(await response.text());
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

const rows = await readAllRows();
const textFields = ["display_name", "platform_handle", "headline", "bio"];
const patches = [];

for (const row of rows) {
  const patch = {};
  const changedFields = [];
  for (const field of textFields) {
    if (!hasMalformedCollectedText(row[field])) continue;
    const sanitized = sanitizeCollectedText(row[field]);
    if (sanitized === row[field]) continue;
    patch[field] = sanitized;
    changedFields.push(field);
  }
  if (changedFields.length === 0) continue;
  patch.source_evidence = {
    ...(row.source_evidence ?? {}),
    dataQualityAudit: {
      version: auditVersion,
      auditedAt,
      reasons: ["malformed_text_cleanup"],
      changedFields,
    },
  };
  patch.last_checked_at = auditedAt;
  patches.push({ row, patch, changedFields });
}

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedAt: auditedAt,
      apply,
      totalRows: rows.length,
      patches: patches.map(({ row, changedFields }) => ({
        id: row.id,
        platform: row.platform,
        handle: row.platform_handle,
        status: row.status,
        changedFields,
      })),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

let backupPath = null;
if (apply && patches.length > 0) {
  const stamp = auditedAt.replace(/[:.]/g, "-");
  backupPath = path.join(outputDir, `${stamp}-influencer-quality-backup.json`);
  await fs.writeFile(
    backupPath,
    `${JSON.stringify(patches.map(({ row }) => row), null, 2)}\n`,
    "utf8",
  );

  const concurrency = 10;
  for (let index = 0; index < patches.length; index += concurrency) {
    await Promise.all(
      patches.slice(index, index + concurrency).map(async ({ row, patch }) => {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/discovered_influencer_profiles?id=eq.${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify(patch),
          },
        );
        if (!response.ok) {
          throw new Error(
            `Patch ${row.id} failed (${response.status}): ${await response.text()}`,
          );
        }
      }),
    );
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      apply,
      totalRows: rows.length,
      patches: patches.length,
      activePatches: patches.filter(({ row }) => row.status === "active").length,
      manifest: manifestPath,
      backup: backupPath,
    },
    null,
    2,
  ),
);
