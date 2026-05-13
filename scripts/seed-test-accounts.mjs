import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const TEST_ACCOUNT_PASSWORD =
  process.env.QA_TEST_PASSWORD ?? "YeollockTest!2026";
const PUBLIC_SITE_URL = (
  process.env.PUBLIC_SITE_URL ??
  process.env.VITE_PUBLIC_SITE_URL ??
  "https://yeollock.me"
).replace(/\/$/, "");

const timestamp = new Date().toISOString();

const accounts = {
  advertiser: {
    email: "test.advertiser@yeollock.me",
    role: "marketer",
    name: "QA 광고주 매니저",
    company_name: "브레드룸 QA",
  },
  influencer: {
    email: "test.influencer@yeollock.me",
    role: "influencer",
    name: "QA 크리에이터 소라",
  },
};

const testHandles = {
  influencer: "qa_influencer",
  brand: "qa-test-brand",
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

const stableServerUuid = (seed) => {
  const hash = crypto
    .createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hash[12] = "5";
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

const removeRows = async (table, query, label = table) => {
  await rest(
    table,
    query,
    {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    },
    `${label} delete`,
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
        representative_name: "QA 대표자",
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

const ensureVerificationRecords = async ({ advertiser, influencer, organizationId }) => {
  const businessVerificationId = stableUuid(
    `qa:verification:advertiser:${organizationId}`,
  );

  await upsert(
    "verification_requests",
    [
      {
        id: businessVerificationId,
        target_type: "advertiser_organization",
        target_id: organizationId,
        verification_type: "business_registration_certificate",
        status: "approved",
        profile_id: advertiser.id,
        organization_id: organizationId,
        subject_name: accounts.advertiser.company_name,
        submitted_by_name: accounts.advertiser.name,
        submitted_by_email: advertiser.email,
        business_registration_number: "1234567890",
        representative_name: "QA 대표자",
        evidence_snapshot_json: { seeded: true, source: "seed-test-accounts" },
        ownership_check_status: "not_run",
        note: "QA advertiser verification seed",
        reviewed_by_name: "QA Seeder",
        reviewed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`qa:verification:influencer:instagram:${influencer.id}`),
        target_type: "influencer_account",
        target_id: influencer.id,
        verification_type: "platform_account",
        status: "approved",
        profile_id: influencer.id,
        subject_name: accounts.influencer.name,
        submitted_by_email: influencer.email,
        platform: "instagram",
        platform_handle: "qa.sora",
        platform_url: "https://instagram.com/qa.sora",
        ownership_verification_method: "profile_bio_code",
        ownership_challenge_code: "DS-QA26-SORA",
        ownership_challenge_url: "https://instagram.com/qa.sora",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: { seeded: true, platform: "instagram" },
        note: "QA influencer platform seed",
        reviewed_by_name: "QA Seeder",
        reviewed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`qa:verification:influencer:youtube:${influencer.id}`),
        target_type: "influencer_account",
        target_id: influencer.id,
        verification_type: "platform_account",
        status: "approved",
        profile_id: influencer.id,
        subject_name: accounts.influencer.name,
        submitted_by_email: influencer.email,
        platform: "youtube",
        platform_handle: "@qa_sora",
        platform_url: "https://youtube.com/@qa_sora",
        ownership_verification_method: "channel_description_code",
        ownership_challenge_code: "DS-QA26-SORA",
        ownership_challenge_url: "https://youtube.com/@qa_sora",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: { seeded: true, platform: "youtube" },
        note: "QA influencer platform seed",
        reviewed_by_name: "QA Seeder",
        reviewed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    "id",
    "verification requests",
  );

  await upsert(
    "organizations",
    [
      {
        id: organizationId,
        name: accounts.advertiser.company_name,
        organization_type: "advertiser",
        business_registration_number: "1234567890",
        representative_name: "QA 대표자",
        created_by_profile_id: advertiser.id,
        business_verification_request_id: businessVerificationId,
        business_verification_status: "approved",
        business_verified_at: timestamp,
        updated_at: timestamp,
      },
    ],
    "id",
    "organization verification link",
  );
};

const ensureMarketplaceProfiles = async ({ influencer, organizationId }) => {
  const influencerProfileId = stableServerUuid(
    `marketplace:influencer:${influencer.id}`,
  );
  const brandProfileId = stableUuid(`qa:marketplace:brand:${organizationId}`);

  await upsert(
    "marketplace_influencer_profiles",
    [
      {
        id: influencerProfileId,
        owner_profile_id: influencer.id,
        public_handle: testHandles.influencer,
        display_name: "QA 크리에이터 소라",
        headline: "뷰티와 테크 라이프스타일 제품을 빠르게 검증하는 QA 테스트 인플루언서",
        bio:
          "연락미 QA에서 광고주 컨택, 제안 저장, 전자계약 전환 흐름을 검증하기 위한 공개 프로필입니다. 릴스와 쇼츠 중심으로 제품 사용 장면과 조건 확인을 명확히 보여줍니다.",
        location: "서울 · 원격 협업",
        avatar_label: "QS",
        categories: ["뷰티", "테크", "라이프스타일"],
        audience: "20-34 실사용 후기 관심 고객",
        audience_tags: ["숏폼 리뷰", "신제품 테스트", "구매 전환", "계약 QA"],
        collaboration_types: ["sponsored_post", "product_seeding", "ppl"],
        starting_price_label: "120만원부터",
        response_time_label: "QA 기준 당일 응답",
        verified_label: "테스트 플랫폼 인증 완료",
        brand_fit: ["신제품 런칭", "릴스/쇼츠 리뷰", "사용감 중심", "계약 전환 테스트"],
        recent_brands: ["브레드룸 QA", "오브제스튜디오", "모노트립"],
        portfolio: [
          {
            title: "신제품 숏폼 리뷰 QA",
            brand: "브레드룸 QA",
            result: "제안 저장과 계약 생성 플로우 검증",
          },
          {
            title: "테크 소품 사용 후기",
            brand: "채널랩",
            result: "콘텐츠 조건 확인 체크리스트 검증",
          },
        ],
        proposal_hints: [
          "브랜드 소개와 광고 형태를 함께 보내면 테스트 제안 저장이 가능합니다.",
          "업로드 채널, 희망 일정, 콘텐츠 사용 범위를 포함해 주세요.",
          "최종 조건은 전자계약 단계에서 다시 확인합니다.",
        ],
        is_published: true,
        updated_at: timestamp,
      },
    ],
    "owner_profile_id",
    "marketplace influencer profile",
  );

  await removeRows(
    "marketplace_influencer_channels",
    `?profile_id=eq.${encodeURIComponent(influencerProfileId)}`,
    "marketplace influencer channels",
  );

  await upsert(
    "marketplace_influencer_channels",
    [
      {
        id: stableUuid(`qa:marketplace:channel:instagram:${influencerProfileId}`),
        profile_id: influencerProfileId,
        platform: "instagram",
        label: "릴스",
        handle: "qa.sora",
        url: "https://instagram.com/qa.sora",
        followers_label: "8.1만",
        performance_label: "평균 조회 2.9만",
        sort_order: 0,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`qa:marketplace:channel:youtube:${influencerProfileId}`),
        profile_id: influencerProfileId,
        platform: "youtube",
        label: "쇼츠",
        handle: "@qa_sora",
        url: "https://youtube.com/@qa_sora",
        followers_label: "2.4만",
        performance_label: "완주율 41%",
        sort_order: 1,
        updated_at: timestamp,
      },
    ],
    "id",
    "marketplace influencer channels",
  );

  await upsert(
    "marketplace_brand_profiles",
    [
      {
        id: brandProfileId,
        organization_id: organizationId,
        public_handle: testHandles.brand,
        display_name: "브레드룸 QA",
        category: "뷰티 · 라이프스타일",
        headline: "신제품 런칭과 숏폼 전환 테스트를 함께할 QA 브랜드",
        description:
          "인플루언서가 입점 브랜드를 둘러보고 역제안할 수 있는지 확인하기 위한 테스트 광고주 프로필입니다. 브랜드 소개, 광고 형태, 예산 범위가 공개 프로필에서 바로 보이도록 구성했습니다.",
        location: "서울 성수 · 온라인",
        logo_label: "BQ",
        preferred_platforms: ["instagram", "youtube", "naver_blog"],
        proposal_types: ["sponsored_post", "product_seeding", "ppl"],
        budget_range_label: "100만-450만원",
        response_time_label: "QA 기준 1영업일 내 확인",
        status_label: "테스트 입점 브랜드",
        fit_tags: ["뷰티 신제품", "릴스/쇼츠", "사용 후기", "계약 전환 테스트"],
        audience_targets: ["20-34 뷰티 관심 고객", "데일리 루틴", "선물 구매층"],
        active_campaigns: [
          {
            title: "QA 신제품 언박싱 릴스",
            type: "sponsored_post",
            budget: "180만-280만원",
          },
          {
            title: "QA 파우치 필수템 리뷰",
            type: "product_seeding",
            budget: "제품 제공 + 제작비",
          },
        ],
        recent_creators: ["QA 크리에이터 소라", "제우", "민서홈"],
        is_published: true,
        updated_at: timestamp,
      },
    ],
    "organization_id",
    "marketplace brand profile",
  );

  return {
    influencerProfileId,
    brandProfileId,
    links: {
      influencer_profile: `${PUBLIC_SITE_URL}/${testHandles.influencer}`,
      advertiser_brand_profile: `${PUBLIC_SITE_URL}/brands/${testHandles.brand}`,
      advertiser_discovery: `${PUBLIC_SITE_URL}/advertiser/discover`,
      influencer_brand_discovery: `${PUBLIC_SITE_URL}/influencer/brands`,
    },
  };
};

const advertiser = await ensureAuthUser(accounts.advertiser);
const influencer = await ensureAuthUser(accounts.influencer);
const { organizationId } = await ensureProfilesAndOrganization(
  advertiser,
  influencer,
);
await ensureVerificationRecords({ advertiser, influencer, organizationId });
const marketplace = await ensureMarketplaceProfiles({
  influencer,
  organizationId,
});

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
      password: {
        configured_by: "QA_TEST_PASSWORD",
        printed: false,
      },
      organization_id: organizationId,
      marketplace_profiles: {
        influencer_profile_id: marketplace.influencerProfileId,
        advertiser_brand_profile_id: marketplace.brandProfileId,
        links: marketplace.links,
      },
    },
    null,
    2,
  ),
);
