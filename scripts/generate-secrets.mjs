import { randomBytes } from "node:crypto";

const randomValue = (byteLength = 48) => randomBytes(byteLength).toString("base64url");

const secrets = {
  ADMIN_ACCESS_CODE: `adm_${randomValue(24)}`,
  ADMIN_SESSION_SECRET: randomValue(),
  DIRECTSIGN_TOKEN_ENCRYPTION_SECRET: randomValue(),
};

console.log("# Add these server-side values to .env.local or your deployment environment.");
console.log("# Keep them stable across deployments. Do not prefix them with VITE_.");
for (const [name, value] of Object.entries(secrets)) {
  console.log(`${name}="${value}"`);
}
