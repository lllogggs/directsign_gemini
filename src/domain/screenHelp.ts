export type ScreenHelpStep = {
  title: string;
  description: string;
};

export type ScreenHelpContent = {
  id: string;
  title: string;
  summary: string;
  primaryAction: string;
  flow: readonly string[];
  steps: readonly ScreenHelpStep[];
  safeguards: readonly string[];
  completion: string;
};

export type ContractFirstExperienceContent = {
  id: string;
  storageKey: string;
  title: string;
  summary: string;
  steps: readonly ScreenHelpStep[];
  checks: readonly string[];
  primaryActionLabel: string;
  secondaryActionLabel: string;
};

export const CONTRACT_FIRST_EXPERIENCE_CONTENT = {
  id: "advertiser-contract-first-experience",
  storageKey: "yeollock:advertiser-contract-first-experience:v1",
  title: "1:1 계약과 캠페인의 차이",
  summary:
    "1:1 계약은 한 명과 협의된 내용을 계약서로 옮기는 기능이고, 캠페인은 같은 조건으로 여러 인플루언서를 모집한 뒤 계약을 진행하는 기능입니다.",
  steps: [
    {
      title: "1:1 계약",
      description:
        "다른 플랫폼이나 DM에서 브랜드와 인플루언서가 이미 협의한 조건을 계약서로 편하게 정리합니다.",
    },
    {
      title: "캠페인",
      description:
        "캠페인 조건을 먼저 만들고, 매칭된 인플루언서마다 같은 캠페인 조건으로 계약서를 만들어 발송합니다.",
    },
    {
      title: "조건 확인",
      description:
        "금액, 업로드 일정, 콘텐츠, 사용 권한처럼 분쟁이 생기기 쉬운 항목을 발송 전에 확인합니다.",
    },
    {
      title: "계약 발송",
      description:
        "인플루언서가 조건을 검토하고 최종 동의하면 전자서명과 계약 보관까지 이어집니다.",
    },
  ],
  checks: [
    "이미 한 명과 협의된 건이면 1:1 계약을 선택하세요.",
    "여러 인플루언서와 같은 조건으로 진행할 건이면 새 캠페인을 선택하세요.",
    "자동으로 구성된 조항도 광고주가 최종 책임지고 검토해야 합니다.",
  ],
  primaryActionLabel: "1:1 계약",
  secondaryActionLabel: "확인했습니다",
} satisfies ContractFirstExperienceContent;

export const SCREEN_HELP_CONTENT = {
  advertiserDashboard: {
    id: "advertiser-dashboard-help",
    title: "계약 운영 도움말",
    summary:
      "광고주가 전체 계약 상태를 모아서 보고, 다음 액션이 필요한 계약을 여는 화면입니다.",
    primaryAction:
      "검토 대기, 수정 요청, 서명 대기 계약을 먼저 열어 마감 전에 조항 답변과 공유 상태를 정리하세요.",
    flow: [
      "계약 생성",
      "검토 링크 공유",
      "인플루언서 검토",
      "조항 합의",
      "서명본 보관",
    ],
    steps: [
      {
        title: "인증 상태 확인",
        description:
          "상단 배지가 승인 상태인지 먼저 확인합니다. 승인 전에는 외부 공유가 제한될 수 있습니다.",
      },
      {
        title: "상태 필터로 우선순위 정리",
        description:
          "수정 요청과 서명 대기 계약을 먼저 열어 캠페인 마감 전에 막힌 지점을 처리합니다.",
      },
      {
        title: "계약 행에서 상세로 이동",
        description:
          "인플루언서, 금액, 기간을 확인한 뒤 계약 상세에서 조항 답변, 링크 복사, 서명 진행을 처리합니다.",
      },
    ],
    safeguards: [
      "계약명이 비슷하면 인플루언서와 금액, 기간을 함께 확인하세요.",
      "저장 오류 배너가 보이면 공유나 서명 요청 전에 다시 확인하세요.",
      "사업자 인증이 미완료면 링크 공유보다 인증을 먼저 완료하세요.",
    ],
    completion:
      "각 계약의 다음 액션이 없고 저장 상태가 정상으로 보이면 이 화면에서 할 일은 정리된 상태입니다.",
  },
  contractBuilder: {
    id: "contract-builder-help",
    title: "새 전자계약서 작성 도움말",
    summary:
      "광고 조건을 계약서로 만들기 위해 기본 정보, 채널 조건, 일정과 지급, 특약, 발송 확인을 순서대로 채우는 화면입니다.",
    primaryAction:
      "필수 항목을 모두 입력하고 미리보기에서 조건을 검토한 뒤 검토용 계약 초안을 만드세요.",
    flow: [
      "기본 정보",
      "채널 조건",
      "일정과 지급",
      "특약 확인",
      "발송 전 검토",
    ],
    steps: [
      {
        title: "상대방과 캠페인 정보 입력",
        description:
          "광고주, 인플루언서, 계약 유형, 캠페인 제목을 먼저 정확히 입력합니다.",
      },
      {
        title: "제공물과 기간 확정",
        description:
          "업로드 매체, 게시 건수, 유지 기간, 검토 기한을 실제 합의 조건과 맞춥니다.",
      },
      {
        title: "지급과 특약 검토",
        description:
          "금액, 수수료, 광고 표시 문구, 독점 조건처럼 분쟁이 생기기 쉬운 항목을 발송 전에 확인합니다.",
      },
    ],
    safeguards: [
      "광고 표시 문구와 지급 조건은 실제 합의 내용과 일치해야 합니다.",
      "자동으로 구성된 조항도 광고주가 최종 책임지고 검토해야 합니다.",
      "사업자 인증이 미완료면 계약 작성은 가능해도 공유가 제한될 수 있습니다.",
    ],
    completion:
      "발송 전 확인 단계에서 오류가 없고 미리보기 내용이 합의 조건과 맞으면 계약 생성 준비가 끝납니다.",
  },
  contractAdmin: {
    id: "contract-admin-help",
    title: "계약 상세 도움말",
    summary:
      "인플루언서가 검토한 조항, 수정 요청, 공유 링크, 서명과 PDF 증빙 상태를 관리하는 화면입니다.",
    primaryAction:
      "검토 필요 조항을 모두 처리하고, 최종 승인 후 공유 링크와 서명 상태를 확인하세요.",
    flow: [
      "조항 확인",
      "수정 요청 답변",
      "최종 승인",
      "서명 요청",
      "PDF 증빙 보관",
    ],
    steps: [
      {
        title: "상단 요약으로 상태 파악",
        description:
          "검토 필요 조항, 공유 링크, 감사 준비, 저장 상태를 먼저 확인합니다.",
      },
      {
        title: "조항별 요청 처리",
        description:
          "인플루언서가 요청한 수정 사유를 읽고 승인하거나 답변을 남겨 계약 상태를 갱신합니다.",
      },
      {
        title: "서명 가능 상태 만들기",
        description:
          "모든 조항이 승인되고 광고주 인증이 완료되면 공유 링크를 활성화하고 서명 요청을 진행합니다.",
      },
    ],
    safeguards: [
      "공유 링크는 활성 상태일 때만 복사해 전달하세요.",
      "서명 전에는 금액, 기간, 제공물, 광고 표시 조항을 다시 확인하세요.",
      "지원 접근 요청은 문제 해결에 필요한 범위로만 남기는 것이 좋습니다.",
    ],
    completion:
      "계약 상태가 서명 완료이고 서명 PDF가 준비되면 증빙 보관까지 완료된 상태입니다.",
  },
  influencerContract: {
    id: "influencer-contract-help",
    title: "계약 검토 도움말",
    summary:
      "광고주가 보낸 1:1 계약 내용을 인플루언서가 확인하고, 조항 승인이나 수정 요청 후 전자서명까지 진행하는 화면입니다.",
    primaryAction:
      "금액, 일정, 제공물, 광고 표시 의무를 확인한 뒤 조항별로 승인하거나 수정 요청을 남기세요.",
    flow: [
      "계약 확인",
      "계정 인증",
      "조항 검토",
      "수정 요청",
      "전자서명",
    ],
    steps: [
      {
        title: "보안 링크와 상태 확인",
        description:
          "상단 상태와 계약 제목을 확인해 본인에게 온 1:1 계약이 맞는지 먼저 봅니다.",
      },
      {
        title: "조항별 의무 검토",
        description:
          "게시 매체, 업로드 기한, 수정 가능 횟수, 지급 조건, 광고 표시 의무를 조항별로 확인합니다.",
      },
      {
        title: "필요하면 문장 단위로 요청",
        description:
          "불명확한 문장은 선택해서 수정 요청이나 삭제 요청을 남기고, 합의된 조항만 승인합니다.",
      },
    ],
    safeguards: [
      "서명은 모든 조항에 동의했다는 증빙으로 남습니다.",
      "이해되지 않는 조항은 승인하지 말고 수정 요청으로 남기세요.",
      "계정 인증이 필요한 계약은 인증 승인 후 서명할 수 있습니다.",
    ],
    completion:
      "모든 조항 승인, 계정 인증, 전자서명이 끝나면 서명본 PDF가 생성되어 계약 증빙으로 남습니다.",
  },
} satisfies Record<string, ScreenHelpContent>;
