export const seoResourcePaths = [
  "/resources/influencer-ad-contract",
  "/resources/ppl-contract-checklist",
  "/resources/collaboration-contract",
] as const;

export type SeoResourcePage = {
  path: (typeof seoResourcePaths)[number];
  slug: string;
  title: string;
  description: string;
  summary: string;
  keywords: string[];
  sections: Array<{
    heading: string;
    paragraphs: string[];
  }>;
  primaryCta: {
    label: string;
    path: string;
  };
};

export const seoResources: SeoResourcePage[] = [
  {
    path: "/resources/influencer-ad-contract",
    slug: "influencer-ad-contract",
    title: "인플루언서 광고 계약서 가이드",
    description:
      "협찬, PPL, 공동구매 광고 계약서에서 확인할 조건과 서명 전 검토 항목을 정리합니다.",
    summary:
      "광고주와 인플루언서가 계약 전에 맞춰야 할 조건, 검토 흐름, 서명 증빙 기준을 한 번에 확인하는 공개 가이드입니다.",
    keywords: [
      "인플루언서 광고 계약서",
      "협찬 계약서",
      "광고 계약 검토",
      "인플루언서 전자계약",
    ],
    sections: [
      {
        heading: "계약서에 먼저 적어야 할 조건",
        paragraphs: [
          "광고 상품, 게시 채널, 콘텐츠 형식, 업로드 기간, 검수 방식, 지급 내용을 분리해 적어야 합니다. 한 문장에 모든 조건을 몰아넣으면 수정 요청과 책임 범위가 흐려집니다.",
          "공동구매나 성과형 협업은 수수료 기준, 정산 기준일, 증빙 방식이 별도로 필요합니다. 연락미는 정산을 대신하지 않고, 합의한 조건과 서명 증빙을 남기는 데 집중합니다.",
        ],
      },
      {
        heading: "검토 링크에서 확인할 내용",
        paragraphs: [
          "인플루언서는 계약명, 브랜드명, 플랫폼, 게시물 수, 금액, 마감일을 먼저 확인해야 합니다. 변경이 필요하면 조항별로 수정 요청을 남기는 편이 양쪽 모두에게 안전합니다.",
          "광고주는 최종본이 확정되기 전까지 검토 링크를 통해 수정 이력을 정리하고, 서명 전 버전이 무엇인지 명확히 남겨야 합니다.",
        ],
      },
      {
        heading: "서명 후 남아야 할 증빙",
        paragraphs: [
          "전자서명 후에는 최종 계약서, 서명 시각, 서명자 정보, 접근 경로 같은 감사 증빙이 남아야 합니다. 이 증빙은 계약 진행 상태를 확인하는 기준이 됩니다.",
          "분쟁 해결, 정산 중재, 법률 자문은 별도 영역입니다. 연락미는 계약 운영 흐름과 증빙 보관을 위한 도구로 사용하는 것이 적합합니다.",
        ],
      },
    ],
    primaryCta: {
      label: "광고주 계약 시작",
      path: "/intro/advertiser",
    },
  },
  {
    path: "/resources/ppl-contract-checklist",
    slug: "ppl-contract-checklist",
    title: "PPL 계약 검토 체크리스트",
    description:
      "PPL 계약 전 광고 노출 방식, 검수 일정, 수정 요청, 전자서명 기준을 확인합니다.",
    summary:
      "브랜드 PPL 제안을 계약으로 정리할 때 빠지기 쉬운 노출 조건과 검수 기준을 점검하는 공개 체크리스트입니다.",
    keywords: [
      "PPL 계약서",
      "PPL 조건 검토",
      "유튜브 PPL 계약",
      "브랜드 PPL 제안",
    ],
    sections: [
      {
        heading: "노출 조건",
        paragraphs: [
          "PPL 계약은 노출 위치, 노출 시간, 필수 멘트, 링크 삽입, 해시태그, 썸네일 반영 여부를 구분해서 적어야 합니다. 플랫폼마다 필요한 증빙 형태도 다릅니다.",
          "유튜브, 인스타그램, 틱톡, 블로그는 결과물이 다르기 때문에 같은 금액이라도 납품물 기준을 별도로 적는 것이 좋습니다.",
        ],
      },
      {
        heading: "검수와 수정",
        paragraphs: [
          "검수 횟수, 피드백 마감일, 업로드 예정일은 계약서에 있어야 합니다. 피드백이 늦어질 때 업로드 일정이 어떻게 바뀌는지도 정리해야 합니다.",
          "수정 요청은 대화로만 남기기보다 계약 조건과 연결해 기록해야 나중에 어떤 버전이 최종본인지 확인하기 쉽습니다.",
        ],
      },
      {
        heading: "전자서명",
        paragraphs: [
          "서명 전에는 최종본이 고정되어야 합니다. 계약서를 확인한 뒤 서명하면 양쪽 모두 같은 조건에 동의했다는 증빙이 남습니다.",
          "연락미는 PPL 계약의 작성, 검토 링크, 수정 협의, 전자서명 흐름을 한 화면에서 관리하도록 설계되어 있습니다.",
        ],
      },
    ],
    primaryCta: {
      label: "인플루언서 계약 검토",
      path: "/intro/influencer",
    },
  },
  {
    path: "/resources/collaboration-contract",
    slug: "collaboration-contract",
    title: "협찬·공동구매 계약 정리",
    description:
      "협찬과 공동구매 계약에서 지급 내용, 수수료, 콘텐츠 제출, 증빙 보관 기준을 정리합니다.",
    summary:
      "협찬과 공동구매 협업을 진행할 때 계약서에 남겨야 할 지급 조건, 콘텐츠 제출, 증빙 보관 기준을 정리합니다.",
    keywords: [
      "브랜드 협찬 계약",
      "공동구매 계약",
      "공동구매 수수료 계약",
      "협찬 계약 관리",
    ],
    sections: [
      {
        heading: "지급 내용",
        paragraphs: [
          "협찬은 제품 제공, 원고료, 성과 수수료가 섞이는 경우가 많습니다. 각 지급 항목을 나눠 적어야 계약 상태와 이행 여부를 확인하기 쉽습니다.",
          "공동구매는 할인율, 판매 기간, 수수료 기준, 정산 기준일을 분리해 기록해야 합니다. 연락미는 정산을 처리하지 않고 합의 조건을 문서로 남깁니다.",
        ],
      },
      {
        heading: "콘텐츠 제출",
        paragraphs: [
          "게시 채널, 게시물 수, 원고 또는 영상 제출 시점, 수정 가능 범위를 정리해야 합니다. 콘텐츠 제출 증빙은 계약 진행 상태와 연결되어야 합니다.",
          "광고주와 인플루언서는 업로드 완료, 검수 완료, 서명 완료 같은 상태를 같은 기준으로 봐야 불필요한 확인 요청을 줄일 수 있습니다.",
        ],
      },
      {
        heading: "운영 경계",
        paragraphs: [
          "계약 도구는 조건 합의와 증빙 보관을 도와야 하고, 정산 대행이나 분쟁 중재처럼 별도 책임이 필요한 영역과 섞이면 안 됩니다.",
          "연락미는 광고 계약 흐름을 정리하는 워크스페이스입니다. 지급, 환불, 세금, 채권 추심은 각 당사자가 별도 기준으로 처리해야 합니다.",
        ],
      },
    ],
    primaryCta: {
      label: "계약 관리 보기",
      path: "/intro/advertiser",
    },
  },
];

export const seoResourcesByPath = Object.fromEntries(
  seoResources.map((resource) => [resource.path, resource]),
) as Record<(typeof seoResourcePaths)[number], SeoResourcePage>;

export const seoResourcesBySlug = Object.fromEntries(
  seoResources.map((resource) => [resource.slug, resource]),
) as Record<string, SeoResourcePage | undefined>;

export const getSeoResourceByPath = (pathname: string) =>
  seoResourcesByPath[pathname as (typeof seoResourcePaths)[number]];
