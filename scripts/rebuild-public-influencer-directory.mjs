import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import {
  chunkPublicInfluencerDirectoryRows,
  resolvePublicInfluencerDirectoryRows,
} from "./lib/public-influencer-directory.mjs";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const apply = process.argv.includes("--apply");
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const pageSize = 1000;

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  Accept: "application/json",
};

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchSupabase(url, init = {}, attempt = 0) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (
      attempt < 2 &&
      [429, 500, 502, 503, 504].includes(response.status)
    ) {
      await response.arrayBuffer().catch(() => undefined);
      await delay((attempt + 1) * 400);
      return fetchSupabase(url, init, attempt + 1);
    }
    return response;
  } catch (error) {
    if (attempt < 2 && error?.name === "TimeoutError") {
      await delay((attempt + 1) * 400);
      return fetchSupabase(url, init, attempt + 1);
    }
    throw error;
  }
}

const buildRestUrl = (table, query = {}) => {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
};

async function readPage(table, query, offset, includeCount = false) {
  const response = await fetchSupabase(
    buildRestUrl(table, {
      ...query,
      limit: pageSize,
      offset,
    }),
    {
      headers: includeCount ? { Prefer: "count=exact" } : undefined,
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${table} read failed (${response.status}): ${body.slice(0, 400)}`,
    );
  }
  const rows = JSON.parse(body);
  const total = includeCount
    ? Number((response.headers.get("content-range") ?? "/0").split("/")[1])
    : undefined;
  return { rows, total };
}

async function readAllRows(table, query) {
  const first = await readPage(table, query, 0, true);
  if (!Number.isInteger(first.total) || first.total < first.rows.length) {
    throw new Error(`${table} returned an invalid exact count.`);
  }

  const rows = [...first.rows];
  let page = first.rows;
  while (page.length === pageSize) {
    const lastId = page.at(-1)?.id;
    if (!lastId) {
      throw new Error(`${table} keyset page did not include an id.`);
    }
    page = (
      await readPage(table, { ...query, id: `gt.${lastId}` }, 0)
    ).rows;
    rows.push(...page);
    if (rows.length % 10_000 < page.length || rows.length === first.total) {
      console.error(`[directory rebuild] ${table}: ${rows.length}/${first.total}`);
    }
  }

  if (rows.length !== first.total) {
    throw new Error(
      `${table} exact count changed during rebuild (${first.total} -> ${rows.length}). Retry from a fresh snapshot.`,
    );
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error(`${table} returned duplicate ids during keyset pagination.`);
  }
  return rows;
}

async function upsertDirectoryRows(rows, rebuildToken, indexedAt) {
  let applied = 0;
  for (const chunk of chunkPublicInfluencerDirectoryRows(rows, 100)) {
    const response = await fetchSupabase(
      buildRestUrl("marketplace_public_influencer_directory", {
        on_conflict: "listing_key",
      }),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(
          chunk.map((row) => ({
            ...row,
            rebuild_token: rebuildToken,
            updated_at: indexedAt,
          })),
        ),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Directory upsert failed (${response.status}): ${(await response.text()).slice(0, 400)}`,
      );
    }
    applied += chunk.length;
  }
  return applied;
}

async function sweepStaleDirectoryRows(rebuildToken, rebuildStartedAt) {
  if (!/^[0-9a-f-]{36}$/i.test(rebuildToken)) {
    throw new Error("Refusing directory sweep with an invalid rebuild token.");
  }
  const target = buildRestUrl("marketplace_public_influencer_directory", {
    or: `(rebuild_token.is.null,rebuild_token.neq.${rebuildToken})`,
    updated_at: `lt.${rebuildStartedAt}`,
  });
  if (
    target.origin !== new URL(supabaseUrl).origin ||
    target.pathname !== "/rest/v1/marketplace_public_influencer_directory"
  ) {
    throw new Error("Refusing directory sweep outside the configured table.");
  }
  const response = await fetchSupabase(target, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Directory stale-row sweep failed (${response.status}): ${body.slice(0, 400)}`,
    );
  }
  return JSON.parse(body).length;
}

const rebuildStartedAt = new Date().toISOString();
const [registeredProfiles, registeredChannels, discoveredProfiles] =
  await Promise.all([
    readAllRows("marketplace_influencer_profiles", {
      select:
        "id,public_handle,display_name,headline,bio,location,audience,categories,audience_countries,audience_tags,brand_fit,recent_brands,is_published,data_origin,updated_at",
      is_published: "eq.true",
      order: "id.asc",
    }),
    readAllRows("marketplace_influencer_channels", {
      select:
        "id,profile_id,platform,handle,followers_label,follower_count,updated_at",
      order: "id.asc",
    }),
    readAllRows("discovered_influencer_profiles", {
      select:
        "id,platform,public_handle,platform_handle,display_name,headline,bio,profile_url,categories,audience_countries,audience_tags,followers_label,follower_count,quality_score,status,source_provider,source_keyword,source_evidence,claimed_marketplace_profile_id,last_checked_at,updated_at,naver_blog_visitor_average_4d,naver_blog_visitor_status",
      order: "id.asc",
    }),
  ]);

const { rows, summary } = resolvePublicInfluencerDirectoryRows({
  registeredProfiles,
  registeredChannels,
  discoveredProfiles,
});

let applied = 0;
let removed = 0;
let rebuildToken = null;
if (apply) {
  rebuildToken = randomUUID();
  const indexedAt = new Date().toISOString();
  applied = await upsertDirectoryRows(rows, rebuildToken, indexedAt);
  removed = await sweepStaleDirectoryRows(rebuildToken, rebuildStartedAt);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      apply,
      generated_at: new Date().toISOString(),
      ...summary,
      applied,
      removed,
      rebuild_token: rebuildToken,
      note: apply
        ? "Directory rebuild completed."
        : "Dry run only. Re-run with --apply after migration and parity review.",
    },
    null,
    2,
  ),
);
