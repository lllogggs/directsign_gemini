export const removeInternalTestLabel = (value?: string | null, fallback = "") => {
  const text = value?.trim();
  if (!text) return fallback;

  if (isInternalTestContact(text)) return fallback;

  const cleaned = text
    .replace(/^테스트브랜드$/g, "브랜드")
    .replace(/^테스트 광고주$/g, "광고주")
    .replace(/^테스트 인플루언서$/g, "인플루언서")
    .replace(/^테스트\s*/g, "")
    .replace(/^QA Test Brand$/i, "브랜드")
    .replace(/^QA Advertiser$/i, "광고주")
    .replace(/^QA Influencer$/i, "인플루언서")
    .replace(/^QA\s+/i, "")
    .replace(/\s+QA$/i, "")
    .replace(/\s+Test$/i, "")
    .replace(/\s+테스트$/g, "")
    .trim();

  return cleaned || fallback || text;
};

export const formatPublicContactValue = (
  value?: string | null,
  fallback = "",
) => removeInternalTestLabel(value, fallback);

export const formatPublicHandleValue = (
  value?: string | null,
  fallback = "계정 확인됨",
) => {
  const text = value?.trim();
  if (!text) return fallback;
  if (/yeollock_test|qa[-_]|test[-_]/i.test(text)) return fallback;
  return text;
};

export const formatContractTitleForDisplay = (
  value?: string | null,
  fallback = "계약명 미정",
) => {
  const cleaned = removeInternalTestLabel(value, fallback)
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;

  const parts = cleaned.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const typeLabel = formatRawContractType(parts[0]);
    const stageLabel = formatRawContractStage(parts.slice(1).join(" "));

    if (typeLabel && stageLabel) return `${typeLabel} 계약 ${stageLabel}`;
    if (typeLabel) return `${typeLabel} 계약`;
    if (stageLabel) return `계약 ${stageLabel}`;
  }

  const standaloneType = formatRawContractType(cleaned);
  if (standaloneType) return `${standaloneType} 계약`;

  return cleaned;
};

export const formatMoneyLabel = (
  value?: string | null,
  fallback = "미정",
) => {
  const text = value?.trim();
  if (!text) return fallback;

  const compact = text.replace(/,/g, "").trim();
  const commissionMatch = compact.match(
    /^(\d+(?:\.\d+)?)\s*%\s*(commission|수수료)?$/i,
  );
  if (commissionMatch) return `판매 수수료 ${commissionMatch[1]}%`;

  const krwMatch = compact.match(/^(\d+(?:\.\d+)?)\s*(krw|원)?$/i);
  if (krwMatch) {
    const amount = Number(krwMatch[1]);
    const hasCurrency = Boolean(krwMatch[2]);
    if (Number.isFinite(amount) && (hasCurrency || amount >= 1000)) {
      return `${Math.round(amount).toLocaleString("ko-KR")}원`;
    }
  }

  return text.replace(/\bKRW\b/gi, "원").replace(/\bcommission\b/gi, "수수료");
};

export const formatPublicUrlLabel = (
  value?: string | null,
  fallback = "링크 열기",
) => {
  const text = value?.trim();
  if (!text) return fallback;

  if (/yeollock_test|\/qa[-/]|qa-qa/i.test(text)) return fallback;

  try {
    const url = new URL(text);
    const path = url.pathname.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return text;
  }
};

export const formatOperationalText = (
  value?: string | null,
  fallback = "",
) => {
  const text = value?.trim();
  if (!text) return fallback;

  const withoutBatch = text.replace(/^\[[^\]]+\]\s*/, "").trim();
  const normalized = withoutBatch.toLowerCase();

  const exact: Record<string, string> = {
    "content scope": "콘텐츠 범위",
    "payment terms": "지급 조건",
    "change requested": "수정 요청",
    "qa change request for dashboard stage coverage.":
      "수정 요청이 접수되었습니다.",
    "qa change request state.": "수정 요청 상태입니다.",
  };
  if (exact[normalized]) return exact[normalized];

  const stageLabel = formatRawContractStage(withoutBatch);
  if (stageLabel && withoutBatch !== text) return stageLabel;

  const deliverable = formatDeliverableSeedText(withoutBatch);
  if (deliverable) return deliverable;

  const payment = formatPaymentSeedText(withoutBatch);
  if (payment) return payment;

  if (/^qa[-\s_]/i.test(withoutBatch)) {
    if (/approved/i.test(withoutBatch)) return "검수 승인 메모가 등록되었습니다.";
    if (/deliverable submission/i.test(withoutBatch)) {
      return "콘텐츠 제출 메모가 등록되었습니다.";
    }
    return fallback || "운영 기록이 저장되었습니다.";
  }

  return withoutBatch
    .replace(/\bNaver Blog\b/g, "네이버 블로그")
    .replace(/\bYouTube Shorts\b/g, "유튜브 숏츠")
    .replace(/\bInstagram Reels\b/g, "인스타그램 릴스")
    .replace(/\bInstagram\b/g, "인스타그램")
    .replace(/\bYouTube\b/g, "유튜브")
    .replace(/\bgroupbuy\b/gi, "공동구매")
    .replace(/\bsponsor\b/gi, "제품 협찬")
    .replace(/\bfee\b/gi, "대가")
    .replace(/\bcommission\b/gi, "수수료")
    .replace(/\bKRW\b/gi, "원");
};

const isInternalTestContact = (value: string) =>
  /^(qa|test)[._-][^\s@]+@/i.test(value) ||
  /@example\./i.test(value);

const normalizeDisplayKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const formatRawContractType = (value: string) => {
  const labels: Record<string, string> = {
    groupbuy: "공동구매",
    "group buy": "공동구매",
    "group purchase": "공동구매",
    ppl: "유료 광고",
    sponsor: "제품 협찬",
    sponsorship: "제품 협찬",
    공동구매: "공동구매",
    협찬: "제품 협찬",
  };

  return labels[normalizeDisplayKey(value)];
};

const formatRawContractStage = (value: string) => {
  const labels: Record<string, string> = {
    approved: "서명 대기",
    completed: "완료",
    draft: "초안",
    negotiating: "수정 협의",
    "change requested": "수정 요청",
    "ready to sign": "서명 대기",
    review: "검토",
    reviewing: "검토 중",
    "review needed": "검토 대기",
    "deliverables due": "콘텐츠 제출",
    "deliverables review": "콘텐츠 검수",
    signed: "서명 완료",
    signing: "서명 대기",
  };

  return labels[normalizeDisplayKey(value)];
};

const formatDeliverableSeedText = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();

  const adDisclosurePatterns: Array<[RegExp, string]> = [
    [
      /^Instagram\s+Instagram Reels\s+(\d+)\s*\/\s*(\d+)s\s+must include ad disclosure\.$/i,
      "인스타그램 릴스 $1건 / $2초에는 광고 표시가 포함되어야 합니다.",
    ],
    [
      /^YouTube\s+YouTube Shorts\s+(\d+)\s*\/\s*(\d+)s\s+must include ad disclosure\.$/i,
      "유튜브 숏츠 $1건 / $2초에는 광고 표시가 포함되어야 합니다.",
    ],
    [
      /^Naver Blog\s+Naver Blog review\s+(\d+)\s*\/\s*post\s+must include ad disclosure\.$/i,
      "네이버 블로그 리뷰 $1건에는 광고 표시가 포함되어야 합니다.",
    ],
  ];

  for (const [pattern, replacement] of adDisclosurePatterns) {
    if (pattern.test(normalized)) return normalized.replace(pattern, replacement);
  }

  const deliverablePatterns: Array<[RegExp, string]> = [
    [/^Instagram Reels\s+(\d+)\s*\/\s*(\d+)s$/i, "인스타그램 릴스 $1건 / $2초"],
    [/^YouTube Shorts\s+(\d+)\s*\/\s*(\d+)s$/i, "유튜브 숏츠 $1건 / $2초"],
    [/^Naver Blog review\s+(\d+)\s*\/\s*post$/i, "네이버 블로그 리뷰 $1건"],
  ];

  for (const [pattern, replacement] of deliverablePatterns) {
    if (pattern.test(normalized)) return normalized.replace(pattern, replacement);
  }

  return undefined;
};

const formatPaymentSeedText = (value: string) => {
  const match = value
    .replace(/\s+/g, " ")
    .trim()
    .match(/^(sponsor|ppl|groupbuy) fee is (.+)\.$/i);
  if (!match) return undefined;

  const typeLabel = formatRawContractType(match[1]) ?? "계약";
  const amount = formatMoneyLabel(match[2]);

  if (typeLabel === "공동구매") {
    const commission = amount.match(/^판매 수수료 (.+)$/);
    return `공동구매 수수료는 판매액의 ${commission?.[1] ?? amount}입니다.`;
  }
  return `${typeLabel} 대가는 ${amount}입니다.`;
};
