#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const listGitVisibleFiles = () => {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return output.split(/\r?\n/).filter(Boolean);
};

const normalizePath = (filePath) => filePath.replaceAll("\\", "/");

const riskySalesArtifactPattern =
  /^docs\/sales\/[^/]+\.(csv|tsv|json)$/i;
const leadArtifactNamePattern =
  /(prospect|lead|outreach|business-emails|email-discovery|cold-email)/i;
const textFilePattern =
  /\.(ts|tsx|js|mjs|cjs|json|md|html|css|sql|txt|example|gitignore|vercelignore)$/i;
const nonEmptySecretPatterns = [
  /(?:^|\n)\s*(?:export\s+)?SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY)\s*=\s*["']?(?!["']?\s*(?:#.*)?(?:\r?\n|$))[^"'\s#]+/,
  /(?:^|\n)\s*(?:export\s+)?GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET\s*=\s*["']?(?!["']?\s*(?:#.*)?(?:\r?\n|$))[^"'\s#]+/,
  /(?:^|\n)\s*(?:export\s+)?GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_SECRET\s*=\s*["']?(?!["']?\s*(?:#.*)?(?:\r?\n|$))[^"'\s#]+/,
  /(?:^|\n)\s*(?:export\s+)?ADMIN_ACCESS_CODE\s*=\s*["']?(?!["']?\s*(?:#.*)?(?:\r?\n|$))[^"'\s#]+/,
  /(?:^|\n)\s*(?:export\s+)?ADMIN_SESSION_SECRET\s*=\s*["']?(?!["']?\s*(?:#.*)?(?:\r?\n|$))[^"'\s#]+/,
  /(?:^|\n)\s*(?:export\s+)?DIRECTSIGN_TOKEN_ENCRYPTION_SECRET\s*=\s*["']?(?!["']?\s*(?:#.*)?(?:\r?\n|$))[^"'\s#]+/,
  /(?:^|\n)\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN)\s*=\s*["']?(?!["']?\s*(?:#.*)?(?:\r?\n|$))[^"'\s#]+/,
  /-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----/,
];

const findings = [];

for (const file of listGitVisibleFiles()) {
  const normalized = normalizePath(file);

  if (
    riskySalesArtifactPattern.test(normalized) &&
    leadArtifactNamePattern.test(path.basename(normalized))
  ) {
    findings.push({
      file: normalized,
      reason: "raw sales lead artifact must live under ignored data/ storage",
    });
    continue;
  }

  if (!textFilePattern.test(normalized)) continue;

  let source;
  try {
    source = readFileSync(path.join(root, file), "utf8");
  } catch {
    continue;
  }

  for (const pattern of nonEmptySecretPatterns) {
    if (pattern.test(source)) {
      findings.push({
        file: normalized,
        reason: "possible non-empty server secret in git-visible file",
      });
      break;
    }
  }
}

if (findings.length > 0) {
  console.error("Privacy scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.reason}`);
  }
  process.exit(1);
}

console.log("Privacy scan passed: no raw sales lead artifacts or server secrets are git-visible.");
