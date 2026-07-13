import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const TEST_ACCOUNT_PASSWORD =
  process.env.FEEDBACK_TEST_PASSWORD ??
  process.env.QA_TEST_PASSWORD ??
  "Yeollock2026!";
const PUBLIC_SITE_URL = (
  process.env.PUBLIC_SITE_URL ??
  process.env.VITE_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  "https://yeollock.me"
).replace(/\/$/, "");
const DASHBOARD_BASE_URL = (
  process.env.DASHBOARD_BASE_URL ??
  process.env.QA_BASE_URL ??
  process.env.APP_URL ??
  PUBLIC_SITE_URL
).replace(/\/$/, "");
const LEGACY_CONTRACTS_TABLE =
  process.env.SUPABASE_CONTRACTS_TABLE ?? "directsign_contracts";
const POST_SEED_VERIFY_WAIT_MS = Number.parseInt(
  process.env.FEEDBACK_POST_SEED_VERIFY_WAIT_MS ?? "22000",
  10,
);
const ALLOW_PRODUCTION_TEST_DATA =
  process.env.YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA === "true";

const isProductionHost = (value) =>
  /^https:\/\/(www\.)?yeollock\.me$/i.test(value);

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Supabase service environment is missing");
}

if (
  !ALLOW_PRODUCTION_TEST_DATA &&
  (isProductionHost(PUBLIC_SITE_URL) || isProductionHost(DASHBOARD_BASE_URL))
) {
  throw new Error(
    "Production demo account seeding is blocked. Set YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA=true for this approved one-time run.",
  );
}

const timestamp = new Date().toISOString();
const seedSource = "seed-feedback-demo-accounts";
const runId = timestamp.replace(/[-:.TZ]/g, "").slice(0, 14);

const accounts = {
  advertiser: {
    email: "brand-demo@yeollock.me",
    role: "marketer",
    name: "김민지",
    company_name: "그리팅랩",
  },
  influencer: {
    email: "creator-demo@yeollock.me",
    role: "influencer",
    name: "이서윤",
    avatar_url: "/images/influencers/creator-sora.png",
  },
};

const testHandles = {
  influencer: "creator-demo",
  brand: "greeting-lab-demo",
};

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
    throw new Error(`${label} failed (${response.status}): ${text.slice(0, 900)}`);
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

const ensureAuthUser = async ({ email, role, name, company_name, avatar_url }) => {
  let user = await findAuthUserByEmail(email);
  const userMetadata = {
    name,
    role,
    ...(company_name ? { company_name } : {}),
    ...(avatar_url ? { avatar_url } : {}),
    qa_account: true,
    demo_account: true,
  };
  const appMetadata = { qa_account: true, demo_account: true, role, seedSource };

  if (!user) {
    const createResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: restHeaders,
      body: JSON.stringify({
        email,
        password: TEST_ACCOUNT_PASSWORD,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      }),
    });

    if (!createResponse.ok) {
      const body = await createResponse.text();
      if (!body.toLowerCase().includes("already")) {
        throw new Error(
          `Supabase auth user create failed (${createResponse.status}): ${body.slice(
            0,
            900,
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
          ...userMetadata,
        },
        app_metadata: {
          ...(user.app_metadata ?? {}),
          ...appMetadata,
        },
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
        data_origin: "demo",
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
        activity_categories: ["lifestyle", "beauty", "fitness"],
        activity_platforms: ["instagram", "youtube", "naver_blog"],
        verification_status: "approved",
        data_origin: "demo",
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
    stableUuid(`feedback-demo:organization:${advertiser.id}`);

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
        representative_name: "박준호",
        website_url: "https://yeollock.me",
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
    `feedback-demo:verification:advertiser:${organizationId}`,
  );
  const commonReview = {
    status: "approved",
    data_origin: "demo",
    evidence_snapshot_json: {
      seeded: true,
      demo_account: true,
      source: seedSource,
    },
    reviewed_by_name: "운영자",
    reviewed_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await upsert(
    "verification_requests",
    [
      {
        id: businessVerificationId,
        target_type: "advertiser_organization",
        target_id: organizationId,
        verification_type: "business_registration_certificate",
        profile_id: advertiser.id,
        organization_id: organizationId,
        subject_name: accounts.advertiser.company_name,
        submitted_by_name: accounts.advertiser.name,
        submitted_by_email: advertiser.email,
        business_registration_number: "1234567890",
        representative_name: "박준호",
        ownership_check_status: "not_run",
        note: "피드백 시연용 광고주 사업자 인증 데이터입니다.",
        ...commonReview,
      },
      {
        id: stableUuid(`feedback-demo:verification:instagram:${influencer.id}`),
        target_type: "influencer_account",
        target_id: influencer.id,
        verification_type: "platform_account",
        profile_id: influencer.id,
        subject_name: accounts.influencer.name,
        submitted_by_email: influencer.email,
        platform: "instagram",
        platform_handle: "creator-demo",
        platform_url: "https://instagram.com/creator-demo",
        ownership_verification_method: "profile_bio_code",
        ownership_challenge_code: "DS-DEMO-2026",
        ownership_challenge_url: "https://instagram.com/creator-demo",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        note: "피드백 시연용 인스타그램 인증 데이터입니다.",
        ...commonReview,
      },
      {
        id: stableUuid(`feedback-demo:verification:youtube:${influencer.id}`),
        target_type: "influencer_account",
        target_id: influencer.id,
        verification_type: "platform_account",
        profile_id: influencer.id,
        subject_name: accounts.influencer.name,
        submitted_by_email: influencer.email,
        platform: "youtube",
        platform_handle: "@creator-demo",
        platform_url: "https://youtube.com/@creator-demo",
        ownership_verification_method: "channel_description_code",
        ownership_challenge_code: "DS-DEMO-2026",
        ownership_challenge_url: "https://youtube.com/@creator-demo",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        note: "피드백 시연용 유튜브 인증 데이터입니다.",
        ...commonReview,
      },
      {
        id: stableUuid(`feedback-demo:verification:naver:${influencer.id}`),
        target_type: "influencer_account",
        target_id: influencer.id,
        verification_type: "platform_account",
        profile_id: influencer.id,
        subject_name: accounts.influencer.name,
        submitted_by_email: influencer.email,
        platform: "naver_blog",
        platform_handle: "creator_demo",
        platform_url: "https://blog.naver.com/creator_demo",
        ownership_verification_method: "profile_bio_code",
        ownership_challenge_code: "DS-DEMO-2026",
        ownership_challenge_url: "https://blog.naver.com/creator_demo",
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        note: "피드백 시연용 네이버 블로그 인증 데이터입니다.",
        ...commonReview,
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
        representative_name: "박준호",
        website_url: "https://yeollock.me",
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
  const influencerProfileId = stableUuid(
    `feedback-demo:marketplace:influencer:${influencer.id}`,
  );
  const brandProfileId = stableUuid(
    `feedback-demo:marketplace:brand:${organizationId}`,
  );

  await upsert(
    "marketplace_influencer_profiles",
    [
      {
        id: influencerProfileId,
        owner_profile_id: influencer.id,
        public_handle: testHandles.influencer,
        display_name: accounts.influencer.name,
        headline: "릴스와 쇼츠 리뷰를 만드는 라이프스타일 크리에이터",
        bio:
          "식품, 뷰티, 생활 제품을 직접 사용한 흐름으로 자연스럽게 소개합니다. 계약 검토와 콘텐츠 제출까지 yeollock에서 확인할 수 있는 피드백 시연용 프로필입니다.",
        location: "서울 · 수도권",
        avatar_label: "이서",
        avatar_url: accounts.influencer.avatar_url,
        categories: ["라이프스타일", "푸드", "뷰티"],
        audience: "20-34 여성, 식단·생활 제품 관심 고객",
        audience_tags: ["릴스 리뷰", "쇼츠", "제품 사용기"],
        collaboration_types: ["sponsored_post", "ppl", "product_seeding"],
        starting_price_label: "30만원부터",
        response_time_label: "보통 당일 응답",
        verified_label: "인스타그램 · 유튜브 인증",
        brand_fit: ["건강식품", "생활용품", "뷰티"],
        recent_brands: ["그리팅랩", "온데일리", "베러밀"],
        portfolio: [
          {
            title: "저당 도시락 릴스 리뷰",
            brand: "그리팅랩",
            result: "릴스 1건, 스토리 2건",
          },
          {
            title: "홈카페 믹스 쇼츠",
            brand: "온데일리",
            result: "쇼츠 1건",
          },
        ],
        proposal_hints: [
          "계약 조건과 콘텐츠 범위를 먼저 확인합니다.",
          "수정할 조항은 계약 화면에서 명확히 요청합니다.",
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
        id: stableUuid(`${influencerProfileId}:instagram`),
        profile_id: influencerProfileId,
        platform: "instagram",
        label: "Instagram",
        handle: "creator-demo",
        url: "https://instagram.com/creator-demo",
        followers_label: "3.4만",
        performance_label: "릴스 평균 조회 1.2만",
        sort_order: 0,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`${influencerProfileId}:youtube`),
        profile_id: influencerProfileId,
        platform: "youtube",
        label: "YouTube",
        handle: "@creator-demo",
        url: "https://youtube.com/@creator-demo",
        followers_label: "1.8만",
        performance_label: "쇼츠 평균 조회 8천",
        sort_order: 1,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`${influencerProfileId}:naver_blog`),
        profile_id: influencerProfileId,
        platform: "naver_blog",
        label: "Naver Blog",
        handle: "creator_demo",
        url: "https://blog.naver.com/creator_demo",
        followers_label: "일 방문 2천",
        performance_label: "검색형 리뷰 가능",
        sort_order: 2,
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
        display_name: accounts.advertiser.company_name,
        category: "건강식품 · 간편식",
        headline: "건강한 식단 제품을 소개하는 D2C 브랜드",
        description:
          "그리팅랩은 단백질 쉐이크, 저당 도시락, 홈카페 믹스를 판매하는 피드백 시연용 브랜드 프로필입니다.",
        location: "서울",
        logo_label: "GL",
        preferred_platforms: ["instagram", "youtube", "naver_blog"],
        proposal_types: ["sponsored_post", "ppl", "product_seeding"],
        budget_range_label: "30만-120만원",
        response_time_label: "보통 1영업일 내 응답",
        status_label: "사업자 인증 완료",
        fit_tags: ["릴스", "쇼츠", "식단 관리"],
        audience_targets: ["20-39 직장인", "헬시플레저 관심 고객"],
        active_campaigns: [
          {
            id: stableUuid("feedback-demo:campaign:shake"),
            title: "단백질 쉐이크 릴스 리뷰",
            summary: "제품 사용 장면 중심 릴스 1건",
            platforms: ["instagram"],
            deliverables: ["릴스 1건", "스토리 2건"],
            budget: "500,000원",
            deadline: "모집중",
          },
          {
            id: stableUuid("feedback-demo:campaign:lunchbox"),
            title: "저당 도시락 블로그 리뷰",
            summary: "사진 8장 이상 상세 후기",
            platforms: ["naver_blog"],
            deliverables: ["블로그 리뷰 1건"],
            budget: "제품 제공 + 300,000원",
            deadline: "모집중",
          },
        ],
        recent_creators: [accounts.influencer.name],
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
    },
  };
};

const getSeedDate = (days, hour = 12) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const addDays = (days, hour) => getSeedDate(days, hour).toISOString();

const dateOnly = (days) => {
  const date = getSeedDate(days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
};

const shareToken = () => crypto.randomUUID().replaceAll("-", "");

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

const login = async (path, email) => {
  const response = await fetch(`${DASHBOARD_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: TEST_ACCOUNT_PASSWORD }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${body.slice(0, 900)}`);
  }
  const cookie = cookieHeaderFrom(response);
  if (!cookie) throw new Error(`${path} did not return session cookies`);
  return { cookie, body: JSON.parse(body) };
};

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const signatureImageDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const buildClauses = (scenario) =>
  [
    {
      clause_id: "content_scope",
      category: "콘텐츠",
      content: `${scenario.deliverables.join(
        ", ",
      )}을 지정 채널에 게시하고, 광고 표기를 포함합니다.`,
    },
    {
      clause_id: "schedule",
      category: "일정",
      content: `콘텐츠는 ${dateOnly(
        scenario.dueDays,
      )}까지 제출하고 광고주는 제출 후 2영업일 안에 검수합니다.`,
    },
    {
      clause_id: "usage",
      category: "콘텐츠 사용",
      content:
        "광고주는 계약 기간 동안 브랜드 공식 채널과 광고 소재에서 해당 콘텐츠를 사용할 수 있습니다.",
    },
    {
      clause_id: "payment",
      category: "지급 조건",
      content: `계약 금액은 ${scenario.budget}이며, 정산은 당사자 간 별도 합의에 따릅니다.`,
    },
  ].map((clause) => ({
    ...clause,
    status:
      scenario.status === "DRAFT" || scenario.status === "REVIEWING"
        ? "PENDING_REVIEW"
        : "APPROVED",
    history: [],
  })).map((clause) => {
    if (scenario.requestChange && clause.clause_id === "usage") {
      return {
        ...clause,
        status: "MODIFICATION_REQUESTED",
        history: [
          {
            id: crypto.randomUUID(),
            role: "influencer",
            action: "수정 요청",
            comment:
              "콘텐츠 사용 범위를 브랜드 공식 채널과 2차 광고 소재로 나누어 명확히 적어주세요.",
            timestamp: addDays(-1),
          },
        ],
      };
    }
    return clause;
  });

const buildContract = (scenario, advertiserId) => {
  const activeShare = scenario.status !== "DRAFT";
  const createdAt = addDays(scenario.createdDays ?? -5, 10);
  const updatedAt = addDays(scenario.updatedDays ?? -1, 17);
  const contractId = stableUuid(
    `feedback-demo:contract:${runId}:${scenario.key}:${advertiserId}`,
  );

  return {
    id: contractId,
    data_origin: "demo",
    advertiser_id: advertiserId,
    campaign_name: scenario.campaignName,
    advertiser_info: {
      name: accounts.advertiser.company_name,
      manager: accounts.advertiser.name,
    },
    type: "PPL",
    status: scenario.status,
    title: scenario.title,
    influencer_info: {
      name: accounts.influencer.name,
      channel_url: scenario.channelUrl,
      contact: accounts.influencer.email,
    },
    campaign: {
      budget: scenario.budget,
      start_date: dateOnly(scenario.startDays ?? 1),
      end_date: dateOnly(scenario.endDays ?? 30),
      deadline: dateOnly(scenario.dueDays),
      upload_due_at: dateOnly(scenario.dueDays),
      review_due_at: dateOnly(scenario.dueDays + 2),
      revision_limit: "2",
      disclosure_text: "#광고 #협찬",
      tracking_link: `${PUBLIC_SITE_URL}/demo/${scenario.key}`,
      period: `${dateOnly(scenario.startDays ?? 1)} - ${dateOnly(
        scenario.endDays ?? 30,
      )}`,
      platforms: scenario.platforms,
      deliverables: scenario.deliverables,
      content_plans: scenario.contentPlans,
    },
    workflow: {
      next_actor: scenario.nextActor,
      next_action: scenario.nextAction,
      due_at: addDays(scenario.dueDays),
      last_message: scenario.lastMessage,
      risk_level: "low",
    },
    evidence: {
      share_token_status: activeShare ? "active" : "not_issued",
      share_token: activeShare ? shareToken() : undefined,
      share_token_expires_at: activeShare ? addDays(14) : undefined,
      audit_ready: activeShare,
      pdf_status: activeShare ? "draft_ready" : "not_ready",
      seed_source: seedSource,
      seeded: true,
      demo_account: true,
    },
    audit_events: [
      {
        id: crypto.randomUUID(),
        actor: "advertiser",
        action: scenario.status === "DRAFT" ? "draft_saved" : "contract_created",
        description:
          scenario.status === "DRAFT"
            ? "피드백 시연용 계약 초안을 저장했습니다."
            : "피드백 시연용 계약 공유 링크를 발급했습니다.",
        created_at: createdAt,
      },
    ],
    clauses: buildClauses(scenario),
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
      `PUT contract ${contract.title} failed (${response.status}): ${body.slice(
        0,
        900,
      )}`,
    );
  }
  return JSON.parse(body).contract;
};

const signContract = async (contractId, influencerCookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(
      contractId,
    )}/signatures/influencer`,
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
      `sign contract ${contractId} failed (${response.status}): ${body.slice(
        0,
        900,
      )}`,
    );
  }
  return JSON.parse(body).contract;
};

const loadDeliverableBundle = async (contractId, cookie) =>
  appJson(
    `/api/contracts/${encodeURIComponent(contractId)}/deliverables`,
    { headers: { Cookie: cookie } },
    `load deliverables ${contractId}`,
  );

const submitPostLink = async (contractId, scenario, influencerCookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/post-link`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: influencerCookie },
      body: JSON.stringify({
        post_link: `${scenario.channelUrl.replace(/\/$/, "")}/p/${scenario.key}`,
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `submit post link ${contractId} failed (${response.status}): ${body.slice(
        0,
        900,
      )}`,
    );
  }
  return JSON.parse(body).contract;
};

const submitDeliverable = async (
  contractId,
  scenario,
  influencerCookie,
  requirement,
  index = 0,
) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/deliverables`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: influencerCookie },
      body: JSON.stringify({
        requirement_id: requirement?.id,
        title: requirement?.title ?? scenario.deliverables[index] ?? "콘텐츠 증빙",
        url: `${scenario.channelUrl.replace(/\/$/, "")}/p/${scenario.key}-${index + 1}`,
        note: "피드백 시연용 콘텐츠 제출 링크입니다.",
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `submit deliverable ${contractId} failed (${response.status}): ${body.slice(
        0,
        900,
      )}`,
    );
  }
  return JSON.parse(body).deliverable;
};

const approveDeliverable = async (contractId, deliverableId, advertiserCookie) => {
  const response = await fetch(
    `${DASHBOARD_BASE_URL}/api/contracts/${encodeURIComponent(
      contractId,
    )}/deliverables/${encodeURIComponent(deliverableId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: advertiserCookie },
      body: JSON.stringify({
        review_status: "approved",
        review_comment: "피드백 시연용 검수 완료",
      }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `approve deliverable ${deliverableId} failed (${response.status}): ${body.slice(
        0,
        900,
      )}`,
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
      `close contract ${contractId} failed (${response.status}): ${body.slice(
        0,
        900,
      )}`,
    );
  }
  return JSON.parse(body).contract;
};

const demoScenarios = [
  {
    key: "draft-reels",
    title: "그리팅랩 단백질 쉐이크 릴스 계약 초안",
    campaignName: "단백질 쉐이크 릴스 리뷰",
    status: "DRAFT",
    platforms: ["INSTAGRAM"],
    deliverables: ["인스타그램 릴스 1건", "스토리 2건"],
    contentPlans: [
      {
        platform: "INSTAGRAM",
        content_type: "instagram_reels",
        quantity: 1,
        length_seconds: 45,
      },
      {
        platform: "INSTAGRAM",
        content_type: "instagram_story",
        quantity: 2,
      },
    ],
    budget: "500,000원",
    channelUrl: "https://instagram.com/creator-demo",
    dueDays: 14,
    nextActor: "advertiser",
    nextAction: "계약 초안 확인 후 공유 링크 만들기",
    lastMessage: "광고주가 작성 중인 계약 초안입니다.",
    createdDays: -6,
    updatedDays: -5,
  },
  {
    key: "reviewing-lunchbox",
    title: "그리팅랩 저당 도시락 릴스 리뷰 계약",
    campaignName: "저당 도시락 릴스 리뷰",
    status: "REVIEWING",
    platforms: ["INSTAGRAM"],
    deliverables: ["인스타그램 릴스 1건", "스토리 1건"],
    contentPlans: [
      {
        platform: "INSTAGRAM",
        content_type: "instagram_reels",
        quantity: 1,
        length_seconds: 60,
      },
    ],
    budget: "700,000원",
    channelUrl: "https://instagram.com/creator-demo",
    dueDays: 9,
    nextActor: "influencer",
    nextAction: "계약서 확인",
    lastMessage: "인플루언서가 계약서를 검토하는 중입니다.",
    createdDays: -4,
    updatedDays: -2,
  },
  {
    key: "negotiating-usage",
    title: "그리팅랩 홈카페 믹스 쇼츠 PPL 계약",
    campaignName: "홈카페 믹스 쇼츠 PPL",
    status: "NEGOTIATING",
    requestChange: true,
    platforms: ["YOUTUBE"],
    deliverables: ["유튜브 쇼츠 1건"],
    contentPlans: [
      {
        platform: "YOUTUBE",
        content_type: "youtube_shorts",
        quantity: 1,
        length_seconds: 50,
      },
    ],
    budget: "900,000원",
    channelUrl: "https://youtube.com/@creator-demo",
    dueDays: 11,
    nextActor: "advertiser",
    nextAction: "수정 요청 조항 확인",
    lastMessage: "콘텐츠 사용 범위 조항에 수정 요청이 있습니다.",
    createdDays: -8,
    updatedDays: -1,
  },
  {
    key: "approved-challenge",
    title: "그리팅랩 여름 식단 챌린지 릴스 계약",
    campaignName: "여름 식단 챌린지",
    status: "APPROVED",
    platforms: ["INSTAGRAM"],
    deliverables: ["인스타그램 릴스 1건"],
    contentPlans: [
      {
        platform: "INSTAGRAM",
        content_type: "instagram_reels",
        quantity: 1,
        length_seconds: 45,
      },
    ],
    budget: "1,200,000원",
    channelUrl: "https://instagram.com/creator-demo",
    dueDays: 7,
    nextActor: "influencer",
    nextAction: "전자서명 진행",
    lastMessage: "모든 조항이 승인되어 서명을 기다리고 있습니다.",
    sign: true,
    submitDeliverable: true,
    createdDays: -10,
    updatedDays: -1,
  },
  {
    key: "closed-blog",
    title: "그리팅랩 저당 도시락 블로그 리뷰 완료 계약",
    campaignName: "저당 도시락 블로그 리뷰",
    status: "APPROVED",
    platforms: ["NAVER_BLOG"],
    deliverables: ["네이버 블로그 리뷰 1건"],
    contentPlans: [
      {
        platform: "NAVER_BLOG",
        content_type: "naver_blog_review",
        quantity: 1,
        photo_count: 8,
        character_count: 1200,
      },
    ],
    budget: "제품 제공 + 300,000원",
    channelUrl: "https://blog.naver.com/creator_demo",
    dueDays: -2,
    nextActor: "influencer",
    nextAction: "전자서명 진행",
    lastMessage: "검수와 종료까지 완료된 피드백 시연용 계약입니다.",
    sign: true,
    submitDeliverable: true,
    approveDeliverable: true,
    closeContract: true,
    createdDays: -18,
    updatedDays: -1,
  },
];

const cleanupDemoContracts = async ({ advertiser }) => {
  await removeRows(
    LEGACY_CONTRACTS_TABLE,
    `?advertiser_id=eq.${encodeURIComponent(advertiser.id)}`,
    "feedback demo legacy contracts",
  );
  await rest(
    "contracts",
    `?created_by_profile_id=eq.${encodeURIComponent(
      advertiser.id,
    )}&deleted_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        deleted_at: timestamp,
        updated_at: timestamp,
      }),
    },
    "feedback demo v2 contracts archive",
  );
};

const seedContracts = async ({ advertiser }) => {
  const advertiserSession = await login("/api/advertiser/login", advertiser.email);
  const influencerSession = await login("/api/influencer/login", accounts.influencer.email);
  const created = [];

  for (const scenario of demoScenarios) {
    let contract = await putContract(
      buildContract(scenario, advertiser.id),
      advertiserSession.cookie,
    );

    if (scenario.sign) {
      contract = await signContract(contract.id, influencerSession.cookie);
    }

    const submittedDeliverables = [];
    if (scenario.submitDeliverable) {
      contract = await submitPostLink(
        contract.id,
        scenario,
        influencerSession.cookie,
      );
      const bundle = await loadDeliverableBundle(
        contract.id,
        influencerSession.cookie,
      );
      const requirements = Array.isArray(bundle.requirements)
        ? bundle.requirements
        : [];
      const targets = requirements.length > 0 ? requirements : [undefined];
      let index = 0;
      for (const requirement of targets) {
        const quantity = Math.max(1, Number(requirement?.quantity) || 1);
        for (let count = 0; count < quantity; count += 1) {
          submittedDeliverables.push(
            await submitDeliverable(
              contract.id,
              scenario,
              influencerSession.cookie,
              requirement,
              index,
            ),
          );
          index += 1;
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
      title: contract.title ?? scenario.title,
      status: contract.status,
    });
  }

  if (Number.isFinite(POST_SEED_VERIFY_WAIT_MS) && POST_SEED_VERIFY_WAIT_MS > 0) {
    await sleep(POST_SEED_VERIFY_WAIT_MS);
  }

  let advertiserContracts;
  let influencerDashboard;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    advertiserContracts = await appJson(
      "/api/contracts",
      { headers: { Cookie: advertiserSession.cookie } },
      "advertiser contract list after feedback demo seed",
    );
    influencerDashboard = await appJson(
      "/api/influencer/dashboard",
      { headers: { Cookie: influencerSession.cookie } },
      "influencer dashboard after feedback demo seed",
    );

    if (
      (advertiserContracts.contracts?.length ?? 0) >= created.length &&
      (influencerDashboard.contracts?.length ?? 0) >= created.length
    ) {
      break;
    }
    await sleep(2000);
  }

  return {
    created,
    advertiser_visible_contracts: advertiserContracts.contracts?.length ?? 0,
    influencer_visible_contracts: influencerDashboard.contracts?.length ?? 0,
    advertiserSession,
    influencerSession,
  };
};

const main = async () => {
  const advertiser = await ensureAuthUser(accounts.advertiser);
  const influencer = await ensureAuthUser(accounts.influencer);
  const { organizationId } = await ensureProfilesAndOrganization(
    advertiser,
    influencer,
  );

  await ensureVerificationRecords({ advertiser, influencer, organizationId });
  const marketplace = await ensureMarketplaceProfiles({ influencer, organizationId });
  await cleanupDemoContracts({ advertiser });
  const contracts = await seedContracts({ advertiser, influencer });

  console.log(
    JSON.stringify(
      {
        ok: true,
        base_url: DASHBOARD_BASE_URL,
        accounts: {
          advertiser: {
            email: accounts.advertiser.email,
            password: TEST_ACCOUNT_PASSWORD,
            login_url: `${PUBLIC_SITE_URL}/advertiser/login`,
          },
          influencer: {
            email: accounts.influencer.email,
            password: TEST_ACCOUNT_PASSWORD,
            login_url: `${PUBLIC_SITE_URL}/influencer/login`,
          },
        },
        organization_id: organizationId,
        marketplace_links: marketplace.links,
        contracts: contracts.created,
        advertiser_visible_contracts: contracts.advertiser_visible_contracts,
        influencer_visible_contracts: contracts.influencer_visible_contracts,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
