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
const DASHBOARD_BASE_URL = (
  process.env.DASHBOARD_BASE_URL ??
  process.env.QA_BASE_URL ??
  PUBLIC_SITE_URL
).replace(/\/$/, "");
const LEGACY_CONTRACTS_TABLE =
  process.env.SUPABASE_CONTRACTS_TABLE ?? "directsign_contracts";
const ALLOW_PRODUCTION_TEST_DATA =
  process.env.YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA === "true";

const isProductionHost = (value) =>
  /^https:\/\/(www\.)?yeollock\.me$/i.test(value);

if (
  !ALLOW_PRODUCTION_TEST_DATA &&
  (isProductionHost(PUBLIC_SITE_URL) || isProductionHost(DASHBOARD_BASE_URL))
) {
  throw new Error(
    "Production test data seeding is blocked. Set QA_BASE_URL/DASHBOARD_BASE_URL to a non-production target, or set YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA=true for an approved one-time run.",
  );
}

const timestamp = new Date().toISOString();

const accounts = {
  advertiser: {
    email: "breadroom.manager@yeollock.me",
    role: "marketer",
    name: "광고주 매니저",
    company_name: "브레드룸",
  },
  influencer: {
    email: "creator.sora@yeollock.me",
    role: "influencer",
    name: "크리에이터 소라",
    avatar_url: "/images/influencers/creator-sora.png",
  },
};

const testHandles = {
  influencer: "creator-sora",
  brand: "breadroom-partner",
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

const findByPublicHandle = async (table, handle, label = table) => {
  const rows = await rest(
    table,
    `?select=id&public_handle=eq.${encodeURIComponent(handle)}&limit=1`,
    {},
    `${label} select`,
  );
  return Array.isArray(rows) ? rows[0] : null;
};

const patchById = async (table, id, row, label = table) => {
  await rest(
    table,
    `?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row),
    },
    `${label} update`,
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
        avatar_url: accounts.influencer.avatar_url,
        company_name: null,
        activity_categories: ["lifestyle", "beauty", "tech"],
        activity_platforms: ["instagram", "youtube", "tiktok", "naver_blog"],
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
        representative_name: "브레드룸 대표",
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
        representative_name: "브레드룸 대표",
        evidence_snapshot_json: { seeded: true, source: "seed-test-accounts" },
        ownership_check_status: "not_run",
        note: "승인된 사업자 인증 데이터",
        reviewed_by_name: "운영자",
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
        platform_handle: "creator.sora",
        platform_url: "https://instagram.com/creator.sora",
        ownership_verification_method: "profile_bio_code",
        ownership_challenge_code: "DS-SORA-0526",
        ownership_challenge_url: "https://instagram.com/creator.sora",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: { seeded: true, platform: "instagram" },
        note: "승인된 플랫폼 계정 인증 데이터",
        reviewed_by_name: "운영자",
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
        platform_handle: "@creator_sora",
        platform_url: "https://youtube.com/@creator_sora",
        ownership_verification_method: "channel_description_code",
        ownership_challenge_code: "DS-SORA-0526",
        ownership_challenge_url: "https://youtube.com/@creator_sora",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: { seeded: true, platform: "youtube" },
        note: "승인된 플랫폼 계정 인증 데이터",
        reviewed_by_name: "운영자",
        reviewed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`qa:verification:influencer:tiktok:${influencer.id}`),
        target_type: "influencer_account",
        target_id: influencer.id,
        verification_type: "platform_account",
        status: "approved",
        profile_id: influencer.id,
        subject_name: accounts.influencer.name,
        submitted_by_email: influencer.email,
        platform: "tiktok",
        platform_handle: "@creator.sora",
        platform_url: "https://www.tiktok.com/@creator.sora",
        ownership_verification_method: "profile_bio_code",
        ownership_challenge_code: "DS-SORA-0526",
        ownership_challenge_url: "https://www.tiktok.com/@creator.sora",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: { seeded: true, platform: "tiktok" },
        note: "승인된 플랫폼 계정 인증 데이터",
        reviewed_by_name: "운영자",
        reviewed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`qa:verification:influencer:naver_blog:${influencer.id}`),
        target_type: "influencer_account",
        target_id: influencer.id,
        verification_type: "platform_account",
        status: "approved",
        profile_id: influencer.id,
        subject_name: accounts.influencer.name,
        submitted_by_email: influencer.email,
        platform: "naver_blog",
        platform_handle: "creator_sora",
        platform_url: "https://blog.naver.com/creator_sora",
        ownership_verification_method: "profile_bio_code",
        ownership_challenge_code: "DS-SORA-0526",
        ownership_challenge_url: "https://blog.naver.com/creator_sora",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: { seeded: true, platform: "naver_blog" },
        note: "승인된 플랫폼 계정 인증 데이터",
        reviewed_by_name: "운영자",
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
        representative_name: "브레드룸 대표",
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
  const existingInfluencerProfile = await findByPublicHandle(
    "marketplace_influencer_profiles",
    testHandles.influencer,
    "marketplace influencer profile",
  );
  const existingBrandProfile = await findByPublicHandle(
    "marketplace_brand_profiles",
    testHandles.brand,
    "marketplace brand profile",
  );
  const influencerProfileId =
    existingInfluencerProfile?.id ??
    stableServerUuid(`marketplace:influencer:${influencer.id}`);
  const brandProfileId =
    existingBrandProfile?.id ?? stableUuid(`qa:marketplace:brand:${organizationId}`);

  const influencerProfileRow = {
        id: influencerProfileId,
        owner_profile_id: influencer.id,
        public_handle: testHandles.influencer,
        display_name: "크리에이터 소라",
        headline: "릴스와 쇼츠 중심으로 제품 사용 장면을 만드는 크리에이터",
        bio:
          "뷰티와 라이프스타일 제품의 실제 사용 장면을 릴스와 쇼츠로 자연스럽게 보여줍니다. 초안 검토와 수정 요청을 계약 안에서 정리하는 협업을 선호합니다.",
        location: "서울 · 원격 협업",
        avatar_label: "소",
        avatar_url: accounts.influencer.avatar_url,
        categories: ["뷰티", "라이프스타일"],
        audience: "20-34 실사용 후기 관심 고객",
        audience_tags: ["숏폼 리뷰", "신제품 사용감", "구매 전환"],
        collaboration_types: ["sponsored_post", "product_seeding", "ppl"],
        starting_price_label: "협의 가능",
        response_time_label: "당일 응답",
        verified_label: "플랫폼 인증 완료",
        brand_fit: ["캠페인 지원", "릴스/쇼츠 리뷰", "사용감 중심"],
        recent_brands: ["브레드룸", "오브레"],
        portfolio: [
          {
            title: "신제품 숏폼 리뷰",
            brand: "브레드룸",
            result: "제품 사용 장면 중심의 릴스 콘텐츠 제작",
          },
        ],
        proposal_hints: [
          "캠페인 조건과 업로드 일정을 확인한 뒤 신청합니다.",
          "콘텐츠 사용 범위와 검수 일정을 계약서에 함께 정리합니다.",
        ],
        is_published: true,
        updated_at: timestamp,
      };

  if (existingInfluencerProfile) {
    await patchById(
      "marketplace_influencer_profiles",
      influencerProfileId,
      influencerProfileRow,
      "marketplace influencer profile",
    );
  } else {
    await upsert(
      "marketplace_influencer_profiles",
      [influencerProfileRow],
      "owner_profile_id",
      "marketplace influencer profile",
    );
  }

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
        label: "인스타",
        handle: "@creator_sora",
        url: "https://instagram.com/creator.sora",
        followers_label: "8.1만",
        performance_label: "캠페인 지원 가능",
        sort_order: 0,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`qa:marketplace:channel:youtube:${influencerProfileId}`),
        profile_id: influencerProfileId,
        platform: "youtube",
        label: "유튜브",
        handle: "@creator_sora",
        url: "https://youtube.com/@creator_sora",
        followers_label: "8.1만",
        performance_label: "캠페인 지원 가능",
        sort_order: 1,
        updated_at: timestamp,
      },
    ],
    "id",
    "marketplace influencer channels",
  );

  const brandProfileRow = {
        id: brandProfileId,
        organization_id: organizationId,
        public_handle: testHandles.brand,
        display_name: "브레드룸",
        category: "뷰티 · 라이프스타일",
        headline: "신제품 런칭과 숏폼 전환을 함께할 브랜드",
        description:
          "인플루언서가 입점 브랜드를 둘러보고 역제안할 수 있도록 구성한 광고주 프로필입니다. 브랜드 소개, 광고 형태, 예산 범위가 공개 프로필에서 바로 보이도록 구성했습니다.",
        location: "서울 성수 · 온라인",
        logo_label: "BQ",
        logo_url: "/images/brands/breadroom-logo.png",
        preferred_platforms: ["instagram", "youtube", "naver_blog"],
        proposal_types: ["sponsored_post", "product_seeding", "supporters", "ppl"],
        budget_range_label: "100만-450만원",
        response_time_label: "1영업일 내 확인",
        status_label: "입점 브랜드",
        fit_tags: ["뷰티 신제품", "릴스/쇼츠", "사용 후기", "계약 전환"],
        audience_targets: ["20-34 뷰티 관심 고객", "데일리 루틴", "선물 구매층"],
        active_campaigns: [
          {
            id: stableUuid("qa:campaign:breadroom:suncare-reels-recruiting"),
            title: "브레드룸 선케어 릴스 모집",
            type: "sponsored_post",
            applicantLimit: "10명",
            budget: "1,500,000원 + 제품 제공",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(3),
            uploadDeadline: dateOnly(12),
            platforms: ["instagram"],
            deliverables: ["인스타그램 릴스 1건", "스토리 2건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:seongsu-popup-recruiting"),
            title: "성수 팝업 숏폼 모집",
            type: "visit_review",
            applicantLimit: "10명",
            budget: "2,200,000원",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(5),
            uploadDeadline: dateOnly(14),
            platforms: ["instagram", "tiktok"],
            deliverables: ["인스타그램 릴스 1건", "틱톡 숏폼 1건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:homecare-blog-recruiting"),
            title: "홈케어 서포터즈 블로그 모집",
            type: "supporters",
            applicantLimit: "10명",
            budget: "제품 제공(소비자가 86,000원 상당)",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(8),
            uploadDeadline: dateOnly(18),
            platforms: ["naver_blog"],
            deliverables: ["네이버 블로그 후기 1건", "게시 유지 미션"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:summer-routine"),
            title: "브레드룸 여름 루틴 캠페인",
            type: "sponsored_post",
            applicantLimit: "10명",
            budget: "900,000원 + 제품 제공",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(11),
            uploadDeadline: dateOnly(21),
            platforms: ["instagram"],
            deliverables: ["인스타그램 릴스 1건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:unboxing-reels"),
            title: "브레드룸 신제품 언박싱 릴스",
            type: "sponsored_post",
            applicantLimit: "10명",
            budget: "2,400,000원",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(14),
            uploadDeadline: dateOnly(28),
            platforms: ["instagram"],
            deliverables: ["인스타그램 릴스 1건", "스토리 2건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:pouch-shorts"),
            title: "파우치 필수템 쇼츠 리뷰",
            type: "ppl",
            applicantLimit: "10명",
            budget: "3,200,000원",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(4),
            uploadDeadline: dateOnly(16),
            platforms: ["youtube", "instagram"],
            deliverables: ["유튜브 쇼츠 1건", "인스타그램 스토리 2건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:daily-routine-blog"),
            title: "데일리 루틴 블로그 리뷰",
            type: "product_seeding",
            applicantLimit: "10명",
            budget: "1,800,000원",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(6),
            uploadDeadline: dateOnly(15),
            platforms: ["naver_blog"],
            deliverables: ["네이버 블로그 상세 리뷰 1건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:seongsu-popup-visit"),
            title: "성수 팝업 방문 릴스",
            type: "visit_review",
            applicantLimit: "10명",
            budget: "2,100,000원",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(9),
            uploadDeadline: dateOnly(19),
            platforms: ["instagram"],
            deliverables: ["인스타그램 릴스 1건", "틱톡 숏폼 1건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:night-care-shorts"),
            title: "나이트 케어 쇼츠 패키지",
            type: "ppl",
            applicantLimit: "10명",
            budget: "2,800,000원",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(13),
            uploadDeadline: dateOnly(24),
            platforms: ["youtube"],
            deliverables: ["유튜브 쇼츠 1건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:breadroom:groupbuy-pilot"),
            title: "브레드룸 공동구매 파일럿",
            type: "group_buy",
            applicantLimit: "10명",
            budget: "수수료 18%",
            thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
            deadline: dateOnly(16),
            uploadDeadline: dateOnly(30),
            platforms: ["naver_blog"],
            deliverables: ["네이버 블로그 리뷰 1건", "인스타그램 스토리 2건"],
            status: "open",
          },
          {
            id: stableUuid("qa:campaign:obre:reels-ended"),
            title: "오브레 릴스 캠페인",
            type: "sponsored_post",
            applicantLimit: "10명",
            budget: "1,800,000원",
            deadline: dateOnly(-7),
            uploadDeadline: dateOnly(-3),
            platforms: ["instagram"],
            deliverables: ["인스타그램 릴스 1건", "스토리 2건"],
            status: "ended",
            endedAt: dateOnly(-3),
          },
          {
            id: stableUuid("qa:campaign:brewinglab:groupbuy-ended"),
            title: "브루잉랩 공동구매 파일럿",
            type: "group_buy",
            applicantLimit: "10명",
            budget: "수수료 18%",
            deadline: dateOnly(-10),
            uploadDeadline: dateOnly(-5),
            platforms: ["naver_blog"],
            deliverables: ["네이버 블로그 리뷰 1건", "공동구매 링크 1건"],
            status: "ended",
            endedAt: dateOnly(-5),
          },
        ],
        recent_creators: ["크리에이터 소라", "민서홈", "유나뷰티", "리뷰제이"],
        is_published: true,
        updated_at: timestamp,
      };

  if (existingBrandProfile) {
    await patchById(
      "marketplace_brand_profiles",
      brandProfileId,
      brandProfileRow,
      "marketplace brand profile",
    );
  } else {
    await upsert(
      "marketplace_brand_profiles",
      [brandProfileRow],
      "organization_id",
      "marketplace brand profile",
    );
  }

  return {
    influencerProfileId,
    brandProfileId,
    campaigns: brandProfileRow.active_campaigns,
    links: {
      influencer_profile: `${PUBLIC_SITE_URL}/${testHandles.influencer}`,
      advertiser_brand_profile: `${PUBLIC_SITE_URL}/brands/${testHandles.brand}`,
      advertiser_discovery: `${PUBLIC_SITE_URL}/advertiser/discover`,
      influencer_brand_discovery: `${PUBLIC_SITE_URL}/influencer/brands`,
    },
  };
};

const signatureImageDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const showcaseBatch = `showcase-${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

const getSeedDate = (days, hour = 12) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const addDays = (days, hour) => {
  const date = getSeedDate(days, hour);
  return date.toISOString();
};

const formatDateOnly = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const dateOnly = (days) => {
  const date = getSeedDate(days);
  return formatDateOnly(date);
};
const shareToken = () => crypto.randomUUID().replaceAll("-", "");
const postgrestInFilter = (values) =>
  `(${values.map((value) => encodeURIComponent(value)).join(",")})`;

const chunkValues = (values, size = 40) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const getSetCookies = (response) => {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*(?:directsign_|yeollock_))/g) : [];
};

const cookieHeaderFrom = (response) =>
  getSetCookies(response)
    .map((cookie) => cookie.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

const appJson = async (path, init = {}, label = path) => {
  const response = await fetch(`${DASHBOARD_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  return parseJsonResponse(response, label);
};

const login = async (path, email) => {
  const response = await fetch(`${DASHBOARD_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: TEST_ACCOUNT_PASSWORD }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${body.slice(0, 700)}`);
  }
  const cookie = cookieHeaderFrom(response);
  if (!cookie) throw new Error(`${path} did not return session cookies`);
  return { cookie, body: JSON.parse(body) };
};

const archiveV2Contracts = async (contractIds) => {
  for (const ids of chunkValues(contractIds)) {
    if (ids.length === 0) continue;
    await rest(
      "contracts",
      `?id=in.${postgrestInFilter(ids)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          deleted_at: timestamp,
          updated_at: timestamp,
        }),
      },
      "showcase v2 contract archive",
    );
  }
};

const deleteLegacyContracts = async (contractIds) => {
  for (const ids of chunkValues(contractIds)) {
    if (ids.length === 0) continue;
    await removeRows(
      LEGACY_CONTRACTS_TABLE,
      `?id=in.${postgrestInFilter(ids)}`,
      "showcase legacy contract cleanup",
    );
  }
};

const clearMarketplaceMessages = async ({ advertiser, influencer, marketplace }) => {
  await removeRows(
    "marketplace_contact_proposals",
    `?sender_profile_id=eq.${encodeURIComponent(advertiser.id)}`,
    "showcase advertiser proposal cleanup",
  );
  await removeRows(
    "marketplace_contact_proposals",
    `?sender_profile_id=eq.${encodeURIComponent(influencer.id)}`,
    "showcase influencer proposal cleanup",
  );
  await removeRows(
    "marketplace_contact_proposals",
    `?target_influencer_profile_id=eq.${encodeURIComponent(marketplace.influencerProfileId)}`,
    "showcase influencer target proposal cleanup",
  );
  await removeRows(
    "marketplace_contact_proposals",
    `?target_brand_profile_id=eq.${encodeURIComponent(marketplace.brandProfileId)}`,
    "showcase brand target proposal cleanup",
  );
};

const cleanupDashboardShowcaseData = async ({
  advertiser,
  influencer,
  marketplace,
  advertiserCookie,
}) => {
  const data = await appJson(
    "/api/contracts",
    { headers: { Cookie: advertiserCookie } },
    "advertiser contract list before showcase cleanup",
  );
  const existingContracts = Array.isArray(data.contracts) ? data.contracts : [];
  const contractIds = [
    ...new Set(
      existingContracts
        .filter(
          (contract) =>
            contract.advertiser_id === advertiser.id ||
            contract.influencer_info?.contact === influencer.email ||
            contract.advertiser_info?.name === accounts.advertiser.company_name,
        )
        .map((contract) => contract.id)
        .filter(Boolean),
    ),
  ];

  await archiveV2Contracts(contractIds);
  await deleteLegacyContracts(contractIds);
  await clearMarketplaceMessages({ advertiser, influencer, marketplace });

  return { archivedContracts: contractIds.length };
};

const showcaseScenarios = [
  {
    key: "draft-minseo",
    title: "브레드룸 여름 루틴 릴스 계약서 초안",
    campaignName: "브레드룸 여름 루틴 캠페인",
    influencerName: "민서홈",
    influencerContact: "minseo.home@example.com",
    channelUrl: "https://instagram.com/minseo.home",
    type: "협찬",
    status: "DRAFT",
    nextActor: "advertiser",
    nextAction: "조건을 확인한 뒤 검토 링크를 발송하세요.",
    budget: "900,000원 + 제품 제공",
    platforms: ["INSTAGRAM"],
    deliverables: ["인스타그램 릴스 1건"],
    dueDays: 5,
    risk: "low",
    clauses: "draft",
  },
  {
    key: "review-reels",
    title: "브레드룸 신제품 언박싱 릴스 계약서",
    campaignName: "브레드룸 신제품 언박싱 릴스",
    influencerName: accounts.influencer.name,
    influencerContact: accounts.influencer.email,
    channelUrl: "https://instagram.com/creator.sora",
    type: "협찬",
    status: "REVIEWING",
    nextActor: "influencer",
    nextAction: "크리에이터가 조항을 검토하고 있습니다.",
    lastMessage: "필수 표현과 사용 기간을 검토 중입니다.",
    budget: "2,400,000원",
    platforms: ["INSTAGRAM"],
    deliverables: ["인스타그램 릴스 1건", "스토리 2건"],
    dueDays: 2,
    risk: "medium",
    clauses: "review",
  },
  {
    key: "negotiating-shorts",
    title: "파우치 필수템 쇼츠 리뷰 수정 협의",
    campaignName: "파우치 필수템 쇼츠 리뷰",
    influencerName: accounts.influencer.name,
    influencerContact: accounts.influencer.email,
    channelUrl: "https://youtube.com/@creator_sora",
    type: "PPL",
    status: "NEGOTIATING",
    nextActor: "advertiser",
    nextAction: "수정 요청한 사용 기간과 2차 활용 범위를 답변하세요.",
    lastMessage: "2차 활용 기간을 3개월로 줄여 달라는 요청이 있습니다.",
    budget: "3,200,000원",
    platforms: ["YOUTUBE", "INSTAGRAM"],
    deliverables: ["유튜브 쇼츠 1건", "인스타그램 스토리 2건"],
    dueDays: 1,
    risk: "high",
    clauses: "change",
  },
  {
    key: "ready-blog",
    title: "데일리 루틴 블로그 리뷰 최종본",
    campaignName: "데일리 루틴 블로그 리뷰",
    influencerName: accounts.influencer.name,
    influencerContact: accounts.influencer.email,
    channelUrl: "https://blog.naver.com/creator_sora",
    type: "협찬",
    status: "APPROVED",
    nextActor: "influencer",
    nextAction: "최종본을 확인하고 전자서명을 완료하세요.",
    budget: "1,800,000원",
    platforms: ["NAVER_BLOG"],
    deliverables: ["네이버 블로그 상세 리뷰 1건"],
    dueDays: 3,
    risk: "medium",
    clauses: "approved",
  },
  {
    key: "due-popup",
    title: "성수 팝업 방문 릴스 콘텐츠 제출",
    campaignName: "성수 팝업 방문 릴스",
    influencerName: accounts.influencer.name,
    influencerContact: accounts.influencer.email,
    channelUrl: "https://instagram.com/creator.sora",
    type: "협찬",
    status: "APPROVED",
    nextActor: "influencer",
    nextAction: "서명 완료 후 콘텐츠 링크나 증빙 파일을 제출하세요.",
    budget: "2,100,000원",
    platforms: ["INSTAGRAM"],
    deliverables: ["인스타그램 릴스 1건", "틱톡 숏폼 1건"],
    dueDays: 4,
    risk: "medium",
    clauses: "approved",
    sign: true,
  },
  {
    key: "review-submitted",
    title: "나이트 케어 쇼츠 검수 대기",
    campaignName: "나이트 케어 쇼츠 패키지",
    influencerName: accounts.influencer.name,
    influencerContact: accounts.influencer.email,
    channelUrl: "https://youtube.com/@creator_sora",
    type: "PPL",
    status: "APPROVED",
    nextActor: "influencer",
    nextAction: "제출한 콘텐츠를 광고주가 검수하고 있습니다.",
    budget: "2,800,000원",
    platforms: ["YOUTUBE"],
    deliverables: ["유튜브 쇼츠 1건"],
    dueDays: 6,
    risk: "low",
    clauses: "approved",
    sign: true,
    submitDeliverable: true,
  },
  {
    key: "completed-groupbuy",
    title: "공동구매 파일럿 콘텐츠 검수 완료",
    campaignName: "브레드룸 공동구매 파일럿",
    influencerName: accounts.influencer.name,
    influencerContact: accounts.influencer.email,
    channelUrl: "https://blog.naver.com/creator_sora",
    type: "공동구매",
    status: "APPROVED",
    nextActor: "system",
    nextAction: "서명본과 검수 기록을 보관하세요.",
    budget: "수수료 18%",
    platforms: ["NAVER_BLOG"],
    deliverables: ["네이버 블로그 리뷰 1건", "인스타그램 스토리 2건"],
    dueDays: 7,
    risk: "low",
    clauses: "approved",
    sign: true,
    submitDeliverable: true,
    approveDeliverable: true,
  },
  {
    key: "closed-reels",
    title: "오브레 릴스 정산 완료 계약",
    campaignName: "오브레 릴스 캠페인",
    influencerName: accounts.influencer.name,
    influencerContact: accounts.influencer.email,
    channelUrl: "https://instagram.com/creator.sora",
    type: "협찬",
    status: "APPROVED",
    nextActor: "system",
    nextAction: "계약 종료 후 서명본과 검수 기록을 보관합니다.",
    budget: "1,800,000원",
    platforms: ["INSTAGRAM"],
    deliverables: ["인스타그램 릴스 1건", "스토리 2건"],
    dueDays: -7,
    endDays: -3,
    completedDays: -3,
    risk: "low",
    clauses: "approved",
    sign: true,
    submitDeliverable: true,
    approveDeliverable: true,
    closeContract: true,
  },
  {
    key: "closed-blog",
    title: "브루잉랩 공동구매 계약 종료",
    campaignName: "브루잉랩 공동구매 파일럿",
    influencerName: accounts.influencer.name,
    influencerContact: accounts.influencer.email,
    channelUrl: "https://blog.naver.com/creator_sora",
    type: "공동구매",
    status: "APPROVED",
    nextActor: "system",
    nextAction: "계약 종료 후 정산 증빙을 보관합니다.",
    budget: "수수료 18%",
    platforms: ["NAVER_BLOG"],
    deliverables: ["네이버 블로그 리뷰 1건", "공동구매 링크 1건"],
    dueDays: -10,
    endDays: -5,
    completedDays: -5,
    risk: "low",
    clauses: "approved",
    sign: true,
    submitDeliverable: true,
    approveDeliverable: true,
    closeContract: true,
  },
];

const seedPlatformLabels = {
  instagram: "인스타",
  youtube: "유튜브",
  tiktok: "틱톡",
  naver_blog: "블로그",
  other: "기타",
};

const campaignDashboardApplicantProfiles = [
  {
    name: "크리에이터 소라",
    handle: "creator-sora",
    email: "creator.sora@yeollock.me",
    avatarUrl: "/images/influencers/creator-sora.png",
    headline: "릴스와 쇼츠 중심으로 제품 사용 장면을 만드는 크리에이터",
    categories: ["뷰티", "라이프스타일"],
    followersLabel: "8.1만",
  },
  {
    name: "민서홈",
    handle: "minseo-home",
    email: "minseo.home@yeollock.me",
    avatarUrl: "/images/influencers/minseo-home.png",
    headline: "홈케어와 리빙 제품을 자연스럽게 소개합니다",
    categories: ["리빙", "라이프스타일"],
    followersLabel: "6.3만",
  },
  {
    name: "유나뷰티",
    handle: "yuna-beauty",
    email: "yuna.beauty@yeollock.me",
    avatarUrl: "/images/influencers/minseo-home.png",
    headline: "뷰티 릴스와 사용감 리뷰를 만드는 크리에이터",
    categories: ["뷰티", "라이프스타일"],
    followersLabel: "8.7만",
  },
  {
    name: "리뷰제이",
    handle: "review-j",
    email: "review.j@yeollock.me",
    avatarUrl: "/images/influencers/today-taste.png",
    headline: "제품 비교와 블로그 후기를 함께 운영하는 리뷰어",
    categories: ["리뷰", "라이프스타일"],
    followersLabel: "5.9만",
  },
  {
    name: "온리루틴",
    handle: "only-routine",
    email: "only.routine@yeollock.me",
    avatarUrl: "/images/influencers/haru-fit.png",
    headline: "데일리 루틴과 숏폼 챌린지에 강한 크리에이터",
    categories: ["라이프스타일", "뷰티"],
    followersLabel: "7.1만",
  },
  {
    name: "하린로그",
    handle: "harin-log",
    email: "harin.log@yeollock.me",
    avatarUrl: "/images/influencers/ziyu-log.png",
    headline: "브랜드 톤을 살린 릴스와 브이로그를 제작합니다",
    categories: ["뷰티", "패션"],
    followersLabel: "6.4만",
  },
  {
    name: "모아리뷰",
    handle: "moa-review",
    email: "moa.review@yeollock.me",
    avatarUrl: "/images/influencers/luna-day.png",
    headline: "생활 제품의 장단점을 간결하게 정리하는 리뷰어",
    categories: ["리빙", "리뷰"],
    followersLabel: "4.8만",
  },
  {
    name: "수아픽",
    handle: "sua-pick",
    email: "sua.pick@yeollock.me",
    avatarUrl: "/images/influencers/rooday.png",
    headline: "감도 있는 제품 컷과 피드 콘텐츠를 제작합니다",
    categories: ["뷰티", "패션"],
    followersLabel: "9.2만",
  },
  {
    name: "라온뷰티",
    handle: "raon-beauty",
    email: "raon.beauty@yeollock.me",
    avatarUrl: "/images/influencers/zeu-k.png",
    headline: "선케어와 메이크업 제품 리뷰에 집중합니다",
    categories: ["뷰티"],
    followersLabel: "6.8만",
  },
  {
    name: "지안홈",
    handle: "jian-home",
    email: "jian.home@yeollock.me",
    avatarUrl: "/images/influencers/channel-ove.png",
    headline: "홈케어와 리빙 제품을 자연스럽게 소개합니다",
    categories: ["리빙", "라이프스타일"],
    followersLabel: "3.9만",
  },
  {
    name: "세린데일리",
    handle: "serin-daily",
    email: "serin.daily@yeollock.me",
    avatarUrl: "/images/influencers/minseo-home.png",
    headline: "일상 속 사용 장면을 안정적으로 담는 크리에이터",
    categories: ["라이프스타일", "뷰티"],
    followersLabel: "5.2만",
  },
  {
    name: "나래숏폼",
    handle: "narae-shorts",
    email: "narae.shorts@yeollock.me",
    avatarUrl: "/images/influencers/today-taste.png",
    headline: "짧고 빠른 숏폼 전환 콘텐츠를 제작합니다",
    categories: ["숏폼", "뷰티"],
    followersLabel: "11.4만",
  },
  {
    name: "로미리뷰",
    handle: "romi-review",
    email: "romi.review@yeollock.me",
    avatarUrl: "/images/influencers/haru-fit.png",
    headline: "제품 체험 후기를 설득력 있게 풀어냅니다",
    categories: ["리뷰", "뷰티"],
    followersLabel: "4.5만",
  },
  {
    name: "소담픽",
    handle: "sodam-pick",
    email: "sodam.pick@yeollock.me",
    avatarUrl: "/images/influencers/ziyu-log.png",
    headline: "선물 추천과 데일리 제품 큐레이션을 운영합니다",
    categories: ["라이프스타일", "리빙"],
    followersLabel: "5.6만",
  },
];

const campaignDashboardApplicantPool = campaignDashboardApplicantProfiles.map(
  (profile) => profile.name,
);

const campaignDashboardApplicantProfileByName = new Map(
  campaignDashboardApplicantProfiles.map((profile) => [profile.name, profile]),
);

const campaignDashboardApplicationFixtures = [
  {
    campaignTitle: "브레드룸 선케어 릴스 모집",
    applicantCount: 4,
    statuses: ["submitted", "submitted", "reviewed", "submitted"],
    ageDays: 1,
  },
  {
    campaignTitle: "성수 팝업 숏폼 모집",
    applicantCount: 12,
    statuses: ["submitted", "reviewed", "submitted", "submitted", "reviewed"],
    ageDays: 3,
  },
  {
    campaignTitle: "홈케어 서포터즈 블로그 모집",
    applicantCount: 2,
    statuses: ["submitted", "submitted"],
    ageDays: 5,
  },
  {
    campaignTitle: "브레드룸 여름 루틴 캠페인",
    applicantCount: 4,
    convertedName: "민서홈",
    statuses: ["converted_to_contract", "submitted", "reviewed", "submitted"],
    ageDays: 6,
  },
  {
    campaignTitle: "브레드룸 신제품 언박싱 릴스",
    applicantCount: 6,
    convertedName: accounts.influencer.name,
    statuses: ["converted_to_contract", "submitted", "submitted", "reviewed", "submitted"],
    ageDays: 7,
  },
  {
    campaignTitle: "파우치 필수템 쇼츠 리뷰",
    applicantCount: 8,
    convertedName: accounts.influencer.name,
    statuses: ["converted_to_contract", "reviewed", "submitted", "submitted"],
    ageDays: 8,
  },
  {
    campaignTitle: "데일리 루틴 블로그 리뷰",
    applicantCount: 3,
    convertedName: accounts.influencer.name,
    statuses: ["converted_to_contract", "submitted", "reviewed"],
    ageDays: 9,
  },
  {
    campaignTitle: "성수 팝업 방문 릴스",
    applicantCount: 5,
    convertedName: accounts.influencer.name,
    statuses: ["converted_to_contract", "submitted", "submitted", "reviewed"],
    ageDays: 10,
  },
  {
    campaignTitle: "나이트 케어 쇼츠 패키지",
    applicantCount: 2,
    convertedName: accounts.influencer.name,
    statuses: ["converted_to_contract", "submitted"],
    ageDays: 11,
  },
  {
    campaignTitle: "브레드룸 공동구매 파일럿",
    applicantCount: 9,
    convertedName: accounts.influencer.name,
    statuses: ["converted_to_contract", "reviewed", "submitted", "submitted", "reviewed"],
    ageDays: 12,
  },
  {
    campaignTitle: "오브레 릴스 캠페인",
    applicantCount: 5,
    convertedName: accounts.influencer.name,
    statuses: ["closed", "closed", "closed", "reviewed", "submitted"],
    ageDays: 18,
  },
  {
    campaignTitle: "브루잉랩 공동구매 파일럿",
    applicantCount: 3,
    convertedName: accounts.influencer.name,
    statuses: ["closed", "closed", "reviewed"],
    ageDays: 22,
  },
];

const clauseStatusFor = (scenario, index) => {
  if (scenario.clauses === "approved") return "APPROVED";
  if (scenario.clauses === "change" && index === 2) return "MODIFICATION_REQUESTED";
  return "PENDING_REVIEW";
};

const buildShowcaseClauses = (scenario) =>
  [
    {
      clause_id: "scope",
      category: "산출물",
      content: `${scenario.deliverables.join(", ")}을 지정 채널에 업로드합니다.`,
    },
    {
      clause_id: "schedule",
      category: "일정",
      content: `${dateOnly(1)}부터 ${dateOnly(21)}까지 제작, 검수, 업로드를 진행합니다.`,
    },
    {
      clause_id: "usage",
      category: "콘텐츠 사용",
      content: "광고주는 계약 기간 동안 브랜드 채널과 랜딩 페이지에서 콘텐츠를 활용할 수 있습니다.",
    },
    {
      clause_id: "payment",
      category: "지급 조건",
      content: `${scenario.budget} 조건으로 캠페인 종료 후 정산합니다.`,
    },
  ].map((clause, index) => ({
    ...clause,
    status: clauseStatusFor(scenario, index),
    history:
      scenario.clauses === "change" && index === 2
        ? [
            {
              id: crypto.randomUUID(),
              role: "influencer",
              action: "수정 요청",
              comment:
                "2차 활용 기간과 사용 채널을 계약서에 더 좁게 적어 주세요.",
              timestamp: addDays(-1),
            },
          ]
        : [],
  }));

const buildShowcaseContract = (scenario, advertiserId) => {
  const activeShare = scenario.status !== "DRAFT" && scenario.status !== "CLOSED";
  const createdAt = addDays(-4);
  const completedAt =
    typeof scenario.completedDays === "number"
      ? addDays(scenario.completedDays)
      : undefined;
  const updatedAt =
    completedAt ?? addDays(scenario.key === "draft-minseo" ? -2 : 0);
  const campaignEndDate = dateOnly(scenario.endDays ?? 21);
  const campaignStartDate = dateOnly(
    scenario.startDays ??
      (typeof scenario.endDays === "number" && scenario.endDays < 0
        ? scenario.endDays - 21
        : 1),
  );
  const isClosed = scenario.status === "CLOSED";
  const contractDeliverables = isClosed
    ? [scenario.deliverables[0] ?? "콘텐츠 증빙 1건"]
    : scenario.deliverables;

  return {
    id: stableUuid(`${showcaseBatch}:${scenario.key}`),
    advertiser_id: advertiserId,
    campaign_name: scenario.campaignName,
    advertiser_info: {
      name: accounts.advertiser.company_name,
      manager: accounts.advertiser.name,
    },
    type: scenario.type,
    status: scenario.status,
    title: scenario.title,
    influencer_info: {
      name: scenario.influencerName,
      channel_url: scenario.channelUrl,
      contact: scenario.influencerContact,
    },
    campaign: {
      budget: scenario.budget,
      start_date: campaignStartDate,
      end_date: campaignEndDate,
      deadline: dateOnly(scenario.dueDays),
      upload_due_at: dateOnly(scenario.dueDays),
      review_due_at: dateOnly(scenario.dueDays + 2),
      revision_limit: "2",
      disclosure_text: "#광고 #협찬",
      tracking_link: `${PUBLIC_SITE_URL}/showcase/${scenario.key}`,
      period: `${campaignStartDate} - ${campaignEndDate}`,
      platforms: scenario.platforms,
      deliverables: contractDeliverables,
    },
    workflow: {
      next_actor: scenario.nextActor,
      next_action: scenario.nextAction,
      due_at: isClosed ? undefined : addDays(scenario.dueDays),
      last_message: scenario.lastMessage,
      risk_level: scenario.risk,
    },
    evidence: {
      share_token_status: isClosed ? "revoked" : activeShare ? "active" : "not_issued",
      share_token: activeShare ? shareToken() : undefined,
      share_token_expires_at: activeShare ? addDays(14) : undefined,
      audit_ready: activeShare || isClosed,
      pdf_status: isClosed ? "signed_ready" : activeShare ? "draft_ready" : "not_ready",
    },
    audit_events: [
      {
        id: crypto.randomUUID(),
        actor: "advertiser",
        action: scenario.status === "DRAFT" ? "draft_saved" : "contract_created",
        description:
          scenario.status === "DRAFT"
            ? "광고주가 계약 초안을 저장했습니다."
            : "광고주가 검토 링크를 발송했습니다.",
        created_at: createdAt,
      },
      ...(isClosed
        ? [
            {
              id: crypto.randomUUID(),
              actor: "system",
              action: "contract_closed",
              description: "계약 종료 후 서명본과 검수 기록이 보관되었습니다.",
              created_at: completedAt ?? updatedAt,
            },
          ]
        : []),
    ],
    clauses: buildShowcaseClauses({
      ...scenario,
      deliverables: contractDeliverables,
    }),
    ...(isClosed
      ? {
          signature_data: {
            adv_sign: "",
            inf_sign: "",
            signed_at: completedAt ?? updatedAt,
            ip: "127.0.0.1",
            user_agent: "쇼케이스 시드",
            signer_name: scenario.influencerName,
            signer_email: scenario.influencerContact,
            consent_text: "전자서명 동의가 완료되었습니다.",
            consent_text_version: `showcase-${dateOnly(0)}`,
            contract_hash: stableServerUuid(`showcase:closed:contract:${scenario.key}`),
            signature_hash: stableServerUuid(`showcase:closed:signature:${scenario.key}`),
          },
          pdf_url: `/api/contracts/${stableUuid(`${showcaseBatch}:${scenario.key}`)}/final-pdf`,
        }
      : {}),
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const putContract = async (contract, advertiserCookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contract.id)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: advertiserCookie,
        "X-Yeollock-Actor": "advertiser",
      },
      body: JSON.stringify({ contract }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `PUT contract ${contract.title} failed (${response.status}): ${body.slice(0, 700)}`,
    );
  }
  return JSON.parse(body).contract;
};

const signContract = async (contractId, influencerCookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/signatures/influencer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: influencerCookie },
      body: JSON.stringify({
        signature_data: signatureImageDataUrl,
        signer_name: accounts.influencer.name,
        consent_accepted: true,
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `sign contract ${contractId} failed (${response.status}): ${body.slice(0, 700)}`,
    );
  }
  return JSON.parse(body).contract;
};

const loadDeliverableBundle = async (contractId, cookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/deliverables`,
    {
      headers: { Accept: "application/json", Cookie: cookie },
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `load deliverables ${contractId} failed (${response.status}): ${body.slice(0, 700)}`,
    );
  }
  return JSON.parse(body);
};

const submitDeliverable = async (
  contractId,
  scenario,
  influencerCookie,
  requirement,
  index = 0,
) => {
  const title = requirement?.title ?? scenario.deliverables[index] ?? "콘텐츠 증빙";
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/deliverables`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: influencerCookie },
      body: JSON.stringify({
        requirement_id: requirement?.id,
        title,
        url: `${scenario.channelUrl.replace(/\/$/, "")}/showcase-${scenario.key}`,
        note: "쇼케이스 대시보드용 제출 링크입니다.",
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `submit deliverable ${contractId} failed (${response.status}): ${body.slice(0, 700)}`,
    );
  }
  return JSON.parse(body).deliverable;
};

const submitPostLink = async (contractId, scenario, influencerCookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/post-link`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: influencerCookie },
      body: JSON.stringify({
        post_link: `${scenario.channelUrl.replace(/\/$/, "")}/showcase-${scenario.key}`,
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `submit post link ${contractId} failed (${response.status}): ${body.slice(0, 700)}`,
    );
  }
  return JSON.parse(body).contract;
};

const approveDeliverable = async (contractId, deliverableId, advertiserCookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/deliverables/${encodeURIComponent(
      deliverableId,
    )}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: advertiserCookie },
      body: JSON.stringify({
        review_status: "approved",
        review_comment: "쇼케이스 검수 완료",
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `approve deliverable ${deliverableId} failed (${response.status}): ${body.slice(0, 700)}`,
    );
  }
  return JSON.parse(body).deliverable;
};

const closeContract = async (contractId, advertiserCookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/close`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: advertiserCookie,
      },
      body: JSON.stringify({ settlement_confirmed: true }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `close contract ${contractId} failed (${response.status}): ${body.slice(0, 700)}`,
    );
  }
  return JSON.parse(body).contract;
};

const buildSeedCampaignSnapshot = (campaign, marketplace) => ({
  id: campaign.id,
  title: campaign.title,
  type: campaign.type,
  budget: campaign.budget,
  applicantLimit: campaign.applicantLimit,
  summary: campaign.summary,
  deadline: campaign.deadline,
  uploadDeadline: campaign.uploadDeadline,
  platforms: campaign.platforms,
  deliverables: campaign.deliverables,
  brandId: marketplace.brandProfileId,
  brandHandle: testHandles.brand,
  brandName: accounts.advertiser.company_name,
  brandCategory: "뷰티 · 라이프스타일",
});

const buildSeedCampaignApplicationSummary = (campaign) =>
  [
    `캠페인 신청: ${campaign.title}`,
    campaign.summary ? `모집 설명: ${campaign.summary}` : undefined,
    campaign.applicantLimit ? `모집인원: ${campaign.applicantLimit}` : undefined,
    `지급내용: ${campaign.budget}`,
    campaign.deliverables?.length
      ? `산출물: ${campaign.deliverables.join(", ")}`
      : undefined,
    campaign.platforms?.length
      ? `플랫폼: ${campaign.platforms.map((platform) => seedPlatformLabels[platform] ?? "기타").join(", ")}`
      : undefined,
    campaign.uploadDeadline ? `제출마감일: ${campaign.uploadDeadline}` : undefined,
    campaign.deadline ? `모집마감일: ${campaign.deadline}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

const seedActivityCategoryMap = new Map([
  ["먹방", "mukbang"],
  ["여행", "travel"],
  ["뷰티", "beauty"],
  ["패션", "fashion"],
  ["피트니스", "fitness"],
  ["테크", "tech"],
  ["게임", "game"],
  ["교육", "education"],
  ["라이프스타일", "lifestyle"],
  ["금융", "finance"],
  ["리빙", "lifestyle"],
  ["리뷰", "lifestyle"],
  ["숏폼", "lifestyle"],
]);

const allowedSeedActivityCategories = new Set(seedActivityCategoryMap.values());

const normalizeSeedActivityCategories = (categories = []) => {
  const normalized = categories
    .map((category) => seedActivityCategoryMap.get(category) ?? category)
    .filter((category) => allowedSeedActivityCategories.has(category));

  return Array.from(new Set(normalized));
};

const ensureCampaignDashboardApplicantProfiles = async () => {
  const authUsers = [];
  for (const profile of campaignDashboardApplicantProfiles) {
    const user = await ensureAuthUser({
      email: profile.email,
      role: "influencer",
      name: profile.name,
    });
    authUsers.push({ ...profile, user });
  }

  await upsert(
    "profiles",
    authUsers.map((profile) => ({
      id: profile.user.id,
      role: "influencer",
      name: profile.name,
      email: profile.user.email,
      avatar_url: profile.avatarUrl,
      company_name: null,
      activity_categories: normalizeSeedActivityCategories(profile.categories),
      activity_platforms: ["instagram", "youtube", "naver_blog"],
      verification_status: "approved",
      email_verified_at: timestamp,
      updated_at: timestamp,
    })),
    "id",
    "campaign applicant profiles",
  );

  const publicProfiles = [];
  for (const profile of authUsers) {
    const existingProfile = await findByPublicHandle(
      "marketplace_influencer_profiles",
      profile.handle,
      "campaign applicant marketplace profile",
    );
    const marketplaceProfileId =
      existingProfile?.id ??
      stableServerUuid(`marketplace:campaign-applicant:${profile.user.id}`);

    publicProfiles.push({
      ...profile,
      marketplaceProfileId,
      ownerProfileId: profile.user.id,
    });
  }

  await upsert(
    "marketplace_influencer_profiles",
    publicProfiles.map((profile) => ({
      id: profile.marketplaceProfileId,
      owner_profile_id: profile.ownerProfileId,
      public_handle: profile.handle,
      display_name: profile.name,
      headline: profile.headline,
      bio: `${profile.name} 캠페인 지원 화면을 실제 인플루언서 계정처럼 검수하기 위한 공개 프로필입니다.`,
      location: "서울 · 원격 협업",
      avatar_label: profile.name.slice(0, 1),
      avatar_url: profile.avatarUrl,
      categories: profile.categories,
      audience: "20-34 관심 팔로워",
      audience_tags: profile.categories,
      collaboration_types: ["sponsored_post", "product_seeding", "ppl"],
      starting_price_label: "협의 가능",
      response_time_label: "당일 응답",
      verified_label: "플랫폼 인증 완료",
      brand_fit: ["캠페인 지원", "콘텐츠 제작", "계약 전환"],
      recent_brands: ["브레드룸", "오브레"],
      portfolio: [
        {
          title: "브랜드 캠페인 리뷰",
          brand: "브레드룸",
          result: "캠페인 지원자 화면 검수용 프로필",
        },
      ],
      proposal_hints: ["캠페인 조건 확인 후 신청합니다."],
      is_published: true,
      updated_at: timestamp,
    })),
    "owner_profile_id",
    "campaign applicant marketplace profiles",
  );

  for (const profile of publicProfiles) {
    await removeRows(
      "marketplace_influencer_channels",
      `?profile_id=eq.${encodeURIComponent(profile.marketplaceProfileId)}`,
      "campaign applicant marketplace channels",
    );
  }

  await upsert(
    "marketplace_influencer_channels",
    publicProfiles.flatMap((profile, index) => [
      {
        id: stableUuid(`qa:campaign-applicant-channel:instagram:${profile.handle}`),
        profile_id: profile.marketplaceProfileId,
        platform: "instagram",
        label: "인스타",
        handle: `@${profile.handle.replaceAll("-", "_")}`,
        url: `https://instagram.com/${profile.handle.replaceAll("-", "_")}`,
        followers_label: profile.followersLabel,
        performance_label: "캠페인 지원 가능",
        sort_order: index * 2 + 1,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`qa:campaign-applicant-channel:youtube:${profile.handle}`),
        profile_id: profile.marketplaceProfileId,
        platform: "youtube",
        label: "유튜브",
        handle: `@${profile.handle.replaceAll("-", "")}`,
        url: `https://youtube.com/@${profile.handle.replaceAll("-", "")}`,
        followers_label: profile.followersLabel,
        performance_label: "캠페인 지원 가능",
        sort_order: index * 2 + 2,
        updated_at: timestamp,
      },
    ]),
    "id",
    "campaign applicant marketplace channels",
  );

  return new Map(
    publicProfiles.map((profile) => [
      profile.name,
      {
        ownerProfileId: profile.ownerProfileId,
        publicHandle: profile.handle,
        avatarUrl: profile.avatarUrl,
      },
    ]),
  );
};

const seedCampaignDashboardApplications = async ({
  marketplace,
  contractsByCampaignName,
  applicantProfileByName,
}) => {
  const campaignsByTitle = new Map(
    marketplace.campaigns.map((campaign) => [campaign.title, campaign]),
  );
  const rows = [];

  for (const fixture of campaignDashboardApplicationFixtures) {
    const campaign = campaignsByTitle.get(fixture.campaignTitle);
    if (!campaign?.id) continue;

      const convertedContract = contractsByCampaignName.get(fixture.campaignTitle);
      const applicantNames = [...new Set([
        ...(fixture.convertedName ? [fixture.convertedName] : []),
        ...campaignDashboardApplicantPool,
      ])];

    for (let index = 0; index < fixture.applicantCount; index += 1) {
      const senderName = applicantNames[index % applicantNames.length];
      const status =
        fixture.statuses[index % fixture.statuses.length] ?? "submitted";
      const convertedContractId =
        (status === "converted_to_contract" || status === "closed") &&
        convertedContract &&
        senderName === fixture.convertedName
          ? convertedContract.id
          : undefined;
      const createdAt = addDays(-(fixture.ageDays + index));
      const applicantProfile = applicantProfileByName.get(senderName);
      if (!applicantProfile) {
        throw new Error(`Missing campaign applicant profile: ${senderName}`);
      }

      rows.push({
        id: stableUuid(
          `qa:campaign-dashboard-application:${campaign.id}:${senderName}:${index}`,
        ),
        direction: "influencer_to_brand",
        target_brand_profile_id: marketplace.brandProfileId,
        target_handle: testHandles.brand,
        target_display_name: accounts.advertiser.company_name,
        sender_profile_id: applicantProfile.ownerProfileId,
        sender_name: senderName,
        sender_intro:
          campaignDashboardApplicantProfileByName.get(senderName)?.headline ??
          `${senderName}의 채널 톤과 제작 일정에 맞춰 지원합니다.`,
        proposal_type: campaign.type,
        proposal_summary: buildSeedCampaignApplicationSummary(campaign),
        campaign_id: campaign.id,
        campaign_snapshot: buildSeedCampaignSnapshot(campaign, marketplace),
        converted_contract_id: convertedContractId,
        status,
        created_at: createdAt,
        updated_at: createdAt,
      });
    }
  }

  await upsert(
    "marketplace_contact_proposals",
    rows,
    "id",
    "campaign dashboard application fixtures",
  );

  return rows.length;
};

const seedDashboardShowcase = async ({ advertiser, influencer, marketplace }) => {
  const advertiserSession = await login("/api/advertiser/login", advertiser.email);
  const influencerSession = await login("/api/influencer/login", influencer.email);
  const cleanup = await cleanupDashboardShowcaseData({
    advertiser,
    influencer,
    marketplace,
    advertiserCookie: advertiserSession.cookie,
  });
  const applicantProfileByName = await ensureCampaignDashboardApplicantProfiles();
  const created = [];
  const contractsByCampaignName = new Map();

  for (const scenario of showcaseScenarios) {
    let contract = await putContract(
      buildShowcaseContract(scenario, advertiser.id),
      advertiserSession.cookie,
    );

    if (scenario.sign) {
      contract = await signContract(contract.id, influencerSession.cookie);
    }
    if (scenario.submitDeliverable) {
      contract = await submitPostLink(
        contract.id,
        scenario,
        influencerSession.cookie,
      );
    }

    const submittedDeliverables = [];
    if (scenario.submitDeliverable) {
      const bundle = await loadDeliverableBundle(
        contract.id,
        influencerSession.cookie,
      );
      const requirements = Array.isArray(bundle.requirements)
        ? bundle.requirements
        : [];
      const requirementsToSubmit = scenario.closeContract
        ? requirements
        : requirements.slice(0, 1);
      const targets =
        requirementsToSubmit.length > 0 ? requirementsToSubmit : [undefined];

      let submissionIndex = 0;
      for (const requirement of targets) {
        const quantity = scenario.closeContract
          ? Math.max(1, Number(requirement?.quantity) || 1)
          : 1;
        for (let count = 0; count < quantity; count += 1) {
          submittedDeliverables.push(
            await submitDeliverable(
              contract.id,
              scenario,
              influencerSession.cookie,
              requirement,
              submissionIndex,
            ),
          );
          submissionIndex += 1;
        }
      }
    }
    if (scenario.approveDeliverable && submittedDeliverables.length > 0) {
      for (const deliverable of submittedDeliverables) {
        if (!deliverable?.id) continue;
        await approveDeliverable(
          contract.id,
          deliverable.id,
          advertiserSession.cookie,
        );
      }
    }
    if (scenario.closeContract) {
      contract = await closeContract(contract.id, advertiserSession.cookie);
    }

    created.push({
      id: contract.id,
      title: scenario.title,
      campaignName: scenario.campaignName,
      status: contract.status,
      influencer: scenario.influencerName,
    });
    contractsByCampaignName.set(scenario.campaignName, {
      id: contract.id,
      influencer: scenario.influencerName,
    });
  }

  const seededApplications = await seedCampaignDashboardApplications({
    marketplace,
    contractsByCampaignName,
    applicantProfileByName,
  });

  const advertiserContractsResponse = await appJson(
    "/api/contracts",
    { headers: { Cookie: advertiserSession.cookie } },
    "advertiser contract list after showcase seed",
  );
  const influencerDashboard = await appJson(
    "/api/influencer/dashboard",
    { headers: { Cookie: influencerSession.cookie } },
    "influencer dashboard after showcase seed",
  );

  return {
    base_url: DASHBOARD_BASE_URL,
    archived_contracts: cleanup.archivedContracts,
    created_contracts: created.length,
    seeded_campaign_applications: seededApplications,
    advertiser_visible_contracts: advertiserContractsResponse.contracts?.length ?? 0,
    influencer_visible_contracts: influencerDashboard.contracts?.length ?? 0,
    influencer_visible_applications: influencerDashboard.applications?.length ?? 0,
    sample_contracts: created.map((contract) => ({
      title: contract.title,
      status: contract.status,
      influencer: contract.influencer,
    })),
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
const dashboardShowcase = await seedDashboardShowcase({
  advertiser,
  influencer,
  marketplace,
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
      dashboard_showcase: dashboardShowcase,
    },
    null,
    2,
  ),
);
