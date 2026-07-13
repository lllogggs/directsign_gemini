import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const TEST_ACCOUNT_PASSWORD = process.env.QA_TEST_PASSWORD;
const PUBLIC_SITE_URL = (
  process.env.PUBLIC_SITE_URL ??
  process.env.VITE_PUBLIC_SITE_URL ??
  "https://yeollock.me"
).replace(/\/$/, "");
const ALLOW_PRODUCTION_TEST_DATA =
  process.env.YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA === "true";
const SEED_RUN_CONFIRMED =
  process.env.YEOLLOCK_SEED_QA_MARKETPLACE_SCENARIO === "true";
const ACKNOWLEDGED_SUPABASE_HOST = process.env.YEOLLOCK_ACK_SUPABASE_HOST;

if (!SEED_RUN_CONFIRMED) {
  throw new Error(
    "QA marketplace seeding requires the per-run opt-in YEOLLOCK_SEED_QA_MARKETPLACE_SCENARIO=true.",
  );
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Supabase service environment is missing");
}

if (!TEST_ACCOUNT_PASSWORD) {
  throw new Error("QA_TEST_PASSWORD must be set for this seed run");
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

const isProductionHost = (value) =>
  /^https:\/\/(www\.)?yeollock\.me$/i.test(value);

if (!ALLOW_PRODUCTION_TEST_DATA && isProductionHost(PUBLIC_SITE_URL)) {
  throw new Error(
    "Production test data seeding is blocked. Set PUBLIC_SITE_URL to a non-production target, or set YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA=true for an approved one-time run.",
  );
}

const ACCOUNT_COUNT = 5;
const timestamp = new Date().toISOString();

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const pad = (value) => String(value).padStart(2, "0");

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

const stableToken = (seed) =>
  crypto.createHash("sha256").update(seed).digest("hex").slice(0, 40);
const randomShareToken = () => crypto.randomBytes(32).toString("hex");

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

const ensureAuthUser = async ({ email, role, name, companyName }) => {
  let user = await findAuthUserByEmail(email);
  if (!user) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: restHeaders,
      body: JSON.stringify({
        email,
        password: TEST_ACCOUNT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          name,
          role,
          ...(companyName ? { company_name: companyName } : {}),
        },
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
          ...(companyName ? { company_name: companyName } : {}),
        },
        app_metadata: { ...(user.app_metadata ?? {}), qa_account: true, role },
      }),
    },
  );
  await parseJsonResponse(updateResponse, `Supabase auth user update ${email}`);
  return { id: user.id, email };
};

const advertisers = Array.from({ length: ACCOUNT_COUNT }, (_, index) => {
  const number = index + 1;
  const samples = [
    {
      companyName: "브래드룸",
      manager: "브래드룸 매니저",
      category: "식품 · 라이프스타일",
      handle: "breadroom",
      logoUrl: "/images/brands/breadroom-logo.png",
    },
    {
      companyName: "오브레",
      manager: "오브레 마케팅",
      category: "뷰티 · 라이프스타일",
      handle: "obre-beauty",
      logoUrl: "/images/brands/obre-beauty-logo.png",
    },
    {
      companyName: "하우스핏",
      manager: "하우스핏 캠페인팀",
      category: "운동 · 헬스",
      handle: "housefit",
      logoUrl: "/images/brands/housefit-logo.png",
    },
    {
      companyName: "브루잉랩",
      manager: "브루잉랩 브랜드팀",
      category: "카페 · 식품",
      handle: "brewinglab",
      logoUrl: "/images/brands/brewinglab-logo.png",
    },
    {
      companyName: "나이트케어",
      manager: "나이트케어 마케터",
      category: "뷰티 · 헬스케어",
      handle: "nightcare",
      logoUrl: "/images/brands/nightcare-logo.png",
    },
  ];
  const sample = samples[index];
  return {
    number,
    email: `${sample.handle}@yeollock.me`,
    role: "marketer",
    name: sample.manager,
    companyName: sample.companyName,
    handle: sample.handle,
    category: sample.category,
  };
});

const influencers = Array.from({ length: ACCOUNT_COUNT }, (_, index) => {
  const number = index + 1;
  const samples = [
    { name: "민서홈", handle: "minseo.home", categories: ["lifestyle", "mukbang", "beauty"], avatarUrl: "/images/influencers/minseo-home.png" },
    { name: "오늘의취향", handle: "today.taste", categories: ["travel", "lifestyle", "mukbang"], avatarUrl: "/images/influencers/today-taste.png" },
    { name: "하루핏", handle: "haru.fit", categories: ["fitness", "lifestyle", "beauty"], avatarUrl: "/images/influencers/haru-fit.png" },
    { name: "지유로그", handle: "ziyu.log", categories: ["beauty", "fashion", "lifestyle"], avatarUrl: "/images/influencers/ziyu-log.png" },
    { name: "루나데이", handle: "luna.day", categories: ["tech", "education", "game"], avatarUrl: "/images/influencers/luna-day.png" },
  ];
  const sample = samples[index];
  return {
    number,
    email: `${sample.handle}@yeollock.me`,
    role: "influencer",
    name: sample.name,
    handle: sample.handle,
    avatarUrl: sample.avatarUrl,
    categories: sample.categories,
  };
});

const ensureAdvertiserProfile = async (account, user) => {
  const organizationId = stableUuid(`qa:scenario:organization:${user.id}`);
  const businessNumber = `90000000${pad(account.number)}`;

  await upsert(
    "profiles",
    [
      {
        id: user.id,
        role: "marketer",
        name: account.name,
        email: user.email,
        company_name: account.companyName,
        activity_categories: [],
        activity_platforms: [],
        verification_status: "approved",
        data_origin: "qa",
        email_verified_at: timestamp,
        updated_at: timestamp,
      },
    ],
    "id",
    "advertiser profile",
  );

  await upsert(
    "organizations",
    [
      {
        id: organizationId,
        name: account.companyName,
        organization_type: "advertiser",
        business_registration_number: businessNumber,
        business_verification_status: "approved",
        business_verified_at: timestamp,
        representative_name: `${account.companyName} 대표`,
        created_by_profile_id: user.id,
        updated_at: timestamp,
      },
    ],
    "id",
    "advertiser organization",
  );

  await upsert(
    "organization_members",
    [
      {
        organization_id: organizationId,
        profile_id: user.id,
        role: "owner",
        is_default: true,
      },
    ],
    "organization_id,profile_id",
    "advertiser organization member",
  );

  const verificationId = stableUuid(
    `qa:scenario:verification:advertiser:${organizationId}`,
  );
  await upsert(
    "verification_requests",
    [
      {
        id: verificationId,
        target_type: "advertiser_organization",
        target_id: organizationId,
        verification_type: "business_registration_certificate",
        status: "approved",
        profile_id: user.id,
        organization_id: organizationId,
        subject_name: account.companyName,
        submitted_by_name: account.name,
        submitted_by_email: user.email,
        business_registration_number: businessNumber,
        representative_name: `${account.companyName} 대표`,
        evidence_snapshot_json: {
          seeded: true,
          source: "marketplace-showcase-seed",
        },
        ownership_check_status: "not_run",
        note: "사업자 인증 승인 데이터",
        reviewed_by_name: "운영자",
        reviewed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    "id",
    "advertiser verification",
  );

  await upsert(
    "organizations",
    [
      {
        id: organizationId,
        name: account.companyName,
        organization_type: "advertiser",
        business_registration_number: businessNumber,
        representative_name: `${account.companyName} 대표`,
        created_by_profile_id: user.id,
        business_verification_request_id: verificationId,
        business_verification_status: "approved",
        business_verified_at: timestamp,
        updated_at: timestamp,
      },
    ],
    "id",
    "advertiser organization verification link",
  );

  return { ...account, user, organizationId };
};

const ensureInfluencerProfile = async (account, user) => {
  await upsert(
    "profiles",
    [
      {
        id: user.id,
        role: "influencer",
        name: account.name,
        email: user.email,
        avatar_url: account.avatarUrl,
        company_name: null,
        activity_categories: account.categories,
        activity_platforms: ["instagram", "youtube", "naver_blog"],
        verification_status: "approved",
        data_origin: "qa",
        email_verified_at: timestamp,
        updated_at: timestamp,
      },
    ],
    "id",
    "influencer profile",
  );

  const platformChallengeCodes = {
    instagram: "INST",
    youtube: "YOUT",
    naver_blog: "NAVR",
  };
  const verificationRows = ["instagram", "youtube", "naver_blog"].map(
    (platform) => {
      const handle =
        platform === "youtube" ? `@${account.handle}` : account.handle;
      const url =
        platform === "youtube"
          ? `https://youtube.com/@${account.handle}`
          : platform === "naver_blog"
            ? `https://blog.naver.com/${account.handle}`
            : `https://instagram.com/${account.handle}`;

      return {
        id: stableUuid(
          `qa:scenario:verification:influencer:${platform}:${user.id}`,
        ),
        target_type: "influencer_account",
        target_id: user.id,
        verification_type: "platform_account",
        status: "approved",
        profile_id: user.id,
        subject_name: account.name,
        submitted_by_email: user.email,
        platform,
        platform_handle: handle,
        platform_url: url,
        ownership_verification_method:
          platform === "youtube" ? "channel_description_code" : "profile_bio_code",
        ownership_challenge_code: `DS-C${pad(account.number)}A-${platformChallengeCodes[platform]}`,
        ownership_challenge_url: url,
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: {
          seeded: true,
          source: "marketplace-showcase-seed",
          platform,
        },
        note: "플랫폼 계정 인증 승인 데이터",
        reviewed_by_name: "운영자",
        reviewed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      };
    },
  );

  await upsert(
    "verification_requests",
    verificationRows,
    "id",
    "influencer verification",
  );

  return { ...account, user };
};

const buildCampaigns = (advertiser) => [
  {
    id: `showcase-campaign-${pad(advertiser.number)}-01`,
    title: `${advertiser.companyName} 신제품 언박싱 릴스`,
    type: "sponsored_post",
    budget: "150만-250만원",
    applicantLimit: "10명",
    summary: "신제품 사용 장면을 릴스와 스토리로 자연스럽게 소개할 크리에이터를 모집합니다.",
    deadline: addDays(7 + advertiser.number),
    platforms: ["instagram", "youtube"],
    deliverables: ["인스타그램 릴스 1건", "스토리 2건", "쇼츠 1건"],
    status: "open",
    createdAt: addDays(-5),
    updatedAt: timestamp,
    statusUpdatedAt: timestamp,
    statusUpdatedBy: advertiser.email,
    activityEvents: [
      {
        id: stableUuid(`qa:scenario:campaign-created:${advertiser.number}:1`),
        actor: advertiser.email,
        action: "campaign_created",
        description: "릴스 캠페인 모집을 시작했습니다.",
        createdAt: addDays(-5),
      },
    ],
  },
  {
    id: `showcase-campaign-${pad(advertiser.number)}-02`,
    title: `${advertiser.companyName} 서포터즈 블로그 미션`,
    type: "supporters",
    budget: "제품 제공(소비자가 79,000원 상당)",
    applicantLimit: "10명",
    summary: "제품을 직접 사용한 뒤 블로그 후기와 게시 유지 미션을 수행하는 캠페인입니다.",
    deadline: addDays(12 + advertiser.number),
    platforms: ["instagram", "naver_blog"],
    deliverables: ["네이버 블로그 후기 1건", "인스타그램 피드 1건"],
    status: "open",
    createdAt: addDays(-4),
    updatedAt: timestamp,
    statusUpdatedAt: timestamp,
    statusUpdatedBy: advertiser.email,
    activityEvents: [
      {
        id: stableUuid(`qa:scenario:campaign-created:${advertiser.number}:2`),
        actor: advertiser.email,
        action: "campaign_created",
        description: "제품 체험 리뷰 모집을 시작했습니다.",
        createdAt: addDays(-4),
      },
    ],
  },
  {
    id: `showcase-campaign-${pad(advertiser.number)}-03`,
    title: `${advertiser.companyName} 선정 크리에이터 계약`,
    type: advertiser.number % 2 === 0 ? "ppl" : "sponsored_post",
    budget: "200만-320만원",
    applicantLimit: "10명",
    summary: "모집을 마감하고 선정된 크리에이터와 계약 초안을 진행하는 상태입니다.",
    deadline: addDays(4 + advertiser.number),
    platforms: ["youtube", "instagram"],
    deliverables: ["유튜브 쇼츠 1건", "인스타그램 스토리 2건"],
    status: "closed",
    createdAt: addDays(-10),
    updatedAt: timestamp,
    statusUpdatedAt: timestamp,
    statusUpdatedBy: advertiser.email,
    closedAt: addDays(-1),
    activityEvents: [
      {
        id: stableUuid(`qa:scenario:campaign-created:${advertiser.number}:3`),
        actor: advertiser.email,
        action: "campaign_created",
        description: "선정형 캠페인 모집을 시작했습니다.",
        createdAt: addDays(-10),
      },
      {
        id: stableUuid(`qa:scenario:campaign-closed:${advertiser.number}:3`),
        actor: advertiser.email,
        action: "campaign_status_updated",
        description: "크리에이터 선정 후 모집을 마감했습니다.",
        createdAt: addDays(-1),
      },
    ],
  },
  {
    id: `showcase-campaign-${pad(advertiser.number)}-04`,
    title: `${advertiser.companyName} 완료 보관 캠페인`,
    type: "visit_review",
    budget: "120만원",
    applicantLimit: "10명",
    summary: "방문 리뷰 완료 후 계약 증빙을 보관하는 캠페인입니다.",
    deadline: addDays(-2),
    platforms: ["instagram", "naver_blog"],
    deliverables: ["방문 리뷰 1건", "증빙 링크 1건"],
    status: "ended",
    createdAt: addDays(-20),
    updatedAt: timestamp,
    statusUpdatedAt: timestamp,
    statusUpdatedBy: advertiser.email,
    endedAt: addDays(-1),
    activityEvents: [
      {
        id: stableUuid(`qa:scenario:campaign-created:${advertiser.number}:4`),
        actor: advertiser.email,
        action: "campaign_created",
        description: "완료 보관 캠페인을 등록했습니다.",
        createdAt: addDays(-20),
      },
      {
        id: stableUuid(`qa:scenario:campaign-ended:${advertiser.number}:4`),
        actor: advertiser.email,
        action: "campaign_status_updated",
        description: "캠페인이 완료 상태로 이동했습니다.",
        createdAt: addDays(-1),
      },
    ],
  },
];

const ensureBrandProfile = async (advertiser) => {
  const existingBrandProfile = await findByPublicHandle(
    "marketplace_brand_profiles",
    advertiser.handle,
    "marketplace brand profile",
  );
  const brandProfileId =
    existingBrandProfile?.id ??
    stableUuid(`qa:scenario:brand:${advertiser.organizationId}`);
  const campaigns = buildCampaigns(advertiser);

  const brandProfileRow = {
        id: brandProfileId,
        organization_id: advertiser.organizationId,
        public_handle: advertiser.handle,
        display_name: advertiser.companyName,
        category: advertiser.category,
        headline: `${advertiser.companyName} 광고 캠페인 보드`,
        description:
          "인플루언서 모집부터 선정자별 진행까지 한 화면에서 운영합니다.",
        location: "서울",
        logo_label: advertiser.companyName.slice(0, 1),
        logo_url: advertiser.logoUrl,
        preferred_platforms: ["instagram", "youtube", "naver_blog"],
        proposal_types: [
          "sponsored_post",
          "product_seeding",
          "supporters",
          "ppl",
          "visit_review",
        ],
        budget_range_label: "80만-320만원",
        response_time_label: "당일 검토",
        status_label: "모집 중",
        fit_tags: ["계약 진행", "콘텐츠 검수", "증빙 보관"],
        audience_targets: ["신규 크리에이터", "캠페인 지원자"],
        active_campaigns: campaigns,
        recent_creators: influencers.map((item) => item.name).slice(0, 3),
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

  return { ...advertiser, brandProfileId, campaigns };
};

const ensureMarketplaceInfluencer = async (influencer) => {
  const existingInfluencerProfile = await findByPublicHandle(
    "marketplace_influencer_profiles",
    influencer.handle,
    "marketplace influencer profile",
  );
  const influencerProfileId =
    existingInfluencerProfile?.id ??
    stableUuid(`qa:scenario:marketplace-influencer:${influencer.user.id}`);

  const influencerProfileRow = {
        id: influencerProfileId,
        owner_profile_id: influencer.user.id,
        public_handle: influencer.handle,
        display_name: influencer.name,
        headline: `${influencer.name} 인증 크리에이터`,
        bio:
          "생활 속 제품을 자연스럽게 소개하는 리뷰 콘텐츠를 만듭니다.",
        location: "서울",
        avatar_label: influencer.name.slice(0, 1),
        avatar_url: influencer.avatarUrl,
        categories: influencer.categories,
        audience: "라이프스타일 관심 팔로워",
        audience_tags: ["라이프스타일", "리뷰", "계약 가능"],
        collaboration_types: [
          "sponsored_post",
          "product_seeding",
          "supporters",
          "ppl",
          "visit_review",
        ],
        starting_price_label: "80만원부터",
        response_time_label: "당일 응답",
        verified_label: "인증 완료",
        brand_fit: ["빠른 검토", "명확한 콘텐츠", "계약 진행 가능"],
        recent_brands: advertisers.map((item) => item.companyName).slice(0, 3),
        portfolio: [
          {
            title: "신제품 릴스 콘텐츠",
            brand: "브래드룸",
            result: "릴스 캠페인 완료",
          },
        ],
        proposal_hints: [
          "캠페인 일정과 필수 콘텐츠를 먼저 알려주세요.",
          "2차 활용 범위는 계약서 초안 안에서 확인합니다.",
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
        id: stableUuid(`qa:scenario:channel:instagram:${influencerProfileId}`),
        profile_id: influencerProfileId,
        platform: "instagram",
        label: "Instagram",
        handle: influencer.handle,
        url: `https://instagram.com/${influencer.handle}`,
        followers_label: `${4 + influencer.number}.8K`,
        performance_label: "평균 참여율 5.2%",
        sort_order: 0,
        updated_at: timestamp,
      },
      {
        id: stableUuid(`qa:scenario:channel:youtube:${influencerProfileId}`),
        profile_id: influencerProfileId,
        platform: "youtube",
        label: "YouTube",
        handle: `@${influencer.handle}`,
        url: `https://youtube.com/@${influencer.handle}`,
        followers_label: `${1 + influencer.number}.2K`,
        performance_label: "쇼츠 제작 가능",
        sort_order: 1,
        updated_at: timestamp,
      },
    ],
    "id",
    "marketplace influencer channels",
  );

  return { ...influencer, influencerProfileId };
};

const campaignSnapshot = (brand, campaign) => ({
  id: campaign.id,
  title: campaign.title,
  type: campaign.type,
  budget: campaign.budget,
  summary: campaign.summary,
  deadline: campaign.deadline,
  platforms: campaign.platforms,
  deliverables: campaign.deliverables,
  brandId: brand.brandProfileId,
  brandHandle: brand.handle,
  brandName: brand.companyName,
  brandCategory: brand.category,
});

const proposalSummary = (brand, campaign, influencer) =>
  [
    `캠페인 지원: ${campaign.title}`,
    `브랜드: ${brand.companyName}`,
    `크리에이터: ${influencer.name}`,
    `지급내용: ${campaign.budget}`,
    `콘텐츠: ${campaign.deliverables.join(", ")}`,
    `플랫폼: ${campaign.platforms.join(", ")}`,
  ].join("\n");

const buildWorkflow = (status, dueAt) => {
  const meta = {
    DRAFT: {
      next_actor: "advertiser",
      next_action: "계약 초안을 완성하고 크리에이터에게 공유하세요.",
      risk_level: "low",
    },
    REVIEWING: {
      next_actor: "influencer",
      next_action: "크리에이터가 캠페인 계약을 검토해야 합니다.",
      risk_level: "medium",
    },
    NEGOTIATING: {
      next_actor: "advertiser",
      next_action: "광고주가 수정 요청에 답변해야 합니다.",
      risk_level: "high",
    },
    APPROVED: {
      next_actor: "influencer",
      next_action: "크리에이터가 승인된 계약에 서명할 수 있습니다.",
      risk_level: "medium",
    },
    SIGNED: {
      next_actor: "system",
      next_action: "서명 완료 계약입니다. 콘텐츠 증빙을 검토할 수 있습니다.",
      risk_level: "low",
    },
    CLOSED: {
      next_actor: "system",
      next_action: "계약 종료 후 증빙과 정산 확인 기록을 보관합니다.",
      risk_level: "low",
    },
  }[status];

  return {
    ...meta,
    due_at: status === "SIGNED" || status === "CLOSED" ? undefined : dueAt,
    last_message: meta.next_action,
  };
};

const buildEvidence = (status) => {
  if (status === "DRAFT") {
    return {
      share_token_status: "not_issued",
      audit_ready: false,
      pdf_status: "not_ready",
    };
  }

  if (status === "SIGNED" || status === "CLOSED") {
    return {
      share_token_status: "revoked",
      audit_ready: true,
      pdf_status: "signed_ready",
    };
  }

  return {
    share_token_status: "active",
    share_token: randomShareToken(),
    share_token_expires_at: addDays(14),
    audit_ready: true,
    pdf_status: "draft_ready",
  };
};

const buildClauses = (status, seed) => {
  const pendingStatus =
    status === "DRAFT" || status === "REVIEWING"
      ? "PENDING_REVIEW"
      : status === "NEGOTIATING"
        ? "MODIFICATION_REQUESTED"
        : "APPROVED";
  return [
    {
      clause_id: `${seed}-scope`,
      category: "캠페인 범위",
      content:
        "크리에이터는 합의한 플랫폼에 캠페인 콘텐츠를 게시하고 검토 가능한 증빙 링크를 보관합니다.",
      status: pendingStatus,
      history:
        status === "NEGOTIATING"
          ? [
              {
                id: stableUuid(`qa:scenario:clause-history:${seed}`),
                role: "influencer",
                action: "change_requested",
                comment: "크리에이터가 업로드 일정 명확화를 요청했습니다.",
                timestamp: addDays(-1),
              },
            ]
          : [],
    },
    {
      clause_id: `${seed}-payment`,
      category: "지급 조건",
      content:
        "광고주는 계약 조건에 따라 콘텐츠 검토 후 합의한 보상을 지급합니다.",
      status: status === "DRAFT" ? "PENDING_REVIEW" : "APPROVED",
      history: [],
    },
  ];
};

const buildContract = ({ brand, campaign, influencer, status, seed }) => {
  const contractId = stableUuid(`qa:scenario:contract:${seed}`);
  const finalStatus = status === "SIGNED" || status === "CLOSED";
  const createdAt = addDays(finalStatus ? -14 : -3);
  const updatedAt = finalStatus ? addDays(status === "CLOSED" ? -1 : -2) : timestamp;
  const shareEvidence = buildEvidence(status);
  const postLink =
    finalStatus
      ? `https://instagram.com/p/${brand.handle}-${influencer.handle}`
      : undefined;

  return {
    id: contractId,
    data_origin: "qa",
    advertiser_id: brand.user.id,
    campaign_name: campaign.title,
    post_link: postLink,
    advertiser_info: {
      name: brand.companyName,
      manager: brand.email,
    },
    type: "PPL",
    status,
    title: `${campaign.title} 계약`,
    influencer_info: {
      name: influencer.name,
      channel_url: `https://instagram.com/${influencer.handle}`,
      contact: influencer.email,
    },
    campaign: {
      budget: campaign.budget,
      deadline: campaign.deadline,
      upload_due_at: campaign.deadline,
      period: `${createdAt.slice(0, 10)} - ${campaign.deadline.slice(0, 10)}`,
      platforms: campaign.platforms.map((platform) =>
        platform === "youtube"
          ? "YOUTUBE"
          : platform === "naver_blog"
            ? "NAVER_BLOG"
            : platform === "tiktok"
              ? "TIKTOK"
              : "INSTAGRAM",
      ),
      deliverables: campaign.deliverables,
    },
    workflow: buildWorkflow(status, campaign.deadline),
    evidence: shareEvidence,
    audit_events: [
      {
        id: stableUuid(`qa:scenario:audit:accepted:${seed}`),
        actor: "advertiser",
        action: "campaign_application_accepted",
        description: "광고주가 캠페인 지원을 수락했습니다.",
        created_at: createdAt,
      },
      ...(finalStatus
        ? [
            {
              id: stableUuid(`qa:scenario:audit:signed:${seed}`),
              actor: "influencer",
              action: "contract_signed",
              description: "크리에이터가 계약에 전자서명했습니다.",
              created_at: updatedAt,
            },
          ]
        : []),
      ...(status === "CLOSED"
        ? [
            {
              id: stableUuid(`qa:scenario:audit:closed:${seed}`),
              actor: "advertiser",
              action: "contract_closed",
              description: "광고주가 정산 완료를 확인하고 계약을 종료했습니다.",
              created_at: updatedAt,
            },
          ]
        : []),
    ],
    clauses: buildClauses(status, seed),
    ...(finalStatus
      ? {
          settlement:
            status === "CLOSED"
              ? {
                  advertiser_confirmed_paid: true,
                  advertiser_confirmed_at: updatedAt,
                  advertiser_confirmed_by_profile_id: brand.user.id,
                  advertiser_confirmed_by_name: brand.name,
                  status: "confirmed_paid",
                }
              : undefined,
          signature_data: {
            adv_sign: "",
            inf_sign: "",
            signed_at: updatedAt,
            ip: "127.0.0.1",
            user_agent: "쇼케이스 시드",
            signer_name: influencer.name,
            signer_email: influencer.email,
            consent_text: "전자서명 동의가 완료되었습니다.",
            consent_text_version: `showcase-${addDays(0).slice(0, 10)}`,
            contract_hash: stableToken(`qa:scenario:contract-hash:${seed}`),
            signature_hash: stableToken(`qa:scenario:signature:${seed}`),
          },
          pdf_url: `/api/contracts/${contractId}/final-pdf`,
        }
      : {}),
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const contractRows = (contracts) =>
  contracts.map((contract) => ({
    id: contract.id,
    advertiser_id: contract.advertiser_id,
    title: contract.title,
    status: contract.status,
    influencer_name: contract.influencer_info.name,
    share_token: contract.evidence?.share_token ?? null,
    share_token_status: contract.evidence?.share_token_status ?? "not_issued",
    contract,
    campaign_name: contract.campaign_name,
    post_link: contract.post_link,
    created_at: contract.created_at,
    updated_at: contract.updated_at,
  }));

const buildScenarioRows = (brands, creators) => {
  const proposals = [];
  const contracts = [];

  brands.forEach((brand, brandIndex) => {
    const combinations = [
      { campaignIndex: 0, creatorIndex: brandIndex, status: "submitted" },
      {
        campaignIndex: 0,
        creatorIndex: (brandIndex + 1) % creators.length,
        status: "submitted",
      },
      {
        campaignIndex: 1,
        creatorIndex: (brandIndex + 2) % creators.length,
        status: "reviewed",
      },
      {
        campaignIndex: 1,
        creatorIndex: (brandIndex + 4) % creators.length,
        status: "closed",
      },
      {
        campaignIndex: 2,
        creatorIndex: (brandIndex + 3) % creators.length,
        status: "converted_to_contract",
        contractStatus: brandIndex % 2 === 0 ? "REVIEWING" : "NEGOTIATING",
      },
      {
        campaignIndex: 3,
        creatorIndex: (brandIndex + 4) % creators.length,
        status: "converted_to_contract",
        contractStatus: brandIndex % 2 === 0 ? "CLOSED" : "SIGNED",
      },
    ];

    combinations.forEach((combination) => {
      const campaign = brand.campaigns[combination.campaignIndex];
      const influencer = creators[combination.creatorIndex];
      const seed = `${brand.handle}:${campaign.id}:${influencer.handle}`;
      const contract = combination.contractStatus
        ? buildContract({
            brand,
            campaign,
            influencer,
            status: combination.contractStatus,
            seed,
          })
        : undefined;
      if (contract) contracts.push(contract);

      proposals.push({
        id: stableUuid(`qa:scenario:proposal:${seed}`),
        direction: "influencer_to_brand",
        target_brand_profile_id: brand.brandProfileId,
        target_handle: brand.handle,
        target_display_name: brand.companyName,
        sender_profile_id: influencer.user.id,
        sender_organization_id: null,
        sender_name: influencer.name,
        sender_intro: `${influencer.name} 님이 이 캠페인 진행이 가능합니다.`,
        proposal_type: campaign.type,
        proposal_summary: proposalSummary(brand, campaign, influencer),
        status: combination.status,
        campaign_id: campaign.id,
        campaign_snapshot: campaignSnapshot(brand, campaign),
        converted_contract_id: contract?.id ?? null,
        created_at: addDays(-2 - combination.campaignIndex),
        updated_at: contract ? contract.updated_at : timestamp,
      });
    });
  });

  return { proposals, contracts };
};

const verifyRows = async ({ brands, creators, proposals, contracts }) => {
  const profileEmails = [...advertisers, ...influencers]
    .map((account) => account.email)
    .join(",");
  const profileRows = await rest(
    "profiles",
    `?select=id,email&email=in.(${profileEmails})`,
    {},
    "QA profile verification",
  );
  const brandRows = await rest(
    "marketplace_brand_profiles",
    `?select=id,public_handle&public_handle=in.(${brands
      .map((brand) => brand.handle)
      .join(",")})`,
    {},
    "QA brand verification",
  );
  const creatorRows = await rest(
    "marketplace_influencer_profiles",
    `?select=id,public_handle&public_handle=in.(${creators
      .map((creator) => creator.handle)
      .join(",")})`,
    {},
    "QA creator verification",
  );
  const proposalRows = await rest(
    "marketplace_contact_proposals",
    `?select=id&id=in.(${proposals.map((proposal) => proposal.id).join(",")})`,
    {},
    "QA proposal verification",
  );
  const contractRowsResult = await rest(
    "directsign_contracts",
    `?select=id&id=in.(${contracts.map((contract) => contract.id).join(",")})`,
    {},
    "QA contract verification",
  );

  return {
    profiles: profileRows.length,
    brands: brandRows.length,
    creators: creatorRows.length,
    proposals: proposalRows.length,
    contracts: contractRowsResult.length,
  };
};

const advertiserUsers = [];
for (const account of advertisers) {
  const user = await ensureAuthUser(account);
  advertiserUsers.push(await ensureAdvertiserProfile(account, user));
}

const influencerUsers = [];
for (const account of influencers) {
  const user = await ensureAuthUser(account);
  influencerUsers.push(await ensureInfluencerProfile(account, user));
}

const brands = [];
for (const advertiser of advertiserUsers) {
  brands.push(await ensureBrandProfile(advertiser));
}

const creators = [];
for (const influencer of influencerUsers) {
  creators.push(await ensureMarketplaceInfluencer(influencer));
}

const { proposals, contracts } = buildScenarioRows(brands, creators);

await upsert(
  "marketplace_contact_proposals",
  proposals,
  "id",
  "QA campaign applications",
);

await upsert(
  "directsign_contracts",
  contractRows(contracts),
  "id",
  "QA contracts",
);

const verified = await verifyRows({ brands, creators, proposals, contracts });

console.log(
  JSON.stringify(
    {
      ok: true,
      accounts: {
        advertisers: advertiserUsers.map((account) => ({
          email: account.email,
          login_path: "/login/advertiser",
        })),
        influencers: influencerUsers.map((account) => ({
          email: account.email,
          login_path: "/login/influencer",
        })),
      },
      password: {
        configured_by: "QA_TEST_PASSWORD",
        printed: false,
      },
      seeded: {
        advertiser_accounts: advertiserUsers.length,
        influencer_accounts: influencerUsers.length,
        brand_profiles: brands.length,
        influencer_profiles: creators.length,
        campaign_posts: brands.reduce(
          (total, brand) => total + brand.campaigns.length,
          0,
        ),
        campaign_applications: proposals.length,
        converted_contracts: contracts.length,
      },
      verified,
      links: {
        public_campaigns: `${PUBLIC_SITE_URL}/influencer/campaigns`,
        advertiser_dashboard: `${PUBLIC_SITE_URL}/advertiser/dashboard`,
        influencer_dashboard: `${PUBLIC_SITE_URL}/influencer/dashboard`,
      },
    },
    null,
    2,
  ),
);
