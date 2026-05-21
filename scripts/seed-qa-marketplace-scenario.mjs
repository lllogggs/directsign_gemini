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

const ACCOUNT_COUNT = 5;
const timestamp = new Date().toISOString();

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Supabase service environment is missing");
}

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

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
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
  const suffix = pad(number);
  return {
    number,
    email: `qa.advertiser${suffix}@yeollock.me`,
    role: "marketer",
    name: `QA Advertiser ${suffix}`,
    companyName: `QA Brand ${suffix}`,
    handle: `qa-brand-${suffix}`,
    category: ["Beauty", "Travel", "Tech", "Lifestyle", "Food"][index],
  };
});

const influencers = Array.from({ length: ACCOUNT_COUNT }, (_, index) => {
  const number = index + 1;
  const suffix = pad(number);
  return {
    number,
    email: `qa.influencer${suffix}@yeollock.me`,
    role: "influencer",
    name: `QA Creator ${suffix}`,
    handle: `qa-creator-${suffix}`,
    categories: [
      ["beauty", "lifestyle", "fashion"],
      ["travel", "lifestyle", "mukbang"],
      ["tech", "education", "game"],
      ["fitness", "lifestyle", "beauty"],
      ["finance", "education", "tech"],
    ][index],
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
        representative_name: `${account.companyName} Owner`,
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
        representative_name: `${account.companyName} Owner`,
        evidence_snapshot_json: {
          seeded: true,
          source: "seed-qa-marketplace-scenario",
        },
        ownership_check_status: "not_run",
        note: "QA advertiser verification seed",
        reviewed_by_name: "QA Operator",
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
        representative_name: `${account.companyName} Owner`,
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
        company_name: null,
        activity_categories: account.categories,
        activity_platforms: ["instagram", "youtube", "naver_blog"],
        verification_status: "approved",
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
        ownership_challenge_code: `DS-QA${pad(account.number)}-${platformChallengeCodes[platform]}`,
        ownership_challenge_url: url,
        ownership_check_status: "matched",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: {
          seeded: true,
          source: "seed-qa-marketplace-scenario",
          platform,
        },
        note: "QA influencer platform verification seed",
        reviewed_by_name: "QA Operator",
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
    id: `qa-campaign-${pad(advertiser.number)}-01`,
    title: `${advertiser.companyName} launch reels`,
    type: "sponsored_post",
    budget: "KRW 1,500,000 - 2,500,000",
    applicantLimit: `${4 + advertiser.number} creators`,
    summary: "Recruiting creators for launch reels and story mentions.",
    deadline: addDays(7 + advertiser.number),
    platforms: ["instagram", "youtube"],
    deliverables: ["Instagram Reels 1", "Story 2", "Shorts 1"],
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
        description: "QA recruiting campaign opened.",
        createdAt: addDays(-5),
      },
    ],
  },
  {
    id: `qa-campaign-${pad(advertiser.number)}-02`,
    title: `${advertiser.companyName} product review`,
    type: "product_seeding",
    budget: "Product seeding + KRW 800,000",
    applicantLimit: `${3 + (advertiser.number % 3)} creators`,
    summary: "Product review campaign for detailed feed and blog content.",
    deadline: addDays(12 + advertiser.number),
    platforms: ["instagram", "naver_blog"],
    deliverables: ["Feed post 1", "Naver Blog review 1"],
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
        description: "QA product review campaign opened.",
        createdAt: addDays(-4),
      },
    ],
  },
  {
    id: `qa-campaign-${pad(advertiser.number)}-03`,
    title: `${advertiser.companyName} accepted creator round`,
    type: advertiser.number % 2 === 0 ? "ppl" : "sponsored_post",
    budget: "KRW 2,000,000 - 3,200,000",
    applicantLimit: `${2 + (advertiser.number % 2)} creators`,
    summary: "Recruiting is closed and accepted creators are moving to contracts.",
    deadline: addDays(4 + advertiser.number),
    platforms: ["youtube", "instagram"],
    deliverables: ["YouTube Shorts 1", "Instagram Story 2"],
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
        description: "QA campaign opened.",
        createdAt: addDays(-10),
      },
      {
        id: stableUuid(`qa:scenario:campaign-closed:${advertiser.number}:3`),
        actor: advertiser.email,
        action: "campaign_status_updated",
        description: "Recruiting closed after selecting creators.",
        createdAt: addDays(-1),
      },
    ],
  },
  {
    id: `qa-campaign-${pad(advertiser.number)}-04`,
    title: `${advertiser.companyName} completed archive`,
    type: "visit_review",
    budget: "KRW 1,200,000",
    applicantLimit: "1 creator",
    summary: "Archived QA campaign for ended-state dashboard checks.",
    deadline: addDays(-2),
    platforms: ["instagram", "naver_blog"],
    deliverables: ["Visit review 1", "Proof link 1"],
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
        description: "QA ended campaign opened.",
        createdAt: addDays(-20),
      },
      {
        id: stableUuid(`qa:scenario:campaign-ended:${advertiser.number}:4`),
        actor: advertiser.email,
        action: "campaign_status_updated",
        description: "Campaign moved to ended state.",
        createdAt: addDays(-1),
      },
    ],
  },
];

const ensureBrandProfile = async (advertiser) => {
  const brandProfileId = stableUuid(
    `qa:scenario:brand:${advertiser.organizationId}`,
  );
  const campaigns = buildCampaigns(advertiser);

  await upsert(
    "marketplace_brand_profiles",
    [
      {
        id: brandProfileId,
        organization_id: advertiser.organizationId,
        public_handle: advertiser.handle,
        display_name: advertiser.companyName,
        category: advertiser.category,
        headline: `${advertiser.companyName} QA campaign board`,
        description:
          "QA brand profile used to verify recruiting, applicant review, contract conversion, and ended campaign states.",
        location: "Seoul",
        logo_label: `A${advertiser.number}`,
        preferred_platforms: ["instagram", "youtube", "naver_blog"],
        proposal_types: [
          "sponsored_post",
          "product_seeding",
          "ppl",
          "visit_review",
        ],
        budget_range_label: "KRW 800,000 - 3,200,000",
        response_time_label: "QA same-day review",
        status_label: "Recruiting",
        fit_tags: ["QA", "Campaign operations", "Contract flow"],
        audience_targets: ["New creators", "Campaign applicants"],
        active_campaigns: campaigns,
        recent_creators: influencers.map((item) => item.name).slice(0, 3),
        is_published: true,
        updated_at: timestamp,
      },
    ],
    "organization_id",
    "marketplace brand profile",
  );

  return { ...advertiser, brandProfileId, campaigns };
};

const ensureMarketplaceInfluencer = async (influencer) => {
  const influencerProfileId = stableUuid(
    `qa:scenario:marketplace-influencer:${influencer.user.id}`,
  );

  await upsert(
    "marketplace_influencer_profiles",
    [
      {
        id: influencerProfileId,
        owner_profile_id: influencer.user.id,
        public_handle: influencer.handle,
        display_name: influencer.name,
        headline: `${influencer.name} QA verified creator`,
        bio:
          "QA creator profile used to verify campaign discovery, applications, platform review, and contract progress.",
        location: "Seoul",
        avatar_label: `C${influencer.number}`,
        categories: influencer.categories,
        audience: "QA audience for workflow testing",
        audience_tags: ["QA", "Workflow", "Contract"],
        collaboration_types: [
          "sponsored_post",
          "product_seeding",
          "ppl",
          "visit_review",
        ],
        starting_price_label: "KRW 800,000",
        response_time_label: "QA same-day response",
        verified_label: "Verified QA creator",
        brand_fit: ["Fast review", "Clear deliverables", "Contract-ready"],
        recent_brands: advertisers.map((item) => item.companyName).slice(0, 3),
        portfolio: [
          {
            title: "QA launch content",
            brand: "QA Brand",
            result: "Workflow verified",
          },
        ],
        proposal_hints: [
          "Include campaign schedule and required deliverables.",
          "Confirm usage rights inside the contract draft.",
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
        id: stableUuid(`qa:scenario:channel:instagram:${influencerProfileId}`),
        profile_id: influencerProfileId,
        platform: "instagram",
        label: "Instagram",
        handle: influencer.handle,
        url: `https://instagram.com/${influencer.handle}`,
        followers_label: `${4 + influencer.number}.8K`,
        performance_label: "QA engagement 5.2%",
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
        performance_label: "QA shorts ready",
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
    `Campaign application: ${campaign.title}`,
    `Brand: ${brand.companyName}`,
    `Creator: ${influencer.name}`,
    `Budget: ${campaign.budget}`,
    `Deliverables: ${campaign.deliverables.join(", ")}`,
    `Platforms: ${campaign.platforms.join(", ")}`,
  ].join("\n");

const buildWorkflow = (status, dueAt) => {
  const meta = {
    DRAFT: {
      next_actor: "advertiser",
      next_action: "Complete the draft and share it with the creator.",
      risk_level: "low",
    },
    REVIEWING: {
      next_actor: "influencer",
      next_action: "Creator needs to review the campaign contract.",
      risk_level: "medium",
    },
    NEGOTIATING: {
      next_actor: "advertiser",
      next_action: "Advertiser needs to respond to the requested changes.",
      risk_level: "high",
    },
    APPROVED: {
      next_actor: "influencer",
      next_action: "Creator can sign the approved contract.",
      risk_level: "medium",
    },
    SIGNED: {
      next_actor: "system",
      next_action: "Contract signed. Deliverable evidence can be reviewed.",
      risk_level: "low",
    },
  }[status];

  return {
    ...meta,
    due_at: status === "SIGNED" ? undefined : dueAt,
    last_message: meta.next_action,
  };
};

const buildEvidence = (status, seed) => {
  if (status === "DRAFT") {
    return {
      share_token_status: "not_issued",
      audit_ready: false,
      pdf_status: "not_ready",
    };
  }

  if (status === "SIGNED") {
    return {
      share_token_status: "revoked",
      audit_ready: true,
      pdf_status: "signed_ready",
    };
  }

  return {
    share_token_status: "active",
    share_token: stableToken(`qa:scenario:share:${seed}`),
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
      category: "Campaign scope",
      content:
        "Creator will publish the agreed campaign content on the listed platforms and keep proof links available for review.",
      status: pendingStatus,
      history:
        status === "NEGOTIATING"
          ? [
              {
                id: stableUuid(`qa:scenario:clause-history:${seed}`),
                role: "influencer",
                action: "change_requested",
                comment: "Creator requested clearer upload timing.",
                timestamp: addDays(-1),
              },
            ]
          : [],
    },
    {
      clause_id: `${seed}-payment`,
      category: "Payment terms",
      content:
        "Advertiser will pay the agreed fixed fee after deliverable review under the contract terms.",
      status: status === "DRAFT" ? "PENDING_REVIEW" : "APPROVED",
      history: [],
    },
  ];
};

const buildContract = ({ brand, campaign, influencer, status, seed }) => {
  const contractId = stableUuid(`qa:scenario:contract:${seed}`);
  const createdAt = addDays(status === "SIGNED" ? -14 : -3);
  const updatedAt = status === "SIGNED" ? addDays(-2) : timestamp;
  const shareEvidence = buildEvidence(status, seed);
  const postLink =
    status === "SIGNED"
      ? `https://instagram.com/p/${brand.handle}-${influencer.handle}`
      : undefined;

  return {
    id: contractId,
    advertiser_id: brand.user.id,
    campaign_name: campaign.title,
    post_link: postLink,
    advertiser_info: {
      name: brand.companyName,
      manager: brand.email,
    },
    type: "PPL",
    status,
    title: `${campaign.title} contract`,
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
        description: "Advertiser accepted the QA campaign application.",
        created_at: createdAt,
      },
      ...(status === "SIGNED"
        ? [
            {
              id: stableUuid(`qa:scenario:audit:signed:${seed}`),
              actor: "influencer",
              action: "contract_signed",
              description: "Creator signed the QA contract.",
              created_at: updatedAt,
            },
          ]
        : []),
    ],
    clauses: buildClauses(status, seed),
    ...(status === "SIGNED"
      ? {
          signature_data: {
            adv_sign: "",
            inf_sign: "",
            signed_at: updatedAt,
            ip: "127.0.0.1",
            user_agent: "QA seed",
            signer_name: influencer.name,
            signer_email: influencer.email,
            consent_text: "QA e-sign consent accepted.",
            consent_text_version: "qa-2026-05-21",
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
        campaignIndex: 2,
        creatorIndex: (brandIndex + 3) % creators.length,
        status: "converted_to_contract",
        contractStatus: brandIndex % 2 === 0 ? "REVIEWING" : "NEGOTIATING",
      },
      {
        campaignIndex: 3,
        creatorIndex: (brandIndex + 4) % creators.length,
        status: "converted_to_contract",
        contractStatus: brandIndex % 2 === 0 ? "APPROVED" : "SIGNED",
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
        sender_intro: `${influencer.name} is available for this QA campaign.`,
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
