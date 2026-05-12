import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const BASE_URL = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Supabase service environment is missing");
}

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const now = new Date();
const pad = (value) => String(value).padStart(2, "0");
const batch = `QA-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const password = process.env.QA_TEST_PASSWORD ?? "YeollockTest!2026";
const advertiserEmail = "test.advertiser@yeollock.me";
const influencerEmail = "test.influencer@yeollock.me";
const advertiserName = "QA Advertiser";
const influencerName = "QA Influencer";
const companyName = "QA Test Brand";
const signatureImageDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const CONTRACT_TYPE_SPONSOR = "\uD611\uCC2C";
const CONTRACT_TYPE_GROUPBUY = "\uACF5\uB3D9\uAD6C\uB9E4";

function stableUuid(seed) {
  const hash = crypto
    .createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hash[12] = "4";
  hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};
const dateOnly = (days) => addDays(days).slice(0, 10);
const shareToken = () => crypto.randomUUID().replaceAll("-", "");

async function parseJsonResponse(response, label) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${text.slice(0, 700)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function rest(table, query = "", init = {}, label = table) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    ...init,
    headers: {
      ...restHeaders,
      ...(init.headers ?? {}),
    },
  });
  return parseJsonResponse(response, `Supabase ${label}`);
}

function normalizeRows(rows) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return rows.map((row) =>
    Object.fromEntries(keys.map((key) => [key, row[key] ?? null])),
  );
}

async function upsert(table, rows, onConflict = "id", label = table) {
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
}

async function listAuthUsers() {
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
}

async function findAuthUserByEmail(email) {
  const normalized = email.toLowerCase();
  return (await listAuthUsers()).find(
    (user) => String(user.email ?? "").toLowerCase() === normalized,
  );
}

async function ensureAuthUser({ email, role, name, company_name }) {
  let user = await findAuthUserByEmail(email);
  if (!user) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: restHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, ...(company_name ? { company_name } : {}) },
        app_metadata: { qa_account: true, role },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (!body.toLowerCase().includes("already")) {
        throw new Error(
          `Supabase auth user create failed (${response.status}): ${body.slice(0, 700)}`,
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
        password,
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
}

async function ensureProfilesAndVerification(advertiser, influencer) {
  const timestamp = new Date().toISOString();
  await upsert(
    "profiles",
    [
      {
        id: advertiser.id,
        role: "marketer",
        name: advertiserName,
        email: advertiser.email,
        company_name: companyName,
        activity_categories: [],
        activity_platforms: [],
        verification_status: "approved",
        email_verified_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: influencer.id,
        role: "influencer",
        name: influencerName,
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
    stableUuid(`qa-matrix:organization:${advertiser.id}`);

  await upsert(
    "organizations",
    [
      {
        id: organizationId,
        name: companyName,
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

  const advertiserVerificationId = stableUuid(
    `qa-matrix:advertiser-verification:${advertiser.id}:${organizationId}`,
  );
  const platformVerifications = [
    ["instagram", "yeollock_test_creator", "https://www.instagram.com/yeollock_test_creator"],
    ["youtube", "yeollock_test_creator", "https://www.youtube.com/@yeollock_test_creator"],
    ["naver_blog", "yeollock_test_creator", "https://blog.naver.com/yeollock_test_creator"],
  ];

  await upsert(
    "verification_requests",
    [
      {
        id: advertiserVerificationId,
        target_type: "advertiser_organization",
        target_id: organizationId,
        verification_type: "business_registration_certificate",
        status: "approved",
        profile_id: advertiser.id,
        organization_id: organizationId,
        subject_name: companyName,
        submitted_by_name: advertiserName,
        submitted_by_email: advertiser.email,
        business_registration_number: "1234567890",
        representative_name: "QA Representative",
        document_issue_date: "2026-05-11",
        evidence_snapshot_json: { qa_seed: batch },
        reviewer_note: "QA matrix seed approval",
        reviewed_by_name: "QA automation",
        reviewed_at: timestamp,
        ownership_check_status: "not_run",
        created_at: timestamp,
        updated_at: timestamp,
      },
      ...platformVerifications.map(([platform, handle, platformUrl]) => ({
        id: stableUuid(
          `qa-matrix:influencer-verification:${influencer.id}:${platform}:${platformUrl}`,
        ),
        target_type: "influencer_account",
        target_id: influencer.id,
        verification_type: "platform_account",
        status: "approved",
        profile_id: influencer.id,
        subject_name: influencerName,
        submitted_by_name: influencerName,
        submitted_by_email: influencer.email,
        platform,
        platform_handle: handle,
        platform_url: platformUrl,
        ownership_verification_method: "screenshot_review",
        ownership_challenge_code: "DS-QA11-2026",
        ownership_challenge_url: platformUrl,
        ownership_check_status: "not_run",
        ownership_checked_at: timestamp,
        evidence_snapshot_json: { qa_seed: batch, platform },
        reviewer_note: "QA matrix seed approval",
        reviewed_by_name: "QA automation",
        reviewed_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      })),
    ],
    "id",
    "verification requests",
  );

  await upsert(
    "organizations",
    [
      {
        id: organizationId,
        name: companyName,
        organization_type: "advertiser",
        business_verification_request_id: advertiserVerificationId,
        business_verification_status: "approved",
        business_verified_at: timestamp,
        representative_name: "QA Representative",
        updated_at: timestamp,
      },
    ],
    "id",
    "organization verification link",
  );

  return { organizationId };
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*(?:directsign_|yeollock_))/g) : [];
}

const cookieHeaderFrom = (response) =>
  getSetCookies(response)
    .map((cookie) => cookie.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

async function login(path, email) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${body.slice(0, 700)}`);
  }
  const cookie = cookieHeaderFrom(response);
  if (!cookie) throw new Error(`${path} did not return session cookies`);
  return { cookie, body: JSON.parse(body) };
}

async function appJson(path, init = {}, label = path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  return parseJsonResponse(response, label);
}

const types = [
  {
    type: CONTRACT_TYPE_SPONSOR,
    displayType: "sponsor",
    typeSlug: "sponsor",
    platform: "INSTAGRAM",
    platformName: "Instagram",
    channelUrl: "https://www.instagram.com/yeollock_test_creator",
    budget: "1500000 KRW",
    deliverable: "Instagram Reels 1 / 30s",
  },
  {
    type: "PPL",
    displayType: "PPL",
    typeSlug: "ppl",
    platform: "YOUTUBE",
    platformName: "YouTube",
    channelUrl: "https://www.youtube.com/@yeollock_test_creator",
    budget: "2400000 KRW",
    deliverable: "YouTube Shorts 1 / 45s",
  },
  {
    type: CONTRACT_TYPE_GROUPBUY,
    displayType: "groupbuy",
    typeSlug: "groupbuy",
    platform: "NAVER_BLOG",
    platformName: "Naver Blog",
    channelUrl: "https://blog.naver.com/yeollock_test_creator",
    budget: "18% commission",
    deliverable: "Naver Blog review 1 / post",
  },
];

const stages = [
  {
    key: "draft",
    label: "Draft",
    status: "DRAFT",
    nextActor: "advertiser",
    clauseStatus: "PENDING_REVIEW",
    dueDays: 5,
    risk: "low",
  },
  {
    key: "reviewing",
    label: "Review needed",
    status: "REVIEWING",
    nextActor: "influencer",
    clauseStatus: "PENDING_REVIEW",
    dueDays: 3,
    risk: "medium",
  },
  {
    key: "negotiating",
    label: "Change requested",
    status: "NEGOTIATING",
    nextActor: "advertiser",
    clauseStatus: "MODIFICATION_REQUESTED",
    dueDays: 1,
    risk: "high",
  },
  {
    key: "approved",
    label: "Ready to sign",
    status: "APPROVED",
    nextActor: "influencer",
    clauseStatus: "APPROVED",
    dueDays: 2,
    risk: "medium",
  },
  {
    key: "deliverables_due",
    label: "Deliverables due",
    status: "APPROVED",
    nextActor: "influencer",
    clauseStatus: "APPROVED",
    dueDays: 4,
    risk: "medium",
    sign: true,
    deliverables: true,
  },
  {
    key: "deliverables_review",
    label: "Deliverables review",
    status: "APPROVED",
    nextActor: "influencer",
    clauseStatus: "APPROVED",
    dueDays: 4,
    risk: "medium",
    sign: true,
    deliverables: true,
    submitDeliverable: true,
  },
  {
    key: "completed",
    label: "Completed",
    status: "APPROVED",
    nextActor: "influencer",
    clauseStatus: "APPROVED",
    dueDays: 4,
    risk: "low",
    sign: true,
    deliverables: true,
    submitDeliverable: true,
    approveDeliverable: true,
  },
];

function buildClauses(typeInfo, stage) {
  return [
    {
      clause_id: "scope",
      category: "Content scope",
      content: `${typeInfo.platformName} ${typeInfo.deliverable} must include ad disclosure.`,
      status:
        stage.clauseStatus === "MODIFICATION_REQUESTED"
          ? "APPROVED"
          : stage.clauseStatus,
      history: [],
    },
    {
      clause_id: "payment",
      category: "Payment terms",
      content: `${typeInfo.displayType} fee is ${typeInfo.budget}.`,
      status: stage.clauseStatus,
      history:
        stage.clauseStatus === "MODIFICATION_REQUESTED"
          ? [
              {
                id: crypto.randomUUID(),
                role: "influencer",
                action: "Change requested",
                comment: "QA change request for dashboard stage coverage.",
                timestamp: addDays(-1),
              },
            ]
          : [],
    },
  ];
}

function buildContract(typeInfo, stage, advertiserId) {
  const id = crypto.randomUUID();
  const activeShare = stage.status !== "DRAFT";
  const created = addDays(-2);
  return {
    id,
    advertiser_id: advertiserId,
    advertiser_info: { name: companyName, manager: advertiserName },
    type: typeInfo.type,
    status: stage.status,
    title: `[${batch}] ${typeInfo.displayType} / ${stage.label}`,
    influencer_info: {
      name: influencerName,
      channel_url: typeInfo.channelUrl,
      contact: influencerEmail,
    },
    campaign: {
      budget: typeInfo.budget,
      start_date: dateOnly(1),
      end_date: dateOnly(21),
      deadline: dateOnly(stage.dueDays),
      upload_due_at: dateOnly(stage.dueDays),
      review_due_at: dateOnly(stage.dueDays + 2),
      revision_limit: "2",
      disclosure_text: "#ad #sponsored",
      tracking_link: `https://yeollock.me/qa/${batch}/${typeInfo.typeSlug}/${stage.key}`,
      period: `${dateOnly(1)} - ${dateOnly(21)}`,
      platforms: [typeInfo.platform],
      deliverables: stage.deliverables ? [typeInfo.deliverable] : [],
    },
    workflow: {
      next_actor: stage.nextActor,
      next_action: `[QA] ${stage.label}`,
      due_at: addDays(stage.dueDays),
      last_message: stage.key === "negotiating" ? "QA change request state." : undefined,
      risk_level: stage.risk,
    },
    evidence: {
      share_token_status: activeShare ? "active" : "not_issued",
      share_token: activeShare ? shareToken() : undefined,
      share_token_expires_at: activeShare ? addDays(7) : undefined,
      audit_ready: activeShare,
      pdf_status: activeShare ? "draft_ready" : "not_ready",
    },
    audit_events: [
      {
        id: crypto.randomUUID(),
        actor: "advertiser",
        action: stage.status === "DRAFT" ? "draft_saved" : "qa_contract_seeded",
        description: `[QA] ${batch} ${typeInfo.displayType} ${stage.label}`,
        created_at: created,
      },
    ],
    clauses: buildClauses(typeInfo, stage),
    created_at: created,
    updated_at: new Date().toISOString(),
  };
}

async function putContract(contract, advertiserCookie) {
  const response = await fetch(
    `${BASE_URL}/api/contracts/${encodeURIComponent(contract.id)}`,
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
}

async function signContract(contractId, influencerCookie) {
  const response = await fetch(
    `${BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/signatures/influencer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: influencerCookie },
      body: JSON.stringify({
        signature_data: signatureImageDataUrl,
        signer_name: influencerName,
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
}

async function submitDeliverable(contractId, typeInfo, influencerCookie) {
  const response = await fetch(
    `${BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/deliverables`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: influencerCookie },
      body: JSON.stringify({
        title: `${typeInfo.platformName} QA content`,
        url: `${typeInfo.channelUrl.replace(/\/$/, "")}/qa-${batch.toLowerCase()}`,
        note: `[QA] ${batch} deliverable submission`,
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
}

async function approveDeliverable(contractId, deliverableId, advertiserCookie) {
  const response = await fetch(
    `${BASE_URL}/api/contracts/${encodeURIComponent(contractId)}/deliverables/${encodeURIComponent(
      deliverableId,
    )}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: advertiserCookie },
      body: JSON.stringify({
        review_status: "approved",
        review_comment: `[QA] ${batch} approved`,
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
}

const advertiser = await ensureAuthUser({
  email: advertiserEmail,
  role: "marketer",
  name: advertiserName,
  company_name: companyName,
});
const influencer = await ensureAuthUser({
  email: influencerEmail,
  role: "influencer",
  name: influencerName,
});
const { organizationId } = await ensureProfilesAndVerification(advertiser, influencer);
const advertiserSession = await login("/api/advertiser/login", advertiserEmail);
const influencerSession = await login("/api/influencer/login", influencerEmail);

const created = [];
const deliveryChecks = [];
for (const typeInfo of types) {
  for (const stage of stages) {
    let contract = await putContract(
      buildContract(typeInfo, stage, advertiser.id),
      advertiserSession.cookie,
    );
    if (stage.sign) contract = await signContract(contract.id, influencerSession.cookie);

    let deliverable;
    if (stage.submitDeliverable) {
      deliverable = await submitDeliverable(contract.id, typeInfo, influencerSession.cookie);
    }
    if (stage.approveDeliverable && deliverable?.id) {
      deliverable = await approveDeliverable(
        contract.id,
        deliverable.id,
        advertiserSession.cookie,
      );
    }
    if (stage.deliverables) {
      const bundle = await appJson(
        `/api/contracts/${encodeURIComponent(contract.id)}/deliverables`,
        { headers: { Cookie: advertiserSession.cookie } },
        `deliverable bundle ${contract.id}`,
      );
      deliveryChecks.push({
        type: typeInfo.displayType,
        stage: stage.key,
        total: bundle.summary?.total,
        submitted: bundle.summary?.submitted,
        approved: bundle.summary?.approved,
      });
    }
    created.push({
      id: contract.id,
      type: typeInfo.displayType,
      stage: stage.key,
      title: contract.title,
      status: contract.status,
    });
  }
}

const advertiserContractsResponse = await appJson(
  "/api/contracts",
  { headers: { Cookie: advertiserSession.cookie } },
  "advertiser contract list",
);
const advertiserContracts = (advertiserContractsResponse.contracts ?? []).filter((contract) =>
  contract.title?.includes(`[${batch}]`),
);
const advertiserStatusCounts = advertiserContracts.reduce((acc, contract) => {
  acc[contract.status] = (acc[contract.status] ?? 0) + 1;
  return acc;
}, {});

const influencerDashboard = await appJson(
  "/api/influencer/dashboard",
  { headers: { Cookie: influencerSession.cookie } },
  "influencer dashboard",
);
const influencerContracts = (influencerDashboard.contracts ?? []).filter((contract) =>
  contract.title?.includes(`[${batch}]`),
);
const influencerStageCounts = influencerContracts.reduce((acc, contract) => {
  acc[contract.stage] = (acc[contract.stage] ?? 0) + 1;
  return acc;
}, {});

const expectedTotal = types.length * stages.length;
const checks = [
  ["created contract count", created.length === expectedTotal, created.length],
  ["advertiser list count", advertiserContracts.length === expectedTotal, advertiserContracts.length],
  [
    "influencer visible non-draft count",
    influencerContracts.length === expectedTotal - types.length,
    influencerContracts.length,
  ],
  ["advertiser DRAFT count", advertiserStatusCounts.DRAFT === 3, advertiserStatusCounts.DRAFT ?? 0],
  [
    "advertiser REVIEWING count",
    advertiserStatusCounts.REVIEWING === 3,
    advertiserStatusCounts.REVIEWING ?? 0,
  ],
  [
    "advertiser NEGOTIATING count",
    advertiserStatusCounts.NEGOTIATING === 3,
    advertiserStatusCounts.NEGOTIATING ?? 0,
  ],
  [
    "advertiser APPROVED count",
    advertiserStatusCounts.APPROVED === 3,
    advertiserStatusCounts.APPROVED ?? 0,
  ],
  ["advertiser SIGNED count", advertiserStatusCounts.SIGNED === 9, advertiserStatusCounts.SIGNED ?? 0],
  [
    "influencer review_needed count",
    influencerStageCounts.review_needed === 3,
    influencerStageCounts.review_needed ?? 0,
  ],
  [
    "influencer change_pending count",
    influencerStageCounts.change_pending === 3,
    influencerStageCounts.change_pending ?? 0,
  ],
  [
    "influencer ready_to_sign count",
    influencerStageCounts.ready_to_sign === 3,
    influencerStageCounts.ready_to_sign ?? 0,
  ],
  [
    "influencer deliverables_due count",
    influencerStageCounts.deliverables_due === 3,
    influencerStageCounts.deliverables_due ?? 0,
  ],
  [
    "influencer deliverables_review count",
    influencerStageCounts.deliverables_review === 3,
    influencerStageCounts.deliverables_review ?? 0,
  ],
  [
    "influencer completed count",
    influencerStageCounts.completed === 3,
    influencerStageCounts.completed ?? 0,
  ],
  [
    "delivery due summaries",
    deliveryChecks
      .filter((item) => item.stage === "deliverables_due")
      .every((item) => item.total === 1 && item.submitted === 0 && item.approved === 0),
    deliveryChecks.filter((item) => item.stage === "deliverables_due"),
  ],
  [
    "delivery review summaries",
    deliveryChecks
      .filter((item) => item.stage === "deliverables_review")
      .every((item) => item.total === 1 && item.submitted === 1 && item.approved === 0),
    deliveryChecks.filter((item) => item.stage === "deliverables_review"),
  ],
  [
    "delivery completed summaries",
    deliveryChecks
      .filter((item) => item.stage === "completed")
      .every((item) => item.total === 1 && item.submitted === 1 && item.approved === 1),
    deliveryChecks.filter((item) => item.stage === "completed"),
  ],
];
const failed = checks.filter(([, ok]) => !ok);

console.log(
  JSON.stringify(
    {
      batch,
      base_url: BASE_URL,
      accounts: {
        advertiser: advertiser.email,
        influencer: influencer.email,
        organization_id: organizationId,
      },
      created_contracts: created.length,
      advertiser_status_counts: advertiserStatusCounts,
      influencer_stage_counts: influencerStageCounts,
      delivery_checks: deliveryChecks,
      sample_contracts: created.slice(0, 5),
      checks: checks.map(([name, ok, observed]) => ({ name, ok, observed })),
      failed_checks: failed.map(([name, , observed]) => ({ name, observed })),
    },
    null,
    2,
  ),
);

if (failed.length) process.exit(1);
