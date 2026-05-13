import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileSignature,
  FileText,
  MessageSquareText,
  PenLine,
  Search,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME } from "../../domain/brand";

type IntroRole = "advertiser" | "influencer";

type RoleCard = {
  role: IntroRole;
  title: string;
  eyebrow: string;
  description: string;
  cta: string;
  href: string;
  icon: LucideIcon;
  markClass: string;
};

type StartServiceCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  iconBgClass: string;
};

type IntroConfig = {
  eyebrow: string;
  title: string[];
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  switchLabel: string;
  switchHref: string;
  accentText: string;
  accentBg: string;
  accentDot: string;
  previewTitle: string;
  previewSubtitle: string;
  previewBadge: string;
  sectionLabel: string;
  sectionTitle: string;
  summary: Array<{
    label: string;
    value: string;
    tone: string;
    dotClass: string;
  }>;
  rows: Array<{
    title: string;
    party: string;
    platform: string;
    amount: string;
    status: string;
    statusClass: string;
    due: string;
  }>;
  flow: Array<{
    label: string;
    title: string;
    description: string;
  }>;
  features: Array<{ icon: LucideIcon; title: string; description: string }>;
  audit: Array<{ label: string; detail: string }>;
  proofPoints: string[];
};

const roleCards: RoleCard[] = [
  {
    role: "advertiser",
    title: "광고주",
    eyebrow: "계약을 만들고 공유하는 팀",
    description:
      "캠페인 조건을 정리하고, 검토 링크를 보내고, 서명 완료 상태까지 한 화면에서 관리합니다.",
    cta: "광고주로 시작하기",
    href: "/intro/advertiser",
    icon: Building2,
    markClass: "border-neutral-950 bg-neutral-950 text-white",
  },
  {
    role: "influencer",
    title: "인플루언서",
    eyebrow: "받은 계약을 검토하는 크리에이터",
    description:
      "계약 내용을 확인하고, 필요한 수정 요청을 남기고, 모바일에서 바로 서명합니다.",
    cta: "인플루언서로 시작하기",
    href: "/intro/influencer",
    icon: UserRound,
    markClass: "border-neutral-200 bg-white text-neutral-800",
  },
];

function getStartRoleTone(role: IntroRole) {
  if (role === "advertiser") {
    return {
      card:
        "border-[#bfdbfe] bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_54%)] hover:border-[#93c5fd]",
      icon: "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb] group-hover:border-[#2563eb] group-hover:bg-[#2563eb] group-hover:text-white",
      arrow:
        "border-[#bfdbfe] bg-white text-[#2563eb]/55 group-hover:border-[#2563eb] group-hover:bg-[#2563eb] group-hover:text-white",
      divider: "border-[#bfdbfe]/75",
      detail: "text-[#2563eb]",
    };
  }

  return {
    card:
      "border-[#a7f3d0] bg-[linear-gradient(180deg,#ecfdf5_0%,#ffffff_54%)] hover:border-[#6ee7b7]",
    icon: "border-[#a7f3d0] bg-[#ecfdf5] text-[#059669] group-hover:border-[#059669] group-hover:bg-[#059669] group-hover:text-white",
    arrow:
      "border-[#a7f3d0] bg-white text-[#059669]/55 group-hover:border-[#059669] group-hover:bg-[#059669] group-hover:text-white",
    divider: "border-[#a7f3d0]/75",
    detail: "text-[#059669]",
  };
}

const startServiceCards: StartServiceCard[] = [
  {
    title: "간편한 컨택",
    description: "프로필 확인 후 바로 제안",
    icon: UserRound,
    iconClass: "text-neutral-800",
    iconBgClass: "bg-neutral-100",
  },
  {
    title: "계약서 작성",
    description: "조건을 넣으면 초안 정리",
    icon: Search,
    iconClass: "text-blue-700",
    iconBgClass: "bg-blue-50",
  },
  {
    title: "전자계약",
    description: "검토 링크와 서명 진행",
    icon: MessageSquareText,
    iconClass: "text-emerald-700",
    iconBgClass: "bg-emerald-50",
  },
  {
    title: "계약 관리",
    description: "상태와 이력을 한눈에 관리",
    icon: FileSignature,
    iconClass: "text-amber-700",
    iconBgClass: "bg-amber-50",
  },
];

const introConfig = {
  advertiser: {
    eyebrow: "광고주 워크스페이스",
    title: ["계약 초안부터", "서명 증빙까지", "한 화면에서"],
    description:
      "광고주와 대행사가 계약 조건을 정리하고, 공유 링크를 보내고, 인플루언서 의견과 서명 완료 상태를 한 화면에서 확인합니다.",
    primaryLabel: "광고주로 시작",
    primaryHref: "/signup/advertiser",
    secondaryLabel: "광고주 로그인",
    secondaryHref: "/login/advertiser",
    switchLabel: "인플루언서 화면 보기",
    switchHref: "/intro/influencer",
    accentText: "text-[#245b51]",
    accentBg: "bg-[#e7efed]",
    accentDot: "bg-[#245b51]",
    previewTitle: "캠페인 계약 운영",
    previewSubtitle: "오늘 처리할 계약",
    previewBadge: "발송 가능",
    sectionLabel: "광고주에게 필요한 흐름",
    sectionTitle: "작성, 협의, 서명 완료를 계약별로 정리합니다",
    summary: [
      {
        label: "확인 필요",
        value: "3",
        tone: "text-[#92520f]",
        dotClass: "bg-[#c9872b]",
      },
      {
        label: "서명 대기",
        value: "2",
        tone: "text-[#245b51]",
        dotClass: "bg-[#245b51]",
      },
      {
        label: "활성 링크",
        value: "7",
        tone: "text-[#171a17]",
        dotClass: "bg-[#6c746e]",
      },
      {
        label: "계약 금액",
        value: "1,240만",
        tone: "text-[#171a17]",
        dotClass: "bg-[#6c746e]",
      },
    ],
    rows: [
      {
        title: "봄 신제품 릴스 캠페인",
        party: "리나스튜디오",
        platform: "Instagram",
        amount: "320만",
        status: "수정 요청",
        statusClass: "border-[#e7c37d] bg-[#fff7e8] text-[#8a560f]",
        due: "오늘 답변",
      },
      {
        title: "카페 팝업 방문 콘텐츠",
        party: "오늘의취향",
        platform: "YouTube",
        amount: "450만",
        status: "서명 대기",
        statusClass: "border-[#bfd8d2] bg-[#edf7f4] text-[#245b51]",
        due: "내일 마감",
      },
      {
        title: "운동 루틴 숏폼 패키지",
        party: "핏데이",
        platform: "TikTok",
        amount: "280만",
        status: "검토 중",
        statusClass: "border-[#d2d8d3] bg-white text-[#4f5852]",
        due: "3일 남음",
      },
    ],
    flow: [
      {
        label: "01",
        title: "조건 입력",
        description: "캠페인명, 금액, 일정, 검수 기준을 계약 초안으로 정리합니다.",
      },
      {
        label: "02",
        title: "링크 발송",
        description: "사업자 인증 후 인플루언서에게 검토 링크를 보냅니다.",
      },
      {
        label: "03",
        title: "의견과 서명 확인",
        description: "수정 요청, 답변, 최종 서명 증빙을 계약 이력에 남깁니다.",
      },
    ],
    features: [
      {
        icon: FileText,
        title: "계약 조건 정리",
        description:
          "금액, 일정, 산출물, 광고 표시, 검수 기준을 빠뜨리지 않고 같은 형식으로 정리합니다.",
      },
      {
        icon: MessageSquareText,
        title: "조항별 협의 기록",
        description:
          "인플루언서의 질문과 수정 요청, 광고주의 답변을 계약 안에 남겨 혼선을 줄입니다.",
      },
      {
        icon: FileSignature,
        title: "서명 증빙 보관",
        description:
          "최종본, 서명 시각, 동의 문구, PDF 확인 흐름을 계약별 증빙으로 관리합니다.",
      },
    ],
    audit: [
      { label: "09:20", detail: "계약 링크 발송" },
      { label: "11:45", detail: "조항 수정 요청 접수" },
      { label: "14:10", detail: "광고주 답변 대기" },
    ],
    proofPoints: ["사업자 인증 후 발송", "수정 요청 이력 보관", "최종본 PDF 확인"],
  },
  influencer: {
    eyebrow: "인플루언서 워크스페이스",
    title: ["광고 계약 확인부터", "수정 요청, 서명까지"],
    description:
      "크리에이터와 매니저가 광고 조건을 모바일에서도 읽기 쉽게 확인하고, 불리한 조항은 수정 요청한 뒤 안전하게 서명합니다.",
    primaryLabel: "인플루언서로 시작",
    primaryHref: "/signup/influencer",
    secondaryLabel: "인플루언서 로그인",
    secondaryHref: "/login/influencer",
    switchLabel: "광고주 화면 보기",
    switchHref: "/intro/advertiser",
    accentText: "text-[#7a4a2d]",
    accentBg: "bg-[#efe8df]",
    accentDot: "bg-[#7a4a2d]",
    previewTitle: "받은 계약 검토",
    previewSubtitle: "오늘 확인할 계약",
    previewBadge: "검토 가능",
    sectionLabel: "인플루언서에게 필요한 흐름",
    sectionTitle: "조건 확인, 수정 요청, 서명을 한 화면에서 처리합니다",
    summary: [
      {
        label: "검토 필요",
        value: "2",
        tone: "text-[#92520f]",
        dotClass: "bg-[#c9872b]",
      },
      {
        label: "수정 협의",
        value: "1",
        tone: "text-[#7a4a2d]",
        dotClass: "bg-[#7a4a2d]",
      },
      {
        label: "서명 준비",
        value: "3",
        tone: "text-[#171a17]",
        dotClass: "bg-[#6c746e]",
      },
      {
        label: "확정 금액",
        value: "680만",
        tone: "text-[#171a17]",
        dotClass: "bg-[#6c746e]",
      },
    ],
    rows: [
      {
        title: "뷰티 브랜드 릴스 2건",
        party: "누디브랜딩",
        platform: "Instagram",
        amount: "180만",
        status: "검토 필요",
        statusClass: "border-[#e7c37d] bg-[#fff7e8] text-[#8a560f]",
        due: "오늘 확인",
      },
      {
        title: "여행 브이로그 협찬",
        party: "로컬트립",
        platform: "YouTube",
        amount: "300만",
        status: "서명 준비",
        statusClass: "border-[#d4c4b8] bg-[#f7f1eb] text-[#7a4a2d]",
        due: "내일 마감",
      },
      {
        title: "운동 챌린지 콘텐츠",
        party: "무브핏",
        platform: "TikTok",
        amount: "200만",
        status: "제출 대기",
        statusClass: "border-[#d2d8d3] bg-white text-[#4f5852]",
        due: "5일 남음",
      },
    ],
    flow: [
      {
        label: "01",
        title: "핵심 조건 확인",
        description: "금액, 업로드 일정, 사용 권한처럼 먼저 봐야 할 조건을 확인합니다.",
      },
      {
        label: "02",
        title: "수정 요청",
        description: "동의하기 어려운 조항은 계약 안에서 바로 이유를 남깁니다.",
      },
      {
        label: "03",
        title: "서명과 제출",
        description: "서명 완료 뒤 콘텐츠 링크와 증빙 제출 상태를 이어서 확인합니다.",
      },
    ],
    features: [
      {
        icon: ClipboardCheck,
        title: "핵심 조건 먼저 확인",
        description:
          "금액, 업로드 일정, 제출물, 사용 권한처럼 놓치기 쉬운 조건을 앞에서 확인합니다.",
      },
      {
        icon: PenLine,
        title: "불리한 조항 수정 요청",
        description:
          "동의하기 어려운 문구는 조항별로 요청하고 광고주 답변을 같은 화면에서 기다립니다.",
      },
      {
        icon: FileCheck2,
        title: "서명과 제출 상태 확인",
        description:
          "서명 완료 뒤 콘텐츠 링크, 증빙 파일, 다음 제출 상태까지 이어서 확인합니다.",
      },
    ],
    audit: [
      { label: "10:05", detail: "계약 검토 링크 열람" },
      { label: "10:18", detail: "사용 권한 조항 질문" },
      { label: "13:40", detail: "광고주 답변 도착" },
    ],
    proofPoints: ["모바일 계약 검토", "플랫폼 계정 인증", "완료 계약 보관"],
  },
} satisfies Record<IntroRole, IntroConfig>;

type RolePreviewProfile = {
  kind: "profile";
  header: string;
  profileName: string;
  handle: string;
  headline: string;
  tags: string[];
  stats: Array<{ label: string; value: string }>;
  channels: Array<{ label: string; value: string; status: string }>;
  actionLabel: string;
  footerNote: string;
};

type RolePreviewDiscover = {
  kind: "discover";
  header: string;
  searchPlaceholder: string;
  filters: Array<{ label: string; active?: boolean }>;
  cards: Array<{
    name: string;
    meta: string;
    badge: string;
    description: string;
    stats: Array<{ label: string; value: string }>;
    action: string;
  }>;
};

type RolePreviewProposal = {
  kind: "proposal";
  header: string;
  targetLabel: string;
  targetName: string;
  fields: Array<{ label: string; value: string }>;
  chips: string[];
  message: string;
  timeline: string[];
  actionLabel: string;
};

type RolePreviewContract = {
  kind: "contract";
  header: string;
  count: string;
  countLabel: string;
  rows: Array<{
    name: string;
    title: string;
    status: string;
    statusClass: string;
    due: string;
  }>;
  nextAction: string;
};

type RolePreview = RolePreviewProfile | RolePreviewDiscover | RolePreviewProposal | RolePreviewContract;

type RoleIntroSlide = {
  label: string;
  eyebrow: string;
  title: string[];
  description: string;
  helper: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  icon: LucideIcon;
  accentClass: string;
  iconClass: string;
  cardClass: string;
  preview: RolePreview;
};

const ROLE_PREVIEW_AUTO_DELAY_MS = 5000;
const ROLE_PREVIEW_MANUAL_RESUME_DELAY_MS = 9000;

const roleIntroSlides = {
  advertiser: [
    {
      label: "간편한 컨택",
      eyebrow: "간편한 컨택",
      title: ["신뢰할 수 있는", "간편한 컨택"],
      description:
        "인증 채널, 최근 협업, 가능 광고 형태를 확인한 뒤 브랜드와 맞는 인플루언서에게 바로 컨택합니다.",
      helper: "프로필 확인 후 컨택 시작",
      primaryLabel: "인플루언서 찾기",
      primaryHref: "/advertiser/discover",
      secondaryLabel: "메시지함 보기",
      secondaryHref: "/advertiser/messages",
      icon: UserRound,
      accentClass: "bg-neutral-950",
      iconClass: "text-neutral-950",
      cardClass: "border-neutral-300 bg-white",
      preview: {
        kind: "profile",
        header: "인플루언서 공개 프로필",
        profileName: "소라핏",
        handle: "yeollock.me/sora_fit",
        headline: "홈트, 건강식품, 러닝 챌린지 숏폼에 강한 웰니스 크리에이터",
        tags: ["Instagram", "TikTok", "운동/웰니스"],
        stats: [
          { label: "팔로워", value: "12.8만" },
          { label: "평균 반응", value: "4.7%" },
          { label: "응답", value: "2시간" },
        ],
        channels: [
          { label: "Instagram", value: "@sora_fit", status: "인증됨" },
          { label: "TikTok", value: "@sora.move", status: "인증됨" },
        ],
        actionLabel: "컨택 제안하기",
        footerNote: "브랜드 소개와 희망 광고 형태를 남기면 메시지함에 제안이 저장됩니다.",
      },
    },
    {
      label: "계약서 작성",
      eyebrow: "계약서 작성",
      title: ["합의 조건으로", "계약서 작성"],
      description:
        "컨택으로 합의한 플랫폼, 광고 형태, 금액, 기간을 계약서 초안에 맞춰 빠르게 정리합니다.",
      helper: "조건을 넣으면 초안으로 정리",
      primaryLabel: "계약서 작성",
      primaryHref: "/advertiser/builder",
      secondaryLabel: "광고주 가입",
      secondaryHref: "/signup/advertiser",
      icon: Search,
      accentClass: "bg-blue-600",
      iconClass: "text-blue-700",
      cardClass: "border-blue-200 bg-blue-50/55",
      preview: {
        kind: "proposal",
        header: "계약서 작성",
        targetLabel: "계약 대상",
        targetName: "소라핏 · Instagram/TikTok",
        fields: [
          { label: "계약명", value: "러닝 챌린지 릴스 캠페인" },
          { label: "플랫폼", value: "Instagram · TikTok" },
          { label: "금액", value: "320만원" },
          { label: "기간", value: "2026.06.01-06.20" },
        ],
        chips: ["유료 광고(PPL)", "릴스 1건", "스토리 2건"],
        message:
          "광고 표시, 업로드 일정, 검수 기준, 2차 활용 여부를 계약서 조항으로 정리합니다.",
        timeline: ["조건 입력", "조항 확인", "PDF 초안", "검토 링크"],
        actionLabel: "계약서 초안 만들기",
      },
    },
    {
      label: "전자계약",
      eyebrow: "전자계약",
      title: ["검토 링크와", "전자서명 진행"],
      description:
        "작성한 계약서를 검토 링크로 보내고 수정 요청, 승인, 전자서명 흐름을 한 화면에서 이어갑니다.",
      helper: "검토 링크와 전자서명 진행",
      primaryLabel: "계약 발송",
      primaryHref: "/advertiser/builder",
      secondaryLabel: "메시지함 보기",
      secondaryHref: "/advertiser/messages",
      icon: MessageSquareText,
      accentClass: "bg-emerald-600",
      iconClass: "text-emerald-700",
      cardClass: "border-emerald-200 bg-emerald-50/60",
      preview: {
        kind: "proposal",
        header: "전자계약 발송",
        targetLabel: "받는 사람",
        targetName: "소라핏 · 웰니스 크리에이터",
        fields: [
          { label: "브랜드", value: "런데이랩" },
          { label: "광고 형태", value: "릴스 1건 + 스토리 2건" },
          { label: "예산", value: "250만-320만원" },
          { label: "희망 일정", value: "6월 둘째 주" },
        ],
        chips: ["제품 협찬", "유료 광고", "숏폼"],
        message:
          "러닝 입문자를 위한 여름 캠페인을 준비 중입니다. 실제 운동 루틴에 자연스럽게 녹인 릴스 협업을 제안드리고 싶습니다.",
        timeline: ["제안 저장", "메시지함 알림", "조건 합의", "계약서 작성"],
        actionLabel: "검토 링크 보내기",
      },
    },
    {
      label: "계약 관리",
      eyebrow: "계약 관리",
      title: ["진행 상황을", "계약별로 관리"],
      description:
        "작성, 수정, 서명, 완료 상태를 계약별로 모아 보고 필요한 다음 행동을 바로 처리합니다.",
      helper: "계약 상태와 이력 관리",
      primaryLabel: "대시보드 보기",
      primaryHref: "/advertiser/dashboard",
      secondaryLabel: "대시보드 보기",
      secondaryHref: "/advertiser/dashboard",
      icon: FileSignature,
      accentClass: "bg-amber-500",
      iconClass: "text-amber-700",
      cardClass: "border-amber-200 bg-amber-50/70",
      preview: {
        kind: "contract",
        header: "광고주 계약 대시보드",
        count: "4",
        countLabel: "진행",
        rows: [
          {
            name: "소라핏",
            title: "러닝 챌린지 릴스 캠페인",
            status: "검토 링크 발송",
            statusClass: "bg-blue-50 text-blue-700",
            due: "오늘 18:00",
          },
          {
            name: "오늘의 주방",
            title: "주방가전 리뷰 콘텐츠",
            status: "수정 요청",
            statusClass: "bg-amber-50 text-amber-800",
            due: "D+1",
          },
          {
            name: "민서홈",
            title: "홈카페 공동구매",
            status: "서명 완료",
            statusClass: "bg-emerald-50 text-emerald-700",
            due: "완료",
          },
        ],
        nextAction: "수정 요청 답변 후 최종 서명 요청",
      },
    },
  ],
  influencer: [
    {
      label: "간편한 컨택",
      eyebrow: "간편한 컨택",
      title: ["브랜드와 연결되는", "간편한 컨택"],
      description:
        "내 공개 프로필과 인증 채널을 기반으로 브랜드가 신뢰하고 연락할 수 있는 컨택 흐름을 만듭니다.",
      helper: "프로필과 인증 채널로 컨택",
      primaryLabel: "프로필 설정",
      primaryHref: "/influencer/dashboard",
      secondaryLabel: "브랜드 찾기",
      secondaryHref: "/influencer/brands",
      icon: UserRound,
      accentClass: "bg-neutral-950",
      iconClass: "text-neutral-950",
      cardClass: "border-neutral-300 bg-white",
      preview: {
        kind: "profile",
        header: "내 공개 프로필",
        profileName: "민서홈",
        handle: "yeollock.me/minseo_home",
        headline: "살림, 홈카페, 소형가전 리뷰를 생활 장면 중심으로 소개합니다.",
        tags: ["Instagram", "Blog", "리빙/홈카페"],
        stats: [
          { label: "팔로워", value: "9.6만" },
          { label: "최근 협업", value: "14건" },
          { label: "응답", value: "당일" },
        ],
        channels: [
          { label: "Instagram", value: "@minseo.home", status: "인증됨" },
          { label: "Blog", value: "minseo-home", status: "인증됨" },
        ],
        actionLabel: "브랜드 컨택 받기",
        footerNote: "프로필 소개와 가능 광고 형태를 저장하면 브랜드가 같은 주소로 확인합니다.",
      },
    },
    {
      label: "계약서 작성",
      eyebrow: "계약서 작성",
      title: ["합의한 조건을", "계약서로 확인"],
      description:
        "브랜드가 보낸 광고 조건, 금액, 기간, 산출물을 계약서 형태로 확인하고 빠진 부분을 바로 봅니다.",
      helper: "받은 조건을 계약서로 확인",
      primaryLabel: "받은 계약 보기",
      primaryHref: "/influencer/dashboard",
      secondaryLabel: "인플루언서 가입",
      secondaryHref: "/signup/influencer",
      icon: Search,
      accentClass: "bg-blue-600",
      iconClass: "text-blue-700",
      cardClass: "border-blue-200 bg-blue-50/55",
      preview: {
        kind: "proposal",
        header: "계약서 조건 확인",
        targetLabel: "받은 계약",
        targetName: "브레드룸 · 홈카페 공동구매",
        fields: [
          { label: "브랜드", value: "브레드룸" },
          { label: "플랫폼", value: "Instagram · Blog" },
          { label: "금액", value: "판매 수수료 18%" },
          { label: "기간", value: "2026.06.01-06.20" },
        ],
        chips: ["공동구매", "릴스 1건", "블로그 리뷰"],
        message:
          "광고주가 입력한 조건을 먼저 확인하고 빠진 산출물, 정산 기준, 사용 권한을 체크합니다.",
        timeline: ["조건 확인", "질문 작성", "수정 요청", "전자서명"],
        actionLabel: "조건 확인하기",
      },
    },
    {
      label: "전자계약",
      eyebrow: "전자계약",
      title: ["수정 요청부터", "전자서명까지"],
      description:
        "불리하거나 애매한 조항은 수정 요청하고, 합의가 끝나면 전자서명으로 안전하게 마무리합니다.",
      helper: "수정 요청과 전자서명 진행",
      primaryLabel: "계약 검토",
      primaryHref: "/influencer/dashboard",
      secondaryLabel: "메시지함 보기",
      secondaryHref: "/influencer/messages",
      icon: MessageSquareText,
      accentClass: "bg-emerald-600",
      iconClass: "text-emerald-700",
      cardClass: "border-emerald-200 bg-emerald-50/60",
      preview: {
        kind: "proposal",
        header: "전자계약 검토",
        targetLabel: "제안 브랜드",
        targetName: "브레드룸 · 홈카페 식품",
        fields: [
          { label: "내 프로필", value: "yeollock.me/minseo_home" },
          { label: "광고 형태", value: "릴스 1건 + 블로그 리뷰" },
          { label: "제안 금액", value: "180만원" },
          { label: "업로드", value: "제품 수령 후 7일" },
        ],
        chips: ["홈카페 레시피", "제품 리뷰", "공동구매 가능"],
        message:
          "브레드룸 신제품을 홈카페 루틴에 녹인 릴스와 블로그 리뷰로 소개하고 싶습니다. 기존 독자층과 잘 맞는 포맷을 제안드립니다.",
        timeline: ["역제안 저장", "메시지함 알림", "조건 협의", "계약 검토"],
        actionLabel: "수정 요청 또는 서명",
      },
    },
    {
      label: "계약 관리",
      eyebrow: "계약 관리",
      title: ["받은 계약을", "상태별로 관리"],
      description:
        "검토 필요, 수정 협의, 서명 가능, 완료 계약을 한 화면에서 보고 다음 할 일을 놓치지 않습니다.",
      helper: "받은 계약 상태와 이력 관리",
      primaryLabel: "받은 계약 보기",
      primaryHref: "/influencer/dashboard",
      secondaryLabel: "브랜드 찾기",
      secondaryHref: "/influencer/brands",
      icon: FileSignature,
      accentClass: "bg-amber-500",
      iconClass: "text-amber-700",
      cardClass: "border-amber-200 bg-amber-50/70",
      preview: {
        kind: "contract",
        header: "인플루언서 계약 검토",
        count: "3",
        countLabel: "대기",
        rows: [
          {
            name: "브레드룸",
            title: "홈카페 공동구매 계약",
            status: "2차 활용 수정 필요",
            statusClass: "bg-amber-50 text-amber-800",
            due: "오늘 검토",
          },
          {
            name: "모노트립",
            title: "숙박 브이로그 협찬",
            status: "서명 가능",
            statusClass: "bg-blue-50 text-blue-700",
            due: "D+1",
          },
          {
            name: "누디브랜딩",
            title: "뷰티 릴스 패키지",
            status: "제출 대기",
            statusClass: "bg-emerald-50 text-emerald-700",
            due: "D-3",
          },
        ],
        nextAction: "불리한 조항은 수정 요청 후 광고주 답변 확인",
      },
    },
  ],
} satisfies Record<IntroRole, RoleIntroSlide[]>;

type AdvertiserPreviewListSlide = {
  kind: "list";
  label: string;
  title: string;
  count: string;
  countLabel: string;
  tabMeta?: string;
  dueHeader: string;
  accentClass: string;
  rows: Array<{
    partner: string;
    contract: string;
    contractType: string;
    channel: string;
    status?: string;
    due: string;
  }>;
};

type AdvertiserPreviewBuilderSlide = {
  kind: "builder";
  label: string;
  title: string;
  count: string;
  countLabel: string;
  tabMeta?: string;
  accentClass: string;
  fields: Array<{
    label: string;
    value: string;
  }>;
  contractSummary: Array<{
    label: string;
    value: string;
  }>;
  clauseInputs: string[];
  generatedClauses: Array<{
    title: string;
    text: string;
  }>;
};

type AdvertiserPreviewSlide =
  | AdvertiserPreviewBuilderSlide
  | AdvertiserPreviewListSlide;

const advertiserPreviewSlides: AdvertiserPreviewSlide[] = [
  {
    kind: "builder",
    label: "작성",
    title: "계약서 작성",
    count: "3",
    countLabel: "분",
    tabMeta: "초안",
    accentClass: "bg-blue-600",
    fields: [
      { label: "캠페인명", value: "신제품 언박싱 릴스" },
      { label: "계약 유형", value: "제품 협찬 + 제작비" },
      { label: "금액", value: "2,800,000원" },
      { label: "업로드", value: "6월 12일 18:00" },
    ],
    contractSummary: [
      { label: "광고주", value: "브레드룸" },
      { label: "인플루언서", value: "민서홈" },
      { label: "채널", value: "Instagram Reels" },
      { label: "지급", value: "2,800,000원" },
    ],
    clauseInputs: [
      "콘텐츠는 업로드 후 3개월 동안 브랜드 채널에서 활용",
      "릴스 1건, 스토리 2건 업로드 후 초안 검수 1회",
    ],
    generatedClauses: [
      {
        title: "산출물 및 일정",
        text: "인플루언서는 릴스 1건과 스토리 2건을 6월 12일 18:00까지 업로드합니다.",
      },
      {
        title: "콘텐츠 활용 범위",
        text: "브랜드는 업로드 콘텐츠를 브랜드 공식 채널에서 3개월 동안 활용할 수 있습니다.",
      },
      {
        title: "광고 표시",
        text: "콘텐츠에는 협찬 및 광고 표시 문구를 플랫폼 정책에 맞게 포함합니다.",
      },
    ],
  },
  {
    kind: "list",
    label: "수정",
    title: "수정 요청",
    count: "1",
    countLabel: "건",
    dueHeader: "수정요청일로부터",
    accentClass: "bg-amber-500",
    rows: [
      {
        partner: "오브제스튜디오",
        contract: "2차 콘텐츠 사용 범위",
        contractType: "유료 광고 (PPL)",
        channel: "유튜브-숏츠",
        due: "D+1",
      },
      {
        partner: "박도윤",
        contract: "업로드 일정 조정",
        contractType: "제품 협찬",
        channel: "유튜브-롱폼",
        due: "D+2",
      },
      {
        partner: "스튜디오 문",
        contract: "제품 제공 조건",
        contractType: "제품 협찬",
        channel: "네이버 블로그",
        due: "D+4",
      },
    ],
  },
  {
    kind: "list",
    label: "서명",
    title: "서명 대기",
    count: "4",
    countLabel: "건",
    dueHeader: "서명요청일로부터",
    accentClass: "bg-blue-600",
    rows: [
      {
        partner: "모노트립",
        contract: "카페 팝업 방문 영상",
        contractType: "제품 협찬",
        channel: "유튜브-롱폼",
        due: "D+2",
      },
      {
        partner: "윤서랩",
        contract: "신제품 언박싱 릴스",
        contractType: "공동구매",
        channel: "인스타그램-릴스",
        due: "D+3",
      },
      {
        partner: "채널오브",
        contract: "브랜드 숏폼 패키지",
        contractType: "유료 광고 (PPL)",
        channel: "유튜브-숏츠",
        due: "D+6",
      },
    ],
  },
  {
    kind: "list",
    label: "완료",
    title: "서명 완료",
    count: "12",
    countLabel: "건",
    dueHeader: "기한",
    accentClass: "bg-neutral-900",
    rows: [
      {
        partner: "한서진",
        contract: "FW 룩북 숏폼",
        contractType: "유료 광고 (PPL)",
        channel: "인스타그램-릴스",
        due: "D-4",
      },
      {
        partner: "오브제스튜디오",
        contract: "브랜드 인터뷰 영상",
        contractType: "제품 협찬",
        channel: "유튜브-롱폼",
        due: "D-9",
      },
      {
        partner: "민채널",
        contract: "월간 리뷰 콘텐츠",
        contractType: "제품 협찬",
        channel: "네이버 블로그",
        due: "D-12",
      },
    ],
  },
];

type InfluencerPreviewListSlide = {
  kind: "list";
  label: string;
  title: string;
  count: string;
  tabMeta?: string;
  accentClass: string;
  platformFilters: Array<{
    label: string;
    count: string;
    active?: boolean;
  }>;
  items: Array<{
    brand: string;
    contract: string;
    platform: string;
    accountName: string;
    accountId: string;
    due: string;
  }>;
};

type InfluencerPreviewRevisionSlide = {
  kind: "revision";
  label: string;
  title: string;
  count: string;
  tabMeta?: string;
  accentClass: string;
  brand: string;
  contract: string;
  summary: Array<{
    label: string;
    value: string;
  }>;
  clauses: Array<{
    title: string;
    text: string;
    status: string;
    active?: boolean;
  }>;
  requestText: string;
  checks: string[];
};

type InfluencerPreviewSlide =
  | InfluencerPreviewRevisionSlide
  | InfluencerPreviewListSlide;

const influencerPreviewSlides: InfluencerPreviewSlide[] = [
  {
    kind: "revision",
    label: "수정",
    title: "수정 요청",
    count: "1",
    tabMeta: "요청",
    accentClass: "bg-amber-500",
    brand: "브레드룸",
    contract: "공동구매",
    summary: [
      { label: "계약명", value: "브레드룸 공동구매" },
      { label: "지급", value: "판매수수료 12%" },
      { label: "마감", value: "6월 12일" },
      { label: "검토", value: "1개 조항 확인 필요" },
    ],
    clauses: [
      {
        title: "판매 및 정산",
        text: "판매 수수료는 공동구매 종료 후 7영업일 이내 정산합니다.",
        status: "승인 가능",
      },
      {
        title: "2차 콘텐츠 활용",
        text: "브랜드는 업로드 콘텐츠를 광고 소재로 12개월 동안 활용할 수 있습니다.",
        status: "수정 필요",
        active: true,
      },
      {
        title: "광고 표시",
        text: "콘텐츠에는 협찬 및 공동구매 안내 문구를 플랫폼 정책에 맞게 표시합니다.",
        status: "승인 가능",
      },
    ],
    requestText:
      "활용 기간을 3개월로 줄이고, 추가 활용은 별도 동의 후 진행하고 싶어요.",
    checks: [
      "문제 조항 선택",
      "요청 사유 작성",
      "광고주 답변 대기",
    ],
  },
  {
    kind: "list",
    label: "검토",
    title: "받은 계약",
    count: "2",
    accentClass: "bg-blue-600",
    platformFilters: [
      { label: "전체", count: "2", active: true },
      { label: "인스타그램-릴스", count: "1" },
      { label: "유튜브-숏츠", count: "1" },
    ],
    items: [
      {
        brand: "모노트립",
        contract: "제품 협찬",
        platform: "인스타그램-릴스",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "받은 지 D+1",
      },
      {
        brand: "오브제스튜디오",
        contract: "유료 광고 (PPL)",
        platform: "유튜브-숏츠",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "받은 지 D+3",
      },
    ],
  },
  {
    kind: "list",
    label: "서명",
    title: "서명 대기",
    count: "1",
    accentClass: "bg-blue-600",
    platformFilters: [
      { label: "전체", count: "2" },
      { label: "유튜브-롱폼", count: "1", active: true },
      { label: "네이버 블로그", count: "1" },
    ],
    items: [
      {
        brand: "채널오브",
        contract: "유료 광고 (PPL)",
        platform: "유튜브-롱폼",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "받은 지 D+2",
      },
      {
        brand: "민채널",
        contract: "제품 협찬",
        platform: "네이버 블로그",
        accountName: "민서홈",
        accountId: "minseo.home",
        due: "받은 지 D+5",
      },
    ],
  },
  {
    kind: "list",
    label: "완료",
    title: "서명 완료",
    count: "4",
    accentClass: "bg-neutral-950",
    platformFilters: [
      { label: "전체", count: "4", active: true },
      { label: "인스타그램-릴스", count: "2" },
      { label: "유튜브-롱폼", count: "1" },
      { label: "네이버 블로그", count: "1" },
    ],
    items: [
      {
        brand: "한서진",
        contract: "제품 협찬",
        platform: "인스타그램-릴스",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "업로드 D-4",
      },
      {
        brand: "오브제스튜디오",
        contract: "유료 광고 (PPL)",
        platform: "유튜브-롱폼",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "업로드 D-9",
      },
    ],
  },
];

export function StartPage() {
  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <div className="mx-auto grid min-h-screen w-full max-w-[850px] content-start grid-rows-[60px_auto_44px] px-5 sm:content-normal sm:grid-rows-[68px_1fr_48px] sm:px-6">
        <header className="flex items-center justify-between">
          <Link
            to="/"
            className="-ml-1 flex min-w-0 items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            aria-label={`${PRODUCT_NAME} 홈`}
          >
            <BrandLogo />
          </Link>
          <Link
            to="/login"
            className="inline-flex min-h-8 items-center rounded-full border border-neutral-200 bg-white/65 px-3 text-[11px] font-bold tracking-[-0.005em] text-neutral-500 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            로그인
          </Link>
        </header>

        <section className="flex items-start justify-center pb-4 pt-[clamp(28px,5svh,44px)] sm:pb-8 sm:pt-[clamp(44px,8svh,76px)]">
          <div className="w-full max-w-[710px]">
            <h1
              className="landing-start-title font-neo-heavy mb-7 text-center text-[31px] leading-[1.12] tracking-normal text-neutral-950 sm:mb-8 sm:text-[46px] sm:leading-[1.08]"
              aria-label="입력은 간단하게, 계약은 확실하게"
            >
              <span className="landing-start-copy-line landing-start-copy-line-1 block">
                입력은 간단하게
              </span>
              <span className="landing-start-copy-line landing-start-copy-line-2 mt-1 block">
                계약은 확실하게
              </span>
            </h1>
            <div
              className="mx-auto mb-5 grid grid-cols-2 gap-2 sm:mb-6 sm:grid-cols-4 sm:gap-3"
              aria-label="서비스 구성"
            >
              {startServiceCards.map((service) => {
                const Icon = service.icon;

                return (
                  <div
                    key={service.title}
                    className="min-w-0 rounded-[16px] border border-neutral-200/90 bg-white/82 px-2.5 py-3 text-center shadow-[0_1px_0_rgba(15,23,42,0.03),0_12px_32px_rgba(15,23,42,0.035)] sm:px-3 sm:py-4"
                  >
                    <span
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-[11px] ${service.iconBgClass} ${service.iconClass} sm:h-9 sm:w-9`}
                    >
                      <Icon className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
                    </span>
                    <strong className="mt-2 block break-keep text-[12px] font-extrabold leading-tight tracking-[-0.005em] text-neutral-950 sm:text-[13px]">
                      {service.title}
                    </strong>
                    <span className="mt-1 hidden break-keep text-[11px] font-bold leading-4 text-neutral-500 sm:block">
                      {service.description}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4">
              {roleCards.map((role) => {
                const Icon = role.icon;
                const tone = getStartRoleTone(role.role);
                const isAdvertiser = role.role === "advertiser";
                const detail = isAdvertiser
                  ? "브랜드사 · 광고대행사"
                  : "크리에이터 · 스트리머 · MCN";

                return (
                  <Link
                    key={role.role}
                    to={role.href}
                    aria-label={`${role.title}로 시작`}
                    className={`group flex min-h-[196px] flex-col rounded-[22px] border px-5 py-5 text-left shadow-[0_1px_0_rgba(15,23,42,0.035),0_16px_42px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_22px_58px_rgba(15,23,42,0.06)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950 sm:min-h-[238px] sm:px-6 sm:py-6 ${tone.card}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-[12px] border transition ${tone.icon}`}>
                        <Icon className="h-[17px] w-[17px]" />
                      </span>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${tone.arrow}`}>
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </span>
                    </span>

                    <span className="mt-auto block">
                      <strong className="font-neo-heavy block text-[30px] leading-none tracking-[-0.035em] text-neutral-950 sm:text-[38px]">
                        {role.title}
                      </strong>
                      <span className={`mt-3.5 block border-t pt-3.5 text-[12px] font-bold tracking-[-0.005em] sm:mt-4 sm:pt-4 ${tone.divider} ${tone.detail}`}>
                        {detail}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="flex items-center justify-center gap-5 text-[11px] font-semibold text-neutral-400">
          <Link className="transition hover:text-neutral-950" to="/privacy">
            개인정보
          </Link>
          <Link className="transition hover:text-neutral-950" to="/terms">
            이용약관
          </Link>
        </footer>
      </div>
    </main>
  );
}

function BrandLogo() {
  return (
    <span className="inline-flex items-center gap-2.5" aria-hidden="true">
      <LogoMark />
      <span className="flex items-center">
        <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em] text-neutral-950 sm:text-[19px]">
          {PRODUCT_NAME}
        </span>
      </span>
    </span>
  );
}

function LogoMark() {
  return (
    <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
      <svg
        aria-hidden="true"
        className="h-[23px] w-[23px]"
        fill="none"
        viewBox="0 0 32 32"
      >
        <circle cx="9.8" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
        <circle cx="22.2" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
        <circle cx="16" cy="22" r="3" fill="currentColor" opacity="0.96" />
        <path
          d="M12.1 12.8 16 19.1l3.9-6.3"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.1"
        />
      </svg>
    </span>
  );
}

export function RoleIntroPage({ role }: { role: IntroRole }) {
  const config = introConfig[role];

  return (
    <RoleFeatureIntroScreen
      config={config}
      role={role}
      slides={roleIntroSlides[role]}
    />
  );
}

function RoleFeatureIntroScreen({
  role,
  config,
  slides,
}: {
  role: IntroRole;
  config: IntroConfig;
  slides: RoleIntroSlide[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const activeSlide = slides[activeIndex] ?? slides[0];
  const roleLabel = role === "advertiser" ? "광고주" : "인플루언서";
  const RoleIcon = role === "advertiser" ? Building2 : UserRound;
  const handleFeatureSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setPreviewIndex(index);
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950 lg:h-screen lg:overflow-hidden">
      <header className="border-b border-neutral-200/80 bg-[#fbfaf7]/95">
        <div className="mx-auto flex h-[68px] max-w-[1120px] items-center justify-between px-5 sm:px-6 lg:px-8">
          <BrandLockup />
          <Link
            to={config.secondaryHref}
            className="inline-flex h-9 items-center rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-bold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            로그인
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-68px)] max-w-[1120px] gap-5 px-5 py-5 sm:px-6 lg:h-[calc(100vh-68px)] lg:grid-cols-[340px_minmax(0,1fr)] lg:items-center lg:gap-8 lg:overflow-hidden lg:px-8 lg:py-5">
        <div className="min-w-0 lg:self-center">
          <p className="inline-flex items-center gap-2 text-[13px] font-extrabold text-neutral-500">
            <RoleIcon className="h-4 w-4" />
            {roleLabel}
          </p>
          <h1 className="font-neo-heavy mt-4 text-[44px] leading-[0.98] tracking-normal text-neutral-950 sm:text-[58px] lg:text-[60px]">
            {activeSlide.label}
          </h1>

          <p className="mt-5 max-w-[330px] break-keep text-[14px] font-bold leading-6 text-neutral-600">
            {activeSlide.description}
          </p>

          <div
            className="mt-7 grid w-full max-w-[330px] grid-cols-2 gap-2"
            aria-label={`${roleLabel} 기능 선택`}
          >
            {slides.map((slide, index) => {
              const selected = activeIndex === index;

              return (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => handleFeatureSelect(index)}
                  className={`group flex h-14 items-center justify-between rounded-[10px] border px-4 text-left text-[14px] font-extrabold transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-950 ${
                    selected
                      ? "border-neutral-950 bg-neutral-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
                      : "border-neutral-200 bg-white/80 text-neutral-500 hover:border-neutral-300 hover:text-neutral-950"
                  }`}
                  aria-pressed={selected}
                >
                  <span>{slide.label}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      selected ? "bg-white" : slide.accentClass
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <Link
            to={activeSlide.primaryHref}
            className="group mt-7 inline-flex h-12 w-full max-w-[330px] items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-5 text-[14px] font-extrabold tracking-normal text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] ring-1 ring-blue-500/20 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_18px_42px_rgba(37,99,235,0.28)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 active:translate-y-0"
          >
            <span>{activeSlide.primaryLabel}</span>
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>

          <Link
            to={config.switchHref}
            className="mt-5 inline-flex text-[12px] font-bold text-neutral-400 transition hover:text-neutral-700"
          >
            {config.switchLabel}
          </Link>
        </div>

        <RoleFeaturePreviewCarousel
          className="lg:col-start-2 lg:row-start-1"
          onActiveIndexChange={setActiveIndex}
          onPreviewIndexChange={setPreviewIndex}
          previewIndex={previewIndex}
          slides={slides}
        />

        <div className="hidden">
          <div
            className="mt-6 grid w-full max-w-[430px] grid-cols-1 gap-2 md:grid-cols-2"
            aria-label={`${roleLabel} 기능 선택`}
          >
            {slides.map((slide, index) => {
              const Icon = slide.icon;
              const selected = activeIndex === index;

              return (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => handleFeatureSelect(index)}
                  className={`group min-h-[92px] rounded-[8px] border p-3 text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-950 ${
                    selected
                      ? `${slide.cardClass} shadow-[0_12px_30px_rgba(15,23,42,0.08)]`
                      : "border-neutral-200 bg-white/70 hover:border-neutral-300"
                  }`}
                  aria-pressed={selected}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] ${
                        selected ? slide.iconClass : "text-neutral-500"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span
                      className={`mt-1 h-2 w-2 rounded-full ${
                        selected ? slide.accentClass : "bg-neutral-200"
                      }`}
                    />
                  </span>
                  <span className="mt-3 block text-[13px] font-extrabold tracking-normal text-neutral-950">
                    {slide.label}
                  </span>
                  <span className="mt-1 line-clamp-2 block break-keep text-[11px] font-bold leading-4 text-neutral-500">
                    {slide.helper}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex w-full max-w-[430px] flex-col gap-2 sm:flex-row">
            <Link
              to={activeSlide.primaryHref}
              className="group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[8px] bg-blue-600 px-5 text-[14px] font-extrabold tracking-normal text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] ring-1 ring-blue-500/20 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_18px_42px_rgba(37,99,235,0.28)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 active:translate-y-0"
            >
              <span>{activeSlide.primaryLabel}</span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              to={activeSlide.secondaryHref}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-[8px] border border-neutral-200 bg-white px-5 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              {activeSlide.secondaryLabel}
            </Link>
          </div>

          <Link
            to={config.switchHref}
            className="mt-6 inline-flex text-[12px] font-bold text-neutral-400 transition hover:text-neutral-700"
          >
            {config.switchLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}

function RoleFeaturePreviewCarousel({
  slides,
  previewIndex,
  className = "",
  onActiveIndexChange,
  onPreviewIndexChange,
}: {
  slides: RoleIntroSlide[];
  previewIndex: number;
  className?: string;
  onActiveIndexChange: (index: number) => void;
  onPreviewIndexChange: (index: number) => void;
}) {
  const [isFading, setIsFading] = useState(false);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [autoPausedUntil, setAutoPausedUntil] = useState(0);
  const transitionTimers = useRef<number[]>([]);
  const activeSlide = slides[previewIndex] ?? slides[0];

  const clearTransitionTimers = useCallback(() => {
    transitionTimers.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimers.current = [];
  }, []);

  const prefersReducedMotion = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const showSlide = useCallback(
    (nextIndex: number, syncIntroCopy = true) => {
      const normalizedIndex = (nextIndex + slides.length) % slides.length;

      if (normalizedIndex === previewIndex) {
        return;
      }

      clearTransitionTimers();

      const applySlide = () => {
        onPreviewIndexChange(normalizedIndex);

        if (syncIntroCopy) {
          onActiveIndexChange(normalizedIndex);
        }
      };

      if (prefersReducedMotion()) {
        applySlide();
        return;
      }

      setIsFading(true);
      transitionTimers.current = [
        window.setTimeout(applySlide, 240),
        window.setTimeout(() => {
          setIsFading(false);
          transitionTimers.current = [];
        }, 520),
      ];
    },
    [
      clearTransitionTimers,
      onActiveIndexChange,
      onPreviewIndexChange,
      prefersReducedMotion,
      previewIndex,
      slides.length,
    ],
  );

  const showManualSlide = useCallback(
    (nextIndex: number) => {
      setAutoPausedUntil(Date.now() + ROLE_PREVIEW_MANUAL_RESUME_DELAY_MS);
      showSlide(nextIndex, true);
    },
    [showSlide],
  );

  useEffect(() => {
    if (prefersReducedMotion() || isAutoPaused) {
      return undefined;
    }

    const now = Date.now();
    const delay =
      autoPausedUntil > now
        ? autoPausedUntil - now
        : ROLE_PREVIEW_AUTO_DELAY_MS;

    const timer = window.setTimeout(() => {
      setAutoPausedUntil(0);
      showSlide(previewIndex === slides.length - 1 ? 0 : previewIndex + 1, true);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    autoPausedUntil,
    isAutoPaused,
    prefersReducedMotion,
    previewIndex,
    showSlide,
    slides.length,
  ]);

  useEffect(() => clearTransitionTimers, [clearTransitionTimers]);

  return (
    <section
      aria-label="기능별 화면 미리보기"
      className={`${className} mx-auto flex w-full min-w-0 max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-[18px] border border-neutral-200 bg-[#fbfaf7] shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:max-w-full sm:rounded-[24px] lg:h-[calc(100vh-96px)] lg:max-h-[640px]`}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;

        if (
          !(nextTarget instanceof Node) ||
          !event.currentTarget.contains(nextTarget)
        ) {
          setIsAutoPaused(false);
        }
      }}
      onFocusCapture={() => setIsAutoPaused(true)}
      onMouseEnter={() => setIsAutoPaused(true)}
      onMouseLeave={() => setIsAutoPaused(false)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
        </div>
        <div className="flex items-center gap-1" aria-label="미리보기 이동">
          <button
            type="button"
            onClick={() => showManualSlide(previewIndex - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            aria-label="이전 기능 미리보기"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => showManualSlide(previewIndex + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            aria-label="다음 기능 미리보기"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
        <div
          className="mb-3 grid min-w-0 shrink-0 grid-cols-4 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1"
          role="tablist"
          aria-label="기능 미리보기 종류"
        >
          {slides.map((slide, index) => (
            <button
              key={slide.label}
              type="button"
              role="tab"
              aria-controls={`role-preview-panel-${index}`}
              aria-selected={previewIndex === index}
              onClick={() => showManualSlide(index)}
              tabIndex={previewIndex === index ? 0 : -1}
              className={`h-9 min-w-0 rounded-full px-1 text-[12px] font-extrabold tracking-normal transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
                previewIndex === index
                  ? "bg-white text-neutral-950 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <span className="block truncate">{slide.label}</span>
            </button>
          ))}
        </div>

        <div className="relative min-h-[420px] flex-1 overflow-hidden lg:min-h-0">
          <div
            className={`h-full transition duration-300 ease-out ${
              isFading ? "translate-x-4 opacity-0" : "translate-x-0 opacity-100"
            }`}
          >
            <RolePreviewSlideView
              panelId={`role-preview-panel-${previewIndex}`}
              slide={activeSlide}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function RolePreviewSlideView({
  slide,
  panelId,
}: {
  slide: RoleIntroSlide;
  panelId: string;
}) {
  if (slide.preview.kind === "profile") {
    return (
      <RoleProfilePreview
        panelId={panelId}
        preview={slide.preview}
        slide={slide}
      />
    );
  }

  if (slide.preview.kind === "discover") {
    return (
      <RoleDiscoverPreview
        panelId={panelId}
        preview={slide.preview}
        slide={slide}
      />
    );
  }

  if (slide.preview.kind === "proposal") {
    return (
      <RoleProposalPreview
        panelId={panelId}
        preview={slide.preview}
        slide={slide}
      />
    );
  }

  return (
    <RoleContractPreview
      panelId={panelId}
      preview={slide.preview}
      slide={slide}
    />
  );
}

function RolePreviewPanel({
  slide,
  children,
  meta,
  panelId,
}: {
  slide: RoleIntroSlide;
  children: ReactNode;
  meta?: ReactNode;
  panelId: string;
}) {
  return (
    <div
      id={panelId}
      key={slide.label}
      role="tabpanel"
      className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-[14px] border border-neutral-200 bg-white lg:min-h-0 sm:rounded-[16px]"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${slide.accentClass}`} />
            <p className="truncate text-[12px] font-extrabold tracking-normal text-neutral-950">
              {slide.preview.header}
            </p>
          </div>
          <p className="mt-1 truncate text-[11px] font-bold text-neutral-400">
            {slide.helper}
          </p>
        </div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-[#fbfaf7] p-3 sm:p-4">
        {children}
      </div>
    </div>
  );
}

function RoleProfilePreview({
  slide,
  preview,
  panelId,
}: {
  slide: RoleIntroSlide;
  preview: RolePreviewProfile;
  panelId: string;
}) {
  return (
    <RolePreviewPanel
      panelId={panelId}
      slide={slide}
      meta={
        <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-extrabold text-neutral-600">
          공개 링크
        </span>
      }
    >
      <div className="rounded-[12px] border border-neutral-200 bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] bg-neutral-950 text-[18px] font-extrabold text-white">
            {preview.profileName.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-extrabold text-neutral-950">
              {preview.profileName}
            </p>
            <p className="mt-1 truncate text-[12px] font-bold text-blue-700">
              {preview.handle}
            </p>
            <p className="mt-3 break-keep text-[13px] font-bold leading-5 text-neutral-600">
              {preview.headline}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {preview.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-neutral-200 bg-[#f8f7f4] px-2.5 py-1 text-[11px] font-extrabold text-neutral-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {preview.stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[8px] border border-neutral-200 bg-white px-3 py-3"
          >
            <p className="text-[10px] font-extrabold text-neutral-400">
              {stat.label}
            </p>
            <p className="mt-1 text-[16px] font-extrabold text-neutral-950">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-[12px] border border-neutral-200 bg-white">
        {preview.channels.map((channel) => (
          <div
            key={channel.label}
            className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_72px] gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0"
          >
            <span className="truncate text-[12px] font-extrabold text-neutral-500">
              {channel.label}
            </span>
            <span className="truncate text-[12px] font-extrabold text-neutral-950">
              {channel.value}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-center text-[10px] font-extrabold text-emerald-700">
              {channel.status}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-[12px] bg-neutral-950 p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold text-white/55">다음 행동</p>
            <p className="mt-1 truncate text-[14px] font-extrabold">
              {preview.actionLabel}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </div>
        <p className="mt-2 hidden break-keep text-[11px] font-bold leading-5 text-white/65 xl:block">
          {preview.footerNote}
        </p>
      </div>
    </RolePreviewPanel>
  );
}

function RoleDiscoverPreview({
  slide,
  preview,
  panelId,
}: {
  slide: RoleIntroSlide;
  preview: RolePreviewDiscover;
  panelId: string;
}) {
  return (
    <RolePreviewPanel
      panelId={panelId}
      slide={slide}
      meta={
        <span className="font-neo-heavy text-[26px] leading-none text-neutral-950">
          {preview.cards.length}
        </span>
      }
    >
      <div className="rounded-[12px] border border-neutral-200 bg-white p-3">
        <div className="flex items-center gap-2 rounded-[8px] border border-neutral-200 bg-[#f8f7f4] px-3 py-2 text-[11px] font-bold text-neutral-400">
          <Search className="h-3.5 w-3.5" />
          <span className="min-w-0 truncate">{preview.searchPlaceholder}</span>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {preview.filters.map((filter) => (
            <span
              key={filter.label}
              className={`inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-extrabold ${
                filter.active
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-200 bg-white text-neutral-500"
              }`}
            >
              {filter.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2 grid gap-2">
        {preview.cards.map((card) => (
          <article
            key={card.name}
            className="rounded-[12px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.035)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[16px] font-extrabold text-neutral-950">
                  {card.name}
                </p>
                <p className="mt-1 truncate text-[11px] font-bold text-neutral-400">
                  {card.meta}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">
                {card.badge}
              </span>
            </div>
            <p className="mt-2 line-clamp-1 break-keep text-[12px] font-bold leading-5 text-neutral-600">
              {card.description}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {card.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[8px] bg-[#f8f7f4] px-3 py-2"
                >
                  <p className="text-[10px] font-extrabold text-neutral-400">
                    {stat.label}
                  </p>
                  <p className="mt-1 truncate text-[12px] font-extrabold text-neutral-950">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex h-8 items-center justify-between rounded-[8px] border border-neutral-200 px-3 text-[12px] font-extrabold text-neutral-700">
              {card.action}
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </article>
        ))}
      </div>
    </RolePreviewPanel>
  );
}

function RoleProposalPreview({
  slide,
  preview,
  panelId,
}: {
  slide: RoleIntroSlide;
  preview: RolePreviewProposal;
  panelId: string;
}) {
  return (
    <RolePreviewPanel
      panelId={panelId}
      slide={slide}
      meta={
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
          초안 저장
        </span>
      }
    >
      <div className="rounded-[12px] border border-neutral-200 bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <p className="text-[11px] font-extrabold text-neutral-400">
          {preview.targetLabel}
        </p>
        <p className="mt-1 truncate text-[16px] font-extrabold text-neutral-950">
          {preview.targetName}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {preview.fields.map((field) => (
            <div
              key={field.label}
              className="rounded-[8px] border border-neutral-200 bg-[#f8f7f4] px-3 py-2"
            >
              <p className="text-[10px] font-extrabold text-neutral-400">
                {field.label}
              </p>
              <p className="mt-1 truncate text-[12px] font-extrabold text-neutral-950">
                {field.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 rounded-[12px] border border-neutral-200 bg-white p-3.5">
        <p className="text-[11px] font-extrabold text-neutral-400">
          제안 메시지
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {preview.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700"
            >
              {chip}
            </span>
          ))}
        </div>
        <p className="mt-2 min-h-[60px] break-keep rounded-[8px] border border-neutral-200 bg-[#f8f7f4] px-3 py-2.5 text-[12px] font-bold leading-5 text-neutral-700">
          {preview.message}
        </p>
      </div>

      <div className="mt-2 hidden gap-2 xl:grid xl:grid-cols-4">
        {preview.timeline.map((item, index) => (
          <div
            key={item}
            className="rounded-[8px] border border-neutral-200 bg-white px-3 py-2"
          >
            <p className="text-[10px] font-extrabold text-neutral-400">
              0{index + 1}
            </p>
            <p className="mt-1 truncate text-[11px] font-extrabold text-neutral-800">
              {item}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-2 hidden items-center justify-between gap-3 rounded-[12px] bg-neutral-950 px-4 py-3 text-white xl:flex">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold text-white/55">다음 행동</p>
          <p className="mt-1 truncate text-[13px] font-extrabold">
            {preview.actionLabel}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </div>
    </RolePreviewPanel>
  );
}

function RoleContractPreview({
  slide,
  preview,
  panelId,
}: {
  slide: RoleIntroSlide;
  preview: RolePreviewContract;
  panelId: string;
}) {
  return (
    <RolePreviewPanel
      panelId={panelId}
      slide={slide}
      meta={
        <div className="flex items-baseline gap-1">
          <span className="font-neo-heavy text-[26px] leading-none text-neutral-950">
            {preview.count}
          </span>
          <span className="text-[11px] font-extrabold text-neutral-400">
            {preview.countLabel}
          </span>
        </div>
      }
    >
      <div className="overflow-hidden rounded-[12px] border border-neutral-200 bg-white">
        <div className="hidden grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_112px] gap-3 border-b border-neutral-200 bg-[#f8f7f4] px-4 py-2.5 text-[10px] font-extrabold text-neutral-400 sm:grid">
          <span>상대</span>
          <span>계약/제안</span>
          <span>상태</span>
        </div>
        {preview.rows.map((row) => (
          <div
            key={`${row.name}-${row.title}`}
            className="border-b border-neutral-200 p-3.5 last:border-b-0 sm:grid sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_112px] sm:items-center sm:gap-3 sm:px-4 sm:py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-extrabold text-neutral-950">
                {row.name}
              </p>
              <p className="mt-1 text-[10px] font-bold text-neutral-400 sm:hidden">
                {row.due}
              </p>
            </div>
            <div className="mt-2 min-w-0 sm:mt-0">
              <p className="truncate text-[13px] font-extrabold text-neutral-900">
                {row.title}
              </p>
              <p className="mt-1 hidden text-[10px] font-bold text-neutral-400 sm:block">
                {row.due}
              </p>
            </div>
            <span
              className={`mt-3 inline-flex h-7 max-w-full items-center justify-center truncate rounded-full px-2.5 text-[10px] font-extrabold sm:mt-0 ${row.statusClass}`}
            >
              {row.status}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-[12px] border border-neutral-200 bg-white p-4">
        <p className="text-[11px] font-extrabold text-neutral-400">다음 행동</p>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-[8px] bg-neutral-950 px-3 py-3 text-white">
          <p className="min-w-0 truncate text-[13px] font-extrabold">
            {preview.nextAction}
          </p>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </div>
      </div>
    </RolePreviewPanel>
  );
}

function _LegacyRoleIntroScreen({ config }: { config: IntroConfig }) {
  return (
    <main className="min-h-screen bg-[#f5f7f2] font-sans text-[#171a17]">
      <LandingHeader />

      <section className="border-b border-[#d9e0d9] bg-[#f5f7f2]">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-9 sm:px-6 lg:grid-cols-[minmax(420px,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:px-8 lg:py-12">
          <div className="min-w-0">
            <p className={`text-[13px] font-semibold ${config.accentText}`}>
              {config.eyebrow}
            </p>
            <h1 className="mt-4 max-w-2xl text-[34px] font-semibold leading-[1.16] text-[#141714] sm:text-[42px] sm:leading-[1.12]">
              {config.title.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-7 text-[#59605b]">
              {config.description}
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Link
                to={config.primaryHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-[8px] bg-[#171a17] px-5 text-[15px] font-semibold text-white shadow-[0_14px_34px_rgba(23,26,23,0.18)] transition hover:bg-[#2a2f2a]"
              >
                {config.primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to={config.secondaryHref}
                className="inline-flex h-12 items-center justify-center rounded-[8px] border border-[#cfd8d0] bg-white px-5 text-[15px] font-semibold text-[#303630] transition hover:border-[#7d887f]"
              >
                {config.secondaryLabel}
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {config.proofPoints.map((point) => (
                <span
                  key={point}
                  className="inline-flex min-h-9 items-center gap-2 rounded-[8px] border border-[#d9e0d9] bg-white px-3 py-2 text-[12px] font-semibold text-[#4f5852]"
                >
                  <ShieldCheck className={`h-3.5 w-3.5 ${config.accentText}`} />
                  {point}
                </span>
              ))}
            </div>

            <Link
              to={config.switchHref}
              className="mt-6 inline-flex text-[13px] font-semibold text-[#6f7871] transition hover:text-[#171a17]"
            >
              {config.switchLabel}
            </Link>
          </div>

          <RoleDashboardPreview config={config} />
        </div>
      </section>

      <section className="border-b border-[#d9e0d9] bg-[#fcfcfa]">
        <div className="mx-auto max-w-[1240px] px-5 py-9 sm:px-6 lg:px-8">
          <div className="mb-5 max-w-2xl">
            <p className={`text-[13px] font-semibold ${config.accentText}`}>
              {config.sectionLabel}
            </p>
            <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#171a17] sm:text-[30px]">
              {config.sectionTitle}
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-3">
              {config.flow.map((step) => (
                <article
                  key={step.label}
                  className="grid gap-3 rounded-[8px] border border-[#d9e0d9] bg-white p-4 sm:grid-cols-[56px_1fr]"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-[8px] text-[13px] font-semibold ${config.accentBg} ${config.accentText}`}
                  >
                    {step.label}
                  </span>
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#171a17]">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-[14px] leading-6 text-[#59605b]">
                      {step.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {config.features.map((feature) => {
                const Icon = feature.icon;

                return (
                  <article
                    key={feature.title}
                    className="rounded-[8px] border border-[#d9e0d9] bg-white p-5 shadow-[0_1px_2px_rgba(23,26,23,0.04)]"
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-[8px] ${config.accentBg} ${config.accentText}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="mt-4 text-[16px] font-semibold text-[#171a17]">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-[14px] leading-6 text-[#59605b]">
                      {feature.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}

function _InfluencerIntroScreen({ config }: { config: IntroConfig }) {
  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-[#fbfaf7]/95">
        <div className="mx-auto flex h-[68px] max-w-[1120px] items-center justify-between px-5 sm:px-6 lg:px-8">
          <BrandLockup />
          <Link
            to={config.secondaryHref}
            className="inline-flex h-9 items-center rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-bold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            로그인
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-68px)] max-w-[1120px] gap-8 px-5 py-8 sm:px-6 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:px-8 lg:py-10">
        <div className="max-w-[430px]">
          <p className="font-neo-heavy text-[18px] leading-none tracking-[-0.035em] text-neutral-700 sm:text-[20px]">
            인플루언서
          </p>
          <h1 className="font-neo-heavy mt-3 text-[46px] leading-[0.96] tracking-[-0.06em] text-neutral-950 sm:text-[64px]">
            계약 검토
          </h1>

          <div className="mt-7 flex w-full max-w-[320px] flex-col gap-2">
            <Link
              to={config.primaryHref}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-[14px] bg-blue-600 px-5 text-[14px] font-extrabold tracking-[-0.01em] text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] ring-1 ring-blue-500/20 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_18px_42px_rgba(37,99,235,0.28)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 active:translate-y-0"
            >
              <span>받은 계약 확인하기</span>
              <span
                aria-hidden="true"
                className="text-[15px] leading-none transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
            <Link
              to="/influencer/brands"
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-neutral-200 bg-white px-5 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              입점 브랜드 둘러보기
            </Link>
          </div>

          <p className="mt-6 max-w-[320px] text-[14px] font-extrabold leading-6 tracking-[-0.02em] text-neutral-600">
            받은 계약을 확인하고, 필요한 요청과 서명 기록을 남깁니다.
          </p>

          <Link
            to={config.switchHref}
            className="mt-6 inline-flex text-[12px] font-bold text-neutral-400 transition hover:text-neutral-700"
          >
            광고주 화면
          </Link>
        </div>

        <InfluencerPreviewCarousel />
      </section>
    </main>
  );
}

function InfluencerPreviewCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const transitionTimers = useRef<number[]>([]);
  const activeSlide = influencerPreviewSlides[activeIndex];

  const clearTransitionTimers = useCallback(() => {
    transitionTimers.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimers.current = [];
  }, []);

  const prefersReducedMotion = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const showSlide = useCallback(
    (nextIndex: number) => {
      if (nextIndex === activeIndex) {
        return;
      }

      clearTransitionTimers();

      if (prefersReducedMotion()) {
        setActiveIndex(nextIndex);
        return;
      }

      setIsFading(true);
      transitionTimers.current = [
        window.setTimeout(() => setActiveIndex(nextIndex), 260),
        window.setTimeout(() => {
          setIsFading(false);
          transitionTimers.current = [];
        }, 540),
      ];
    },
    [activeIndex, clearTransitionTimers, prefersReducedMotion],
  );

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      showSlide(
        activeIndex === influencerPreviewSlides.length - 1
          ? 0
          : activeIndex + 1,
      );
    }, 5000);

    return () => window.clearInterval(timer);
  }, [activeIndex, showSlide]);

  useEffect(() => clearTransitionTimers, [clearTransitionTimers]);

  const showPrevious = () => {
    showSlide(activeIndex === 0 ? influencerPreviewSlides.length - 1 : activeIndex - 1);
  };

  const showNext = () => {
    showSlide(
      activeIndex === influencerPreviewSlides.length - 1 ? 0 : activeIndex + 1,
    );
  };

  return (
    <section
      aria-label="인플루언서 수정 요청 및 계약 미리보기"
      className="mx-auto w-full min-w-0 max-w-[calc(100vw-40px)] overflow-hidden rounded-[30px] border border-neutral-200 bg-[#fbfaf7] shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:max-w-full"
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
        </div>
        <div className="flex items-center gap-1" aria-label="미리보기 이동">
          <button
            type="button"
            onClick={showPrevious}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            aria-label="이전 미리보기"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={showNext}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            aria-label="다음 미리보기"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-w-0 p-4 sm:p-5">
        <div
          className="mb-4 grid min-w-0 grid-cols-4 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1"
          role="tablist"
          aria-label="미리보기 종류"
        >
          {influencerPreviewSlides.map((slide, index) => (
            <button
              key={slide.label}
              type="button"
              role="tab"
              aria-selected={activeIndex === index}
              onClick={() => showSlide(index)}
              className={`h-9 min-w-0 rounded-full px-1 text-[12px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
                activeIndex === index
                  ? "bg-white text-neutral-950 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {slide.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <InfluencerPreviewSlideView slide={activeSlide} />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-10 rounded-[22px] bg-white transition-opacity duration-300 ease-out ${
              isFading ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      </div>
    </section>
  );
}

function InfluencerPreviewSlideView({
  slide,
}: {
  slide: InfluencerPreviewSlide;
}) {
  if (slide.kind === "revision") {
    return <InfluencerRevisionPreview slide={slide} />;
  }

  return (
    <div
      key={slide.label}
      className="rounded-[22px] border border-neutral-200 bg-white"
    >
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${slide.accentClass}`} />
            <p className="text-[12px] font-extrabold tracking-[-0.01em] text-neutral-950">
              {slide.title}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-baseline justify-end gap-1 text-right">
          <span className="font-neo-heavy text-[26px] leading-none tracking-[-0.05em] text-neutral-950">
            {slide.count}
          </span>
          <span className="text-[11px] font-extrabold text-neutral-400">건</span>
        </div>
      </div>

      <div className="border-b border-neutral-200 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 rounded-[14px] border border-neutral-200 bg-[#f8f7f4] px-3 py-2 text-[11px] font-bold text-neutral-400">
          <Search className="h-3.5 w-3.5" />
          <span className="min-w-0 truncate">브랜드, 계약, 플랫폼 검색</span>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {slide.platformFilters.map((filter) => (
            <span
              key={`${slide.label}-${filter.label}`}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-extrabold ${
                filter.active
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-200 bg-white text-neutral-500"
              }`}
            >
              <span>{filter.label}</span>
              <span className={filter.active ? "text-white/65" : "text-neutral-400"}>
                {filter.count}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2.5 bg-[#fbfaf7] p-3 sm:space-y-0 sm:bg-white sm:p-0">
        <div className="hidden grid-cols-[minmax(0,0.82fr)_minmax(0,0.9fr)_minmax(0,1.08fr)_104px] gap-3 border-b border-neutral-200 bg-[#fbfaf7] px-4 py-2.5 text-[10px] font-extrabold text-neutral-400 sm:grid sm:px-5">
          <span>브랜드</span>
          <span>계약</span>
          <span>플랫폼</span>
          <span>마감일</span>
        </div>
        {slide.items.map((item) => (
          <div
            key={`${slide.label}-${item.brand}-${item.contract}-${item.platform}`}
            className="min-w-0 rounded-[8px] border border-neutral-200 bg-white p-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)] sm:grid sm:grid-cols-[minmax(0,0.82fr)_minmax(0,0.9fr)_minmax(0,1.08fr)_104px] sm:items-center sm:gap-3 sm:rounded-none sm:border-0 sm:border-b sm:border-neutral-200 sm:px-5 sm:py-3 sm:shadow-none sm:last:border-b-0"
          >
            <div className="sm:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold text-neutral-400">
                    계약
                  </p>
                  <p className="mt-1 truncate text-[14px] font-extrabold tracking-[-0.01em] text-neutral-950">
                    {item.contract}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-neutral-200 bg-[#f8f7f4] px-2.5 py-1 text-[11px] font-extrabold text-neutral-600">
                  {slide.title}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MobilePreviewMeta label="브랜드" value={item.brand} />
                <MobilePreviewMeta label="마감" value={item.due} />
              </div>
              <div className="mt-2">
                <MobilePreviewMeta
                  label="플랫폼"
                  value={item.platform}
                  detail={`${item.accountName} / ${item.accountId}`}
                />
              </div>
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[13px] font-extrabold tracking-[-0.01em] text-neutral-900">
                {item.brand}
              </p>
            </div>
            <p className="hidden min-w-0 truncate text-[13px] font-extrabold tracking-[-0.015em] text-neutral-950 sm:block">
              {item.contract}
            </p>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[13px] font-extrabold tracking-[-0.01em] text-neutral-950">
                {item.platform}
              </p>
              <p className="mt-1 truncate text-[10px] font-bold tracking-[-0.005em] text-neutral-400">
                {item.accountName} / {item.accountId}
              </p>
            </div>
            <span className="hidden text-[12px] font-extrabold tabular-nums text-neutral-500 sm:block">
              {item.due}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfluencerRevisionPreview({
  slide,
}: {
  slide: InfluencerPreviewRevisionSlide;
}) {
  return (
    <div
      key={slide.label}
      className="overflow-hidden rounded-[22px] border border-neutral-200 bg-white"
    >
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${slide.accentClass}`} />
            <p className="text-[12px] font-extrabold tracking-[-0.01em] text-neutral-950">
              {slide.title}
            </p>
          </div>
          <p className="mt-1 truncate text-[11px] font-bold text-neutral-400">
            {slide.brand} · {slide.contract}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline justify-end gap-1 text-right">
          <span className="font-neo-heavy text-[26px] leading-none tracking-[-0.05em] text-neutral-950">
            {slide.count}
          </span>
          <span className="text-[11px] font-extrabold text-neutral-400">건</span>
        </div>
      </div>

      <div className="bg-[#fbfaf7] p-3 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-4">
          {slide.summary.map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-[12px] border border-neutral-200 bg-white px-3 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)]"
            >
              <p className="text-[10px] font-extrabold text-neutral-400">
                {item.label}
              </p>
              <p className="mt-1 truncate text-[12px] font-extrabold text-neutral-950">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-[16px] border border-neutral-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold text-neutral-400">
                계약 조항
              </p>
              <p className="mt-1 truncate text-[14px] font-extrabold text-neutral-950">
                조항별 검토
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold text-amber-700">
              1개 확인 필요
            </span>
          </div>

          <div className="divide-y divide-neutral-200">
            {slide.clauses.map((clause, index) => (
              <div
                key={clause.title}
                className={`p-3.5 ${clause.active ? "bg-amber-50/65" : "bg-white"}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${
                      clause.active
                        ? "bg-amber-100 text-amber-800"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[13px] font-extrabold text-neutral-950">
                        {clause.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                          clause.active
                            ? "bg-amber-100 text-amber-800"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {clause.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 rounded-[10px] border border-neutral-200 bg-white px-3 py-2 text-[11px] font-bold leading-4 text-neutral-600">
                      {clause.text}
                    </p>
                    {clause.active ? (
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                        <span className="inline-flex h-8 items-center justify-center rounded-[8px] border border-neutral-200 bg-white text-[11px] font-extrabold text-neutral-700">
                          이 조항 승인
                        </span>
                        <span className="inline-flex h-8 items-center justify-center rounded-[8px] border border-amber-200 bg-amber-50 text-[11px] font-extrabold text-amber-800">
                          수정 요청
                        </span>
                        <span className="inline-flex h-8 items-center justify-center rounded-[8px] border border-rose-200 bg-rose-50 text-[11px] font-extrabold text-rose-700">
                          삭제 요청
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-[16px] border border-neutral-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <p className="text-[11px] font-extrabold text-neutral-400">
            수정 요청 작성
          </p>
          <p className="mt-2 min-h-[56px] rounded-[12px] border border-neutral-200 bg-[#f8f7f4] px-3 py-2.5 text-[12px] font-bold leading-5 text-neutral-700">
            {slide.requestText}
          </p>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {slide.checks.map((check) => (
            <div
              key={check}
              className="flex min-h-9 items-center gap-2 rounded-[10px] border border-neutral-200 bg-white px-3 text-[11px] font-extrabold text-neutral-600"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className="truncate">{check}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-[14px] bg-neutral-950 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold text-white/55">
              다음 행동
            </p>
            <p className="mt-1 truncate text-[13px] font-extrabold">
              수정 요청 보내기
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </div>
      </div>
    </div>
  );
}

function _AdvertiserIntroScreen({ config }: { config: IntroConfig }) {
  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-[#fbfaf7]/95">
        <div className="mx-auto flex h-[68px] max-w-[1120px] items-center justify-between px-5 sm:px-6 lg:px-8">
          <BrandLockup />
          <Link
            to={config.secondaryHref}
            className="inline-flex h-9 items-center rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-bold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            로그인
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-68px)] max-w-[1120px] gap-8 px-5 py-8 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:px-8 lg:py-10">
        <div className="max-w-[430px]">
          <p className="font-neo-heavy text-[18px] leading-none tracking-[-0.035em] text-neutral-700 sm:text-[20px]">
            광고주
          </p>
          <h1 className="font-neo-heavy mt-3 text-[46px] leading-[0.96] tracking-[-0.06em] text-neutral-950 sm:text-[64px]">
            계약 관리
          </h1>

          <div className="mt-7 flex w-full max-w-[320px] flex-col gap-2">
            <Link
              to={config.primaryHref}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-[14px] bg-blue-600 px-5 text-[14px] font-extrabold tracking-[-0.01em] text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] ring-1 ring-blue-500/20 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_18px_42px_rgba(37,99,235,0.28)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 active:translate-y-0"
            >
              <span>새 계약 만들기</span>
              <span
                aria-hidden="true"
                className="text-[15px] leading-none transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
            <Link
              to="/advertiser/discover"
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-neutral-200 bg-white px-5 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              인플루언서 둘러보기
            </Link>
          </div>

          <p className="mt-6 max-w-[320px] text-[14px] font-extrabold leading-6 tracking-[-0.02em] text-neutral-600">
            광고 계약의 작성, 검토, 서명 기록을 한 곳에 남깁니다.
          </p>

          <Link
            to={config.switchHref}
            className="mt-6 inline-flex text-[12px] font-bold text-neutral-400 transition hover:text-neutral-700"
          >
            인플루언서 화면
          </Link>
        </div>

        <AdvertiserPreviewCarousel />
      </section>
    </main>
  );
}

function AdvertiserPreviewCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const transitionTimers = useRef<number[]>([]);
  const activeSlide = advertiserPreviewSlides[activeIndex];

  const clearTransitionTimers = useCallback(() => {
    transitionTimers.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimers.current = [];
  }, []);

  const prefersReducedMotion = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const showSlide = useCallback(
    (nextIndex: number) => {
      if (nextIndex === activeIndex) {
        return;
      }

      clearTransitionTimers();

      if (prefersReducedMotion()) {
        setActiveIndex(nextIndex);
        return;
      }

      setIsFading(true);
      transitionTimers.current = [
        window.setTimeout(() => setActiveIndex(nextIndex), 260),
        window.setTimeout(() => {
          setIsFading(false);
          transitionTimers.current = [];
        }, 540),
      ];
    },
    [activeIndex, clearTransitionTimers, prefersReducedMotion],
  );

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      showSlide(
        activeIndex === advertiserPreviewSlides.length - 1
          ? 0
          : activeIndex + 1,
      );
    }, 5000);

    return () => window.clearInterval(timer);
  }, [activeIndex, showSlide]);

  useEffect(() => clearTransitionTimers, [clearTransitionTimers]);

  const showPrevious = () => {
    showSlide(activeIndex === 0 ? advertiserPreviewSlides.length - 1 : activeIndex - 1);
  };

  const showNext = () => {
    showSlide(
      activeIndex === advertiserPreviewSlides.length - 1 ? 0 : activeIndex + 1,
    );
  };

  return (
    <section
      aria-label="광고주 계약 작성 및 대시보드 미리보기"
      className="mx-auto w-full min-w-0 max-w-[calc(100vw-40px)] overflow-hidden rounded-[30px] border border-neutral-200 bg-[#fbfaf7] shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:max-w-full"
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
        </div>
        <div className="flex items-center gap-1" aria-label="미리보기 이동">
          <button
            type="button"
            onClick={showPrevious}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            aria-label="이전 미리보기"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={showNext}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            aria-label="다음 미리보기"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-w-0 p-4 sm:p-5">
        <div
          className="mb-4 grid min-w-0 grid-cols-4 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1"
          role="tablist"
          aria-label="미리보기 종류"
        >
          {advertiserPreviewSlides.map((slide, index) => (
            <button
              key={slide.label}
              type="button"
              role="tab"
              aria-selected={activeIndex === index}
              onClick={() => showSlide(index)}
              className={`h-9 min-w-0 rounded-full px-1 text-[12px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
                activeIndex === index
                  ? "bg-white text-neutral-950 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <span className="inline-flex min-w-0 max-w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap">
                {slide.label}
                <span
                  className={`text-[10px] ${
                    activeIndex === index ? "text-neutral-500" : "text-neutral-400"
                  }`}
                >
                  {slide.tabMeta ?? slide.count}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <AdvertiserPreviewSlideView slide={activeSlide} />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-10 rounded-[22px] bg-white transition-opacity duration-300 ease-out ${
              isFading ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      </div>
    </section>
  );
}

function AdvertiserPreviewSlideView({
  slide,
}: {
  slide: AdvertiserPreviewSlide;
}) {
  if (slide.kind === "builder") {
    return <AdvertiserBuilderPreview slide={slide} />;
  }

  return (
    <div
      key={slide.label}
      className="rounded-[22px] border border-neutral-200 bg-white"
    >
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${slide.accentClass}`} />
            <p className="text-[12px] font-extrabold tracking-[-0.01em] text-neutral-950">
              {slide.title}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-baseline justify-end gap-1 text-right">
          <span className="font-neo-heavy text-[26px] leading-none tracking-[-0.05em] text-neutral-950">
            {slide.count}
          </span>
          <span className="text-[11px] font-extrabold text-neutral-400">
            {slide.countLabel}
          </span>
        </div>
      </div>

      <div className="border-b border-neutral-200 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 rounded-[14px] border border-neutral-200 bg-[#f8f7f4] px-3 py-2 text-[11px] font-bold text-neutral-400">
          <Search className="h-3.5 w-3.5" />
          <span className="min-w-0 truncate">
            인플루언서, 계약명, 플랫폼 검색
          </span>
        </div>
      </div>

      <div className="space-y-2.5 bg-[#fbfaf7] p-3 sm:space-y-0 sm:bg-white sm:p-0">
        <div className="hidden grid-cols-[minmax(0,1.55fr)_minmax(0,0.95fr)_104px] gap-3 border-b border-neutral-200 bg-[#fbfaf7] px-4 py-2.5 text-[10px] font-extrabold text-neutral-400 sm:grid sm:px-5">
          <span>계약</span>
          <span>인플루언서</span>
          <span>{slide.dueHeader}</span>
        </div>
        {slide.rows.map((row) => (
          <div
            key={`${slide.label}-${row.partner}-${row.contract}`}
            className="min-w-0 rounded-[8px] border border-neutral-200 bg-white p-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)] sm:grid sm:grid-cols-[minmax(0,1.55fr)_minmax(0,0.95fr)_104px] sm:items-center sm:gap-3 sm:rounded-none sm:border-0 sm:border-b sm:border-neutral-200 sm:px-5 sm:py-3 sm:shadow-none sm:last:border-b-0"
          >
            <div className="sm:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold text-neutral-400">
                    계약
                  </p>
                  <p className="mt-1 truncate text-[14px] font-extrabold tracking-[-0.01em] text-neutral-950">
                    {row.contract}
                  </p>
                  <p className="mt-1 truncate text-[11px] font-bold text-neutral-400">
                    {row.contractType}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-neutral-200 bg-[#f8f7f4] px-2.5 py-1 text-[11px] font-extrabold text-neutral-600">
                  {row.status ?? slide.title}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MobilePreviewMeta label="인플루언서" value={row.partner} />
                <MobilePreviewMeta label="플랫폼" value={row.channel} />
              </div>
              <div className="mt-2">
                <MobilePreviewMeta
                  label="마감/상태"
                  value={`${slide.dueHeader} ${row.due} · ${
                    row.status ?? slide.title
                  }`}
                />
              </div>
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[13px] font-extrabold tracking-[-0.01em] text-neutral-900">
                {row.contract}
              </p>
              <p className="mt-1 truncate text-[11px] font-bold text-neutral-400">
                {row.contractType}
              </p>
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[13px] font-extrabold tracking-[-0.015em] text-neutral-950">
                {row.partner}
              </p>
              <p className="mt-1 truncate text-[11px] font-bold text-neutral-400">
                {row.channel}
              </p>
            </div>
            <div className="hidden min-w-0 sm:block">
              {row.status ? (
                <>
                  <p className="truncate text-[12px] font-extrabold text-neutral-700">
                    {row.status}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-extrabold tabular-nums text-neutral-400">
                    {row.due}
                  </p>
                </>
              ) : (
                <p className="truncate text-[12px] font-extrabold tabular-nums text-neutral-500">
                  {row.due}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvertiserBuilderPreview({
  slide,
}: {
  slide: AdvertiserPreviewBuilderSlide;
}) {
  return (
    <div
      key={slide.label}
      className="overflow-hidden rounded-[22px] border border-neutral-200 bg-white"
    >
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${slide.accentClass}`} />
            <p className="text-[12px] font-extrabold tracking-[-0.01em] text-neutral-950">
              {slide.title}
            </p>
          </div>
          <p className="mt-1 truncate text-[11px] font-bold text-neutral-400">
            조건을 넣으면 초안과 검토 링크까지 정리됩니다
          </p>
        </div>
        <div className="flex shrink-0 items-baseline justify-end gap-1 text-right">
          <span className="font-neo-heavy text-[26px] leading-none tracking-[-0.05em] text-neutral-950">
            {slide.count}
          </span>
          <span className="text-[11px] font-extrabold text-neutral-400">
            {slide.countLabel}
          </span>
        </div>
      </div>

      <div className="bg-[#fbfaf7] p-3 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <div className="min-w-0 rounded-[16px] border border-neutral-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold text-neutral-400">
                  조건 입력
                </p>
                <p className="mt-1 truncate text-[13px] font-extrabold text-neutral-950">
                  조항까지 직접 정리
                </p>
              </div>
              <PenLine className="h-4 w-4 shrink-0 text-blue-600" />
            </div>

            <div className="mt-3 grid gap-2">
              {slide.fields.map((field) => (
                <div
                  key={field.label}
                  className="min-w-0 rounded-[10px] border border-neutral-200 bg-[#f8f7f4] px-3 py-2.5"
                >
                  <p className="text-[10px] font-extrabold text-neutral-400">
                    {field.label}
                  </p>
                  <p className="mt-1 truncate text-[12px] font-extrabold text-neutral-950">
                    {field.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-[12px] border border-dashed border-blue-200 bg-blue-50/50 p-3">
              <p className="text-[10px] font-extrabold text-blue-700">
                추가 조항 입력
              </p>
              <div className="mt-2 space-y-1.5">
                {slide.clauseInputs.map((clause) => (
                  <p
                    key={clause}
                    className="rounded-[8px] bg-white px-2.5 py-2 text-[11px] font-bold leading-4 text-neutral-700"
                  >
                    {clause}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-[16px] border border-neutral-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <div className="border-b border-neutral-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-neutral-400">
                    실시간 계약서
                  </p>
                  <p className="mt-1 truncate text-[14px] font-extrabold text-neutral-950">
                    신제품 언박싱 릴스 계약서
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">
                  자동 반영
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-[#fbfaf7] p-3">
              {slide.contractSummary.map((item) => (
                <div
                  key={item.label}
                  className="min-w-0 rounded-[8px] border border-neutral-200 bg-white px-2.5 py-2"
                >
                  <p className="text-[10px] font-extrabold text-neutral-400">
                    {item.label}
                  </p>
                  <p className="mt-1 truncate text-[11px] font-extrabold text-neutral-900">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2 px-3 pb-3">
              {slide.generatedClauses.map((clause, index) => (
                <div
                  key={clause.title}
                  className="rounded-[12px] border border-neutral-200 bg-white p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-[10px] font-extrabold text-white">
                      {index + 1}
                    </span>
                    <p className="truncate text-[12px] font-extrabold text-neutral-950">
                      {clause.title}
                    </p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] font-bold leading-4 text-neutral-600">
                    {clause.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-[14px] bg-neutral-950 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold text-white/55">
              다음 행동
            </p>
            <p className="mt-1 truncate text-[13px] font-extrabold">
              초안 만들고 검토 링크 보내기
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </div>
      </div>
    </div>
  );
}

function MobilePreviewMeta({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-[6px] bg-[#f8f7f4] px-3 py-2">
      <p className="text-[10px] font-extrabold text-neutral-400">{label}</p>
      <p className="mt-1 truncate text-[12px] font-extrabold tracking-[-0.01em] text-neutral-900">
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 truncate text-[10px] font-bold text-neutral-400">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function LandingHeader() {
  return (
    <header className="border-b border-[#d9e0d9] bg-[#fcfcfa]/95">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between px-5 sm:px-6 lg:px-8">
        <BrandLockup />

        <nav
          aria-label="서비스 메뉴"
          className="flex items-center gap-1 text-[13px] font-semibold"
        >
          <Link
            to="/intro/advertiser"
            className="hidden h-10 items-center rounded-[8px] px-3 text-[#59605b] transition hover:bg-[#eef2ed] hover:text-[#171a17] sm:inline-flex"
          >
            광고주
          </Link>
          <Link
            to="/intro/influencer"
            className="hidden h-10 items-center rounded-[8px] px-3 text-[#59605b] transition hover:bg-[#eef2ed] hover:text-[#171a17] sm:inline-flex"
          >
            인플루언서
          </Link>
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-[8px] border border-[#cfd8d0] bg-white px-3 text-[#303630] transition hover:border-[#7d887f]"
          >
            로그인
          </Link>
        </nav>
      </div>
    </header>
  );
}

function BrandLockup() {
  return (
    <Link
      to="/"
      className="-ml-1 flex min-w-0 items-center gap-3 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171a17]"
      aria-label={`${PRODUCT_NAME} 홈`}
    >
      <BrandLogo />
    </Link>
  );
}

function RoleDashboardPreview({ config }: { config: IntroConfig }) {
  return (
    <section
      aria-label={config.previewTitle}
      className="min-w-0 overflow-hidden rounded-[8px] border border-[#cbd5cc] bg-[#fdfdfb] shadow-[0_22px_60px_rgba(23,26,23,0.12)]"
    >
      <div className="border-b border-[#d9e0d9] bg-white px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#7d857f]">
              계약 운영 화면
            </p>
            <h2 className="mt-1 truncate text-[18px] font-semibold text-[#171a17]">
              {config.previewTitle}
            </h2>
          </div>
          <span
            className={`inline-flex h-8 items-center rounded-[8px] px-3 text-[12px] font-semibold ${config.accentBg} ${config.accentText}`}
          >
            {config.previewBadge}
          </span>
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_190px]">
        <div className="min-w-0 p-4">
          <div className="mb-3 rounded-[8px] border border-[#d9e0d9] bg-[#f8faf7] p-4">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[12px] font-semibold text-[#7d857f]">
                  {config.previewSubtitle}
                </p>
                <p className="mt-1 text-[20px] font-semibold text-[#171a17]">
                  바로 처리할 일
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
                {config.summary.map((item) => (
                  <div key={item.label}>
                    <MiniMetric
                      label={item.label}
                      value={item.value}
                      tone={item.tone}
                      dotClass={item.dotClass}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-t-[8px] border border-b-0 border-[#d9e0d9] bg-white p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 flex-1 items-center gap-2 rounded-[6px] border border-[#d9e0d9] bg-[#f8faf7] px-3 text-[12px] font-semibold text-[#8b938d]">
                <Search className="h-3.5 w-3.5" />
                계약명, 상대방, 플랫폼 검색
              </div>
              <span className="hidden h-9 items-center rounded-[6px] bg-[#171a17] px-3 text-[12px] font-semibold text-white sm:inline-flex">
                전체
              </span>
              <span className="hidden h-9 items-center rounded-[6px] border border-[#d9e0d9] px-3 text-[12px] font-semibold text-[#59605b] sm:inline-flex">
                대기
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-b-[8px] border border-[#d9e0d9] bg-white">
            <div className="hidden grid-cols-[minmax(150px,1fr)_92px_70px_92px] border-b border-[#d9e0d9] bg-[#f8faf7] px-4 py-3 text-[11px] font-semibold text-[#7d857f] lg:grid">
              <span>계약</span>
              <span>상대</span>
              <span>금액</span>
              <span>상태</span>
            </div>
            {config.rows.map((row) => (
              <div
                key={row.title}
                className="grid min-w-0 gap-3 border-b border-[#edf1ed] px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(150px,1fr)_92px_70px_92px] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#171a17]">
                    {row.title}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-[#7d857f]">
                    {row.platform} · {row.due}
                  </p>
                </div>
                <PreviewText label="상대" value={row.party} />
                <PreviewText label="금액" value={row.amount} />
                <span
                  className={`w-fit rounded-[6px] border px-2.5 py-1.5 text-[12px] font-semibold ${row.statusClass}`}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <aside className="border-t border-[#d9e0d9] bg-[#f8faf7] p-4 xl:border-l xl:border-t-0">
          <p className="text-[12px] font-semibold text-[#59605b]">최근 이력</p>
          <div className="mt-4 space-y-4">
            {config.audit.map((item) => (
              <div key={`${item.label}-${item.detail}`} className="flex gap-3">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${config.accentDot}`}
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[#8b938d]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[12px] font-semibold leading-5 text-[#303630]">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[8px] border border-[#d9e0d9] bg-white p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${config.accentText}`} />
              <p className="text-[12px] font-semibold text-[#303630]">
                증빙 흐름 유지
              </p>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[#6f7871]">
              검토, 수정, 서명 기록이 계약별로 연결됩니다.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  tone,
  dotClass,
}: {
  label: string;
  value: string;
  tone: string;
  dotClass: string;
}) {
  return (
    <div className="min-w-0 rounded-[8px] border border-[#d9e0d9] bg-white px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <p className="truncate text-[11px] font-semibold text-[#59605b]">
          {label}
        </p>
      </div>
      <p className={`mt-2 truncate text-[20px] font-semibold ${tone}`}>
        {value}
      </p>
    </div>
  );
}

function PreviewText({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold text-[#9aa29c] lg:hidden">
        {label}
      </p>
      <p className="truncate text-[13px] font-semibold text-[#59605b]">
        {value}
      </p>
    </div>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[#d9e0d9] bg-[#fcfcfa]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-6 text-[12px] font-medium text-[#7d857f] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>{PRODUCT_NAME}</p>
        <nav aria-label="법적 문서" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link className="transition hover:text-[#171a17]" to="/privacy">
            개인정보 처리방침
          </Link>
          <Link className="transition hover:text-[#171a17]" to="/terms">
            이용약관
          </Link>
          <Link
            className="transition hover:text-[#171a17]"
            to="/legal/e-sign-consent"
          >
            전자서명 안내
          </Link>
        </nav>
      </div>
    </footer>
  );
}
