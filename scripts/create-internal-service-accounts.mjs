import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SUPABASE_URL = String(process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const INTERNAL_PASSWORD = process.env.INTERNAL_SERVICE_ACCOUNT_PASSWORD;
const PUBLIC_ORIGIN = String(
  process.env.INTERNAL_SERVICE_ACCOUNT_PUBLIC_ORIGIN ?? "",
).replace(/\/$/, "");
const ACKNOWLEDGED_SUPABASE_HOST = process.env.YEOLLOCK_ACK_SUPABASE_HOST;
const RUN_CONFIRMED =
  process.env.YEOLLOCK_INTERNAL_SERVICE_ACCOUNT_RUN === "true";
const CREDENTIALS_PATH = path.resolve(
  process.env.INTERNAL_SERVICE_ACCOUNT_CREDENTIALS_PATH ??
    "output/internal-service-account-credentials.txt",
);

const accounts = [
  {
    key: "advertiser",
    email: "advertiser.master@yeollock.me",
    role: "marketer",
    name: "연락미",
    companyName: "연락미",
    activityCategories: [],
    activityPlatforms: [],
    excludeFromInfluencerDiscovery: false,
  },
  {
    key: "influencer",
    email: "influencer.master@yeollock.me",
    role: "influencer",
    name: "연락미",
    companyName: null,
    activityCategories: ["lifestyle"],
    activityPlatforms: ["instagram"],
    excludeFromInfluencerDiscovery: true,
  },
];

if (!RUN_CONFIRMED) {
  throw new Error(
    "Internal service-account creation requires YEOLLOCK_INTERNAL_SERVICE_ACCOUNT_RUN=true.",
  );
}
if (PUBLIC_ORIGIN !== "https://yeollock.me") {
  throw new Error(
    "Set INTERNAL_SERVICE_ACCOUNT_PUBLIC_ORIGIN=https://yeollock.me for the production account run.",
  );
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Supabase service environment is missing");
}
if (!INTERNAL_PASSWORD || INTERNAL_PASSWORD.length < 16) {
  throw new Error(
    "INTERNAL_SERVICE_ACCOUNT_PASSWORD must be provided and contain at least 16 characters.",
  );
}
if (INTERNAL_PASSWORD === process.env.QA_TEST_PASSWORD) {
  throw new Error("The internal service-account password must not reuse the QA password.");
}

let supabaseHost;
try {
  supabaseHost = new URL(SUPABASE_URL).host;
} catch {
  throw new Error("SUPABASE_URL must be a valid absolute URL");
}
if (ACKNOWLEDGED_SUPABASE_HOST !== supabaseHost) {
  throw new Error(
    `Set YEOLLOCK_ACK_SUPABASE_HOST=${supabaseHost} to acknowledge the exact Supabase target for this run.`,
  );
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const parseResponse = async (response, label) => {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${body.slice(0, 700)}`);
  }
  return body ? JSON.parse(body) : null;
};

const rest = async (table, query = "", init = {}, label = table) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  return parseResponse(response, `Supabase ${label}`);
};

const readRows = (table, query, label = table) => rest(table, query, {}, label);

const upsertRows = async (table, rows, onConflict, label = table) => {
  if (!rows.length) return [];
  return rest(
    table,
    `?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows),
    },
    `${label} upsert`,
  );
};

const listAuthUsers = async () => {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=100`,
      { headers },
    );
    const payload = await parseResponse(response, "Supabase auth users list");
    const batch = Array.isArray(payload?.users)
      ? payload.users
      : Array.isArray(payload)
        ? payload
        : [];
    users.push(...batch);
    if (batch.length < 100) break;
  }
  return users;
};

const hasForbiddenAuthMarker = (value) =>
  /"(qa|test|demo|seed|qa_account|seeded|is_test|test_data|demo_account|seed_account)"\s*:\s*(true|"true"|1|"1")/i.test(
    JSON.stringify(value ?? {}),
  );

const ensureAuthUser = async (account, authUsers) => {
  let user = authUsers.find(
    (candidate) =>
      String(candidate.email ?? "").toLowerCase() === account.email,
  );

  if (user && hasForbiddenAuthMarker(user.app_metadata)) {
    throw new Error(`Refusing to convert a QA/demo/seed auth user: ${account.email}`);
  }

  if (!user) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: account.email,
        password: INTERNAL_PASSWORD,
        email_confirm: true,
        user_metadata: {
          name: account.name,
          role: account.role,
          ...(account.companyName ? { company_name: account.companyName } : {}),
        },
        app_metadata: {
          role: account.role,
          internal_service_account: true,
          internal_service_account_scope: account.key,
        },
      }),
    });
    const createdPayload = await parseResponse(
      response,
      `Supabase auth user create ${account.email}`,
    );
    user = createdPayload?.user ?? createdPayload;
  }

  if (!user?.id) throw new Error(`Auth user was not created: ${account.email}`);

  const currentProfileRows = await readRows(
    "profiles",
    `?select=id,role,data_origin,verification_status&id=eq.${encodeURIComponent(
      user.id,
    )}`,
    `profile preflight ${account.email}`,
  );
  const currentProfile = currentProfileRows[0];
  if (currentProfile && user.app_metadata?.internal_service_account !== true) {
    throw new Error(
      `Refusing to convert an existing customer profile into an internal service account: ${account.email}`,
    );
  }
  if (
    currentProfile &&
    (currentProfile.role !== account.role || currentProfile.data_origin !== "production")
  ) {
    throw new Error(
      `Refusing to convert an existing non-production or wrong-role profile: ${account.email}`,
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        password: INTERNAL_PASSWORD,
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata ?? {}),
          name: account.name,
          role: account.role,
          ...(account.companyName ? { company_name: account.companyName } : {}),
        },
        app_metadata: {
          ...(user.app_metadata ?? {}),
          role: account.role,
          internal_service_account: true,
          internal_service_account_scope: account.key,
        },
      }),
    },
  );
  const updatedUser = await parseResponse(
    response,
    `Supabase auth user update ${account.email}`,
  );
  return {
    ...account,
    id: updatedUser.id ?? user.id,
    currentVerificationStatus: currentProfile?.verification_status,
  };
};

const consentSnapshot = (account, now) => ({
  role: account.role === "marketer" ? "advertiser" : "influencer",
  terms_accepted: true,
  privacy_accepted: true,
  terms_version: "2026-06-02",
  privacy_policy_version: "2026-08-08",
  accepted_at: now,
  source: "internal-service-account-bootstrap",
});

const ensureProfiles = async (resolvedAccounts, now) => {
  await upsertRows(
    "profiles",
    resolvedAccounts.map((account) => ({
      id: account.id,
      role: account.role,
      name: account.name,
      email: account.email,
      company_name: account.companyName,
      activity_categories: account.activityCategories,
      activity_platforms: account.activityPlatforms,
      verification_status: account.currentVerificationStatus ?? "not_submitted",
      data_origin: "production",
      email_verified_at: now,
      terms_accepted_at: now,
      privacy_policy_accepted_at: now,
      terms_version: "2026-06-02",
      privacy_policy_version: "2026-08-08",
      signup_consent_snapshot: consentSnapshot(account, now),
      updated_at: now,
    })),
    "id",
    "profiles",
  );
};

const ensureAdvertiserWorkspace = async (account, now) => {
  const memberships = await readRows(
    "organization_members",
    `?select=organization_id&profile_id=eq.${encodeURIComponent(account.id)}&is_default=eq.true&limit=1`,
    "advertiser default organization membership",
  );
  let organizationId = memberships[0]?.organization_id;

  if (!organizationId) {
    const existingOrganizations = await readRows(
      "organizations",
      `?select=id&created_by_profile_id=eq.${encodeURIComponent(account.id)}&organization_type=eq.advertiser&deleted_at=is.null&order=created_at.asc&limit=1`,
      "advertiser organization lookup",
    );
    organizationId = existingOrganizations[0]?.id;
  }

  if (!organizationId) {
    const [organization] = await rest(
      "organizations",
      "",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name: "연락미",
          organization_type: "advertiser",
          created_by_profile_id: account.id,
          business_verification_status: "not_submitted",
          updated_at: now,
        }),
      },
      "advertiser organization create",
    );
    organizationId = organization?.id;
  }
  if (!organizationId) throw new Error("Advertiser organization was not created");

  await upsertRows(
    "organization_members",
    [
      {
        organization_id: organizationId,
        profile_id: account.id,
        role: "owner",
        is_default: true,
      },
    ],
    "organization_id,profile_id",
    "advertiser organization membership",
  );

  const brands = await readRows(
    "marketplace_brand_profiles",
    `?select=id&organization_id=eq.${encodeURIComponent(organizationId)}&archived_at=is.null&order=created_at.asc&limit=1`,
    "advertiser brand lookup",
  );
  if (!brands[0]?.id) {
    const brandId = crypto.randomUUID();
    await upsertRows(
      "marketplace_brand_profiles",
      [
        {
          id: brandId,
          organization_id: organizationId,
          data_origin: "production",
          public_handle: `yeollock-${organizationId.slice(0, 8)}`,
          display_name: "연락미",
          category: "캠페인 모집",
          headline: "연락미 캠페인",
          description: "연락미에서 캠페인을 작성하고 참여자를 모집합니다.",
          location: "대한민국",
          logo_label: "연",
          preferred_platforms: [],
          proposal_types: ["sponsored_post"],
          budget_range_label: "캠페인별 협의",
          response_time_label: "영업일 기준 확인",
          status_label: "모집 준비",
          fit_tags: [],
          audience_targets: [],
          active_campaigns: [],
          recent_creators: [],
          is_published: false,
          is_default: true,
          archived_at: null,
          updated_at: now,
        },
      ],
      "id",
      "advertiser brand",
    );
  }

  return { organizationId };
};

const ensureInternalMarkers = async (resolvedAccounts, now) => {
  await upsertRows(
    "internal_service_accounts",
    resolvedAccounts.map((account) => ({
      profile_id: account.id,
      account_role: account.role,
      exclude_from_influencer_discovery:
        account.excludeFromInfluencerDiscovery,
      updated_at: now,
    })),
    "profile_id",
    "internal service-account markers",
  );
};

const now = new Date().toISOString();
const authUsers = await listAuthUsers();
const resolvedAccounts = [];
for (const account of accounts) {
  resolvedAccounts.push(await ensureAuthUser(account, authUsers));
}

await ensureProfiles(resolvedAccounts, now);
const advertiser = resolvedAccounts.find((account) => account.key === "advertiser");
const influencer = resolvedAccounts.find((account) => account.key === "influencer");
const workspace = await ensureAdvertiserWorkspace(advertiser, now);
await ensureInternalMarkers(resolvedAccounts, now);

fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
fs.writeFileSync(
  CREDENTIALS_PATH,
  [
    "연락미 내부 서비스 확인 계정",
    `생성 시각: ${now}`,
    "",
    "광고주",
    `아이디: ${advertiser.email}`,
    `비밀번호: ${INTERNAL_PASSWORD}`,
    "로그인: https://yeollock.me/login/advertiser",
    "",
    "인플루언서",
    `아이디: ${influencer.email}`,
    `비밀번호: ${INTERNAL_PASSWORD}`,
    "로그인: https://yeollock.me/login/influencer",
    "",
    "주의: 이 파일은 저장소에 커밋하지 말고, 최초 로그인 후 비밀번호를 변경하세요.",
  ].join("\n"),
  { encoding: "utf8", mode: 0o600 },
);

console.log(
  JSON.stringify(
    {
      public_origin: PUBLIC_ORIGIN,
      accounts: resolvedAccounts.map((account) => ({
        email: account.email,
        role: account.role,
        profile_id: account.id,
        email_confirmed: true,
        data_origin: "production",
        exclude_from_influencer_discovery:
          account.excludeFromInfluencerDiscovery,
      })),
      advertiser_organization_id: workspace.organizationId,
      credentials_file: path.relative(process.cwd(), CREDENTIALS_PATH),
    },
    null,
    2,
  ),
);
