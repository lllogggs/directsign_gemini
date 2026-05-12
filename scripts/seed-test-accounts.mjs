import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const TEST_ACCOUNT_PASSWORD =
  process.env.QA_TEST_PASSWORD ?? "YeollockTest!2026";

const accounts = {
  advertiser: {
    email: "test.advertiser@yeollock.me",
    role: "marketer",
    name: "QA Advertiser",
    company_name: "QA Test Brand",
  },
  influencer: {
    email: "test.influencer@yeollock.me",
    role: "influencer",
    name: "QA Influencer",
  },
};

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Supabase service environment is missing");
}

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const stableUuid = (seed) => {
  const hash = crypto
    .createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hash[12] = "4";
  hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(
    12,
    16,
  )}-${value.slice(16, 20)}-${value.slice(20)}`;
};

const parseJsonResponse = async (response, label) => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${text.slice(0, 700)}`);
  }
  return text ? JSON.parse(text) : null;
};

const rest = async (table, query = "", init = {}, label = table) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    ...init,
    headers: {
      ...restHeaders,
      ...(init.headers ?? {}),
    },
  });
  return parseJsonResponse(response, `Supabase ${label}`);
};

const normalizeRows = (rows) => {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return rows.map((row) =>
    Object.fromEntries(keys.map((key) => [key, row[key] ?? null])),
  );
};

const upsert = async (table, rows, onConflict = "id", label = table) => {
  if (!rows.length) return;
  await rest(
    table,
    `?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(normalizeRows(rows)),
    },
    `${label} upsert`,
  );
};

const listAuthUsers = async () => {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=100`,
      { headers: restHeaders },
    );
    const payload = await parseJsonResponse(response, "Supabase auth users list");
    const batchUsers = Array.isArray(payload?.users)
      ? payload.users
      : Array.isArray(payload)
        ? payload
        : [];
    users.push(...batchUsers);
    if (batchUsers.length < 100) break;
  }
  return users;
};

const findAuthUserByEmail = async (email) => {
  const normalized = email.toLowerCase();
  return (await listAuthUsers()).find(
    (user) => String(user.email ?? "").toLowerCase() === normalized,
  );
};

const ensureAuthUser = async ({ email, role, name, company_name }) => {
  let user = await findAuthUserByEmail(email);
  if (!user) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: restHeaders,
      body: JSON.stringify({
        email,
        password: TEST_ACCOUNT_PASSWORD,
        email_confirm: true,
        user_metadata: { name, role, ...(company_name ? { company_name } : {}) },
        app_metadata: { qa_account: true, role },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (!body.toLowerCase().includes("already")) {
        throw new Error(
          `Supabase auth user create failed (${response.status}): ${body.slice(
            0,
            700,
          )}`,
        );
      }
    }
    user = await findAuthUserByEmail(email);
  }

  if (!user?.id) throw new Error(`Auth user not found after ensure: ${email}`);

  const updateResponse = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
    {
      method: "PUT",
      headers: restHeaders,
      body: JSON.stringify({
        password: TEST_ACCOUNT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata ?? {}),
          name,
          role,
          ...(company_name ? { company_name } : {}),
        },
        app_metadata: { ...(user.app_metadata ?? {}), qa_account: true, role },
      }),
    },
  );
  await parseJsonResponse(updateResponse, `Supabase auth user update ${email}`);
  return { id: user.id, email };
};

const ensureProfilesAndOrganization = async (advertiser, influencer) => {
  const timestamp = new Date().toISOString();

  await upsert(
    "profiles",
    [
      {
        id: advertiser.id,
        role: accounts.advertiser.role,
        name: accounts.advertiser.name,
        email: advertiser.email,
        company_name: accounts.advertiser.company_name,
        activity_categories: [],
        activity_platforms: [],
        verification_status: "approved",
        email_verified_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: influencer.id,
        role: accounts.influencer.role,
        name: accounts.influencer.name,
        email: influencer.email,
        company_name: null,
        activity_categories: ["lifestyle", "beauty", "tech"],
        activity_platforms: ["instagram", "youtube", "naver_blog"],
        verification_status: "approved",
        email_verified_at: timestamp,
        updated_at: timestamp,
      },
    ],
    "id",
    "profiles",
  );

  const memberships = await rest(
    "organization_members",
    `?select=organization_id,profile_id,is_default&profile_id=eq.${encodeURIComponent(
      advertiser.id,
    )}&is_default=eq.true&limit=1`,
    {},
    "default organization membership read",
  );
  const organizationId =
    memberships?.[0]?.organization_id ??
    stableUuid(`qa:test-accounts:organization:${advertiser.id}`);

  await upsert(
    "organizations",
    [
      {
        id: organizationId,
        name: accounts.advertiser.company_name,
        organization_type: "advertiser",
        business_registration_number: "1234567890",
        business_verification_status: "approved",
        business_verified_at: timestamp,
        representative_name: "QA Representative",
        created_by_profile_id: advertiser.id,
        updated_at: timestamp,
      },
    ],
    "id",
    "organizations",
  );

  await upsert(
    "organization_members",
    [
      {
        organization_id: organizationId,
        profile_id: advertiser.id,
        role: "owner",
        is_default: true,
      },
    ],
    "organization_id,profile_id",
    "organization members",
  );

  return { organizationId };
};

const advertiser = await ensureAuthUser(accounts.advertiser);
const influencer = await ensureAuthUser(accounts.influencer);
const { organizationId } = await ensureProfilesAndOrganization(
  advertiser,
  influencer,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      accounts: {
        advertiser: {
          email: advertiser.email,
          login_path: "/login/advertiser",
        },
        influencer: {
          email: influencer.email,
          login_path: "/login/influencer",
        },
      },
      password: TEST_ACCOUNT_PASSWORD,
      organization_id: organizationId,
    },
    null,
    2,
  ),
);
