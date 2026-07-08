import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

function isStrongGamingRow(row) {
  const text = [
    row.display_name,
    row.platform_handle,
    row.public_handle,
    row.headline,
    row.bio,
    row.source_keyword,
  ]
    .join(" ")
    .toLowerCase();

  return /(?:archived:[^:]+:gaming|gaming|gamer|gameplay|gameplays|games\b|game\s*over|게임\s*(?:유튜버|크리에이터|리뷰|방송|스트리머|공략|플레이)|게이머|게임플레이|게임\s*채널|minecraft|roblox|league of legends|valorant|battlegrounds|pubg|fortnite|메이플랜드|메이플스토리|마인크래프트|로블록스|발로란트|배틀그라운드|리그오브레전드|모바일게임)/i.test(
    text,
  );
}

async function fetchCandidates(from, to) {
  const query = new URLSearchParams();
  query.set(
    "select",
    "id,display_name,platform_handle,public_handle,headline,bio,categories,source_keyword,source_provider,source_evidence",
  );
  query.set(
    "or",
    "(source_keyword.ilike.*gaming*,source_keyword.ilike.*game*,display_name.ilike.*gamer*,display_name.ilike.*games*,display_name.ilike.*gaming*,platform_handle.ilike.*game*,public_handle.ilike.*game*)",
  );

  const response = await fetch(
    `${supabaseUrl}/rest/v1/discovered_influencer_profiles?${query}`,
    {
      headers: {
        ...headers,
        Prefer: "count=exact",
        Range: `${from}-${to}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Candidate read failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }
  const total = Number((response.headers.get("content-range") || "").split("/")[1]);
  return { rows: await response.json(), total };
}

async function patchRows(rows) {
  let updated = 0;
  for (const row of rows) {
    const currentCategories = row.categories ?? [];
    const categories = Array.from(
      new Set([
        "게임",
        "엔터테인먼트",
        "콘텐츠",
        ...currentCategories.filter(
          (category) =>
            ![
              "게임",
              "리빙",
              "라이프스타일",
              "홈",
              "IT",
              "생활가전",
              "테크",
              "엔터테인먼트",
              "콘텐츠",
            ].includes(category),
        ),
      ]),
    ).slice(0, 6);

    const headline = /instagram/i.test(row.headline ?? "")
      ? "게임 Instagram creator"
      : "게임 콘텐츠 크리에이터";
    if (
      JSON.stringify(currentCategories) === JSON.stringify(categories) &&
      row.headline === headline
    ) {
      continue;
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/discovered_influencer_profiles?id=eq.${encodeURIComponent(row.id)}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          categories,
          headline,
          last_checked_at: new Date().toISOString(),
          source_evidence: {
            ...(row.source_evidence ?? {}),
            category_fix: "game_category_reclassification_2026_07_08",
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Patch failed (${response.status}) for ${row.id}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    updated += 1;
  }
  return updated;
}

async function main() {
  const allCandidates = [];
  for (let from = 0; ; from += 1000) {
    const { rows, total } = await fetchCandidates(from, from + 999);
    allCandidates.push(...rows);
    if (rows.length < 1000 || allCandidates.length >= total) break;
  }

  const rowsToFix = allCandidates.filter(isStrongGamingRow);
  const updated = await patchRows(rowsToFix);
  console.log(
    JSON.stringify(
      {
        ok: true,
        candidates: allCandidates.length,
        matched: rowsToFix.length,
        updated,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
