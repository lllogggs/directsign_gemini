import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileSignature,
  FileText,
  LogOut,
  Megaphone,
  MessageSquareText,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  Settings,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { PRODUCT_NAME } from "../../domain/brand";
import type { InfluencerPlatform } from "../../domain/verification";

type IntroRole = "advertiser" | "influencer";

const advertiserProposalAssetUrls = {
  contractBuilder: new URL(
    "../../../docs/sales/assets/yeollock-contract-builder-first-screen.png",
    import.meta.url,
  ).href,
  introContractBuilder: new URL(
    "../../../docs/sales/assets/yeollock-intro-contract-builder-focused.png",
    import.meta.url,
  ).href,
  introContractBuilderMobile: new URL(
    "../../../docs/sales/assets/yeollock-intro-contract-builder-mobile.png",
    import.meta.url,
  ).href,
  introContractShare: new URL(
    "../../../docs/sales/assets/yeollock-intro-contract-share-focused.png",
    import.meta.url,
  ).href,
  influencerContract: new URL(
    "../../../docs/sales/assets/yeollock-influencer-contract.png",
    import.meta.url,
  ).href,
  contractPdfReviewPage: new URL(
    "../../../docs/sales/assets/yeollock-contract-pdf-review-page.png",
    import.meta.url,
  ).href,
  introCampaignApplicants: new URL(
    "../../../docs/sales/assets/yeollock-intro-campaign-applicants-focused.png",
    import.meta.url,
  ).href,
  introContentReview: new URL(
    "../../../docs/sales/assets/yeollock-intro-content-review-focused.png",
    import.meta.url,
  ).href,
  introContentReviewMobile: new URL(
    "../../../docs/sales/assets/yeollock-intro-content-review-mobile.png",
    import.meta.url,
  ).href,
  introCampaignsMobile: new URL(
    "../../../docs/sales/assets/yeollock-intro-campaigns-mobile.png",
    import.meta.url,
  ).href,
  introInfluencerDashboardMobile: new URL(
    "../../../docs/sales/assets/yeollock-intro-influencer-dashboard-mobile.png",
    import.meta.url,
  ).href,
  contractHandshake: new URL(
    "../../../docs/sales/assets/yeollock-contract-handshake.png",
    import.meta.url,
  ).href,
  riskMissedContact: new URL(
    "../../../docs/sales/assets/risk-generated-missed-contact.png",
    import.meta.url,
  ).href,
  riskProductHeld: new URL(
    "../../../docs/sales/assets/risk-generated-product-held.png",
    import.meta.url,
  ).href,
  riskRevisionRefusal: new URL(
    "../../../docs/sales/assets/risk-generated-revision-refusal.png",
    import.meta.url,
  ).href,
  riskGeneralDispute: new URL(
    "../../../docs/sales/assets/risk-generated-general-dispute.png",
    import.meta.url,
  ).href,
};

type RoleCard = {
  role: IntroRole;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  introHref: string;
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
    eyebrow: "계약 링크를 보내고 상태를 확인하는 팀",
    description: "계약별 검토 링크, 수정 요청, 서명, 제출 상태를 봅니다.",
    href: "/login/advertiser",
    introHref: "/intro/advertiser",
  },
  {
    role: "influencer",
    title: "인플루언서",
    eyebrow: "받은 광고 조건을 안전하게 확인하는 크리에이터",
    description:
      `${PRODUCT_NAME} 계약 링크에서 조건을 확인하고 수정 요청과 서명을 진행합니다.`,
    href: "/login/influencer",
    introHref: "/intro/influencer",
  },
];

function getStartRoleTone(role: IntroRole) {
  if (role === "advertiser") {
    return {
      card:
        "border-[#b9d4ff] bg-white text-[#1d4ed8] hover:border-[#2563eb] hover:bg-[#eff6ff]",
      divider: "border-[#bfdbfe]/75",
      detail: "text-[#2563eb]",
    };
  }

  return {
    card:
      "border-[#b8ead2] bg-white text-[#047857] hover:border-[#059669] hover:bg-[#ecfdf5]",
    divider: "border-[#a7f3d0]/75",
    detail: "text-[#059669]",
  };
}

function RoleIconCluster({ role }: { role: IntroRole }) {
  const icons =
    role === "advertiser"
      ? [
          {
            label: "캠페인",
            className: "text-blue-700",
            icon: <Megaphone className="h-6 w-6" strokeWidth={2.15} />,
          },
          {
            label: "계약서",
            className: "text-neutral-700",
            icon: <FileText className="h-6 w-6" strokeWidth={2.15} />,
          },
          {
            label: "서명",
            className: "text-amber-700",
            icon: <FileSignature className="h-6 w-6" strokeWidth={2.15} />,
          },
          {
            label: "검증",
            className: "text-emerald-700",
            icon: <ShieldCheck className="h-6 w-6" strokeWidth={2.15} />,
          },
        ]
      : [
          {
            label: "인스타",
            className: "",
            icon: <PlatformBrandMark platform="instagram" size="md" />,
          },
          {
            label: "유튜브",
            className: "",
            icon: <PlatformBrandMark platform="youtube" size="md" />,
          },
          {
            label: "블로그",
            className: "",
            icon: <PlatformBrandMark platform="naver_blog" size="md" />,
          },
          {
            label: "틱톡",
            className: "",
            icon: <PlatformBrandMark platform="tiktok" size="md" />,
          },
        ];

  return (
    <span
      className="inline-flex h-9 items-center gap-3 border-0 bg-transparent text-neutral-950 shadow-none"
      aria-hidden="true"
    >
      {icons.map((item) => (
        <span
          key={item.label}
          className={`inline-flex h-7 w-7 items-center justify-center border-0 bg-transparent ${item.className}`}
        >
          {item.icon}
        </span>
      ))}
    </span>
  );
}


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

type IntroProposalFact = {
  label: string;
  value: string;
  tone?: "blue" | "red" | "neutral";
};

type IntroProposalRiskItem = {
  label: string;
  imageSrc?: string;
  imageAlt?: string;
};

type IntroProposalSlide = {
  label: string;
  pageNo: string;
  stage: "pain" | "product" | "link" | "facts" | "final";
  context?: ReactNode;
  title: ReactNode;
  description: string;
  support?: ReactNode;
  facts?: IntroProposalFact[];
  imageSrc?: string;
  imageAlt?: string;
  imageFit?: "cover" | "contain";
  riskItems?: IntroProposalRiskItem[];
  visualFacts?: IntroProposalFact[];
  productPreview?:
    | "advertiserBuilder"
    | "advertiserContractReview"
    | "advertiserApplicants"
    | "influencerConditionReview"
    | "influencerCampaignApply"
    | "influencerPdf"
    | "influencerRevision"
    | "influencerDashboard";
};

const preloadedIntroImageSources = new Set<string>();

function collectIntroProposalImageSources(slides: IntroProposalSlide[]) {
  const sources = new Set<string>();

  slides.forEach((slide) => {
    if (slide.imageSrc) sources.add(slide.imageSrc);
    slide.riskItems?.forEach((item) => {
      if (item.imageSrc) sources.add(item.imageSrc);
    });
    if (slide.stage === "link") {
      sources.add(advertiserProposalAssetUrls.introContractShare);
    }
    if (slide.productPreview === "advertiserBuilder") {
      sources.add(advertiserProposalAssetUrls.contractBuilder);
      sources.add(advertiserProposalAssetUrls.introContractBuilder);
      sources.add(advertiserProposalAssetUrls.introContractBuilderMobile);
    }
    if (slide.productPreview === "advertiserContractReview") {
      sources.add(advertiserProposalAssetUrls.introContentReview);
      sources.add(advertiserProposalAssetUrls.introContentReviewMobile);
    }
    if (slide.productPreview === "advertiserApplicants") {
      sources.add(advertiserProposalAssetUrls.introCampaignApplicants);
      sources.add(advertiserProposalAssetUrls.introCampaignsMobile);
    }
    if (slide.productPreview === "influencerDashboard") {
      sources.add(advertiserProposalAssetUrls.introInfluencerDashboardMobile);
    }
  });

  return Array.from(sources);
}

function preloadIntroImages(sources: string[]) {
  if (typeof window === "undefined") return;

  sources.forEach((source) => {
    if (preloadedIntroImageSources.has(source)) return;
    preloadedIntroImageSources.add(source);

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = source;
    document.head.appendChild(link);

    const image = new Image();
    image.decoding = "async";
    image.src = source;
  });
}

const advertiserProposalSlides: IntroProposalSlide[] = [
  {
    label: "문제",
    pageNo: "01",
    stage: "pain",
    context: (
      <>
        인플루언서 광고
      </>
    ),
    title: (
      <>
        <strong className="font-black">계약서</strong>
        <br />
        없는 <strong className="font-black">약속</strong>은
        <br />
        <strong className="font-black text-[#e11d48]">위험</strong>합니다.
      </>
    ),
    description: "",
    riskItems: [
      {
        label: "광고비 먹튀",
        imageSrc: advertiserProposalAssetUrls.riskMissedContact,
        imageAlt: "광고비 선지급 후 연락이 닿지 않는 상황",
      },
      {
        label: "협찬품 미반환",
        imageSrc: advertiserProposalAssetUrls.riskProductHeld,
        imageAlt: "협찬 제품 반환을 꺼리는 상황",
      },
      {
        label: "콘텐츠 수정 거부",
        imageSrc: advertiserProposalAssetUrls.riskRevisionRefusal,
        imageAlt: "콘텐츠 수정 요청이 거부되는 상황",
      },
      {
        label: "각종 분쟁",
        imageSrc: advertiserProposalAssetUrls.riskGeneralDispute,
        imageAlt: "계약 조건이 불분명해 분쟁 중인 상황",
      },
    ],
  },
  {
    label: "작성",
    pageNo: "02",
    stage: "product",
    title: (
      <>
        간편한
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          계약서 작성
        </strong>
      </>
    ),
    description: "간단히 필요 항목만 입력하면 PDF 계약서가 바로 생성됩니다",
    support: (
      <>
        간단히 필요 항목만 입력하면
        <br />
        <span className="whitespace-nowrap">
          <strong>PDF 계약서</strong>가 바로 생성됩니다
        </span>
      </>
    ),
    productPreview: "advertiserBuilder",
  },
  {
    label: "공유",
    pageNo: "03",
    stage: "link",
    title: (
      <>
        계약서
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          링크 공유
        </strong>
      </>
    ),
    description:
      "작성한 계약서를 링크로 전달하면 인플루언서가 확인 후 서명합니다",
    support: (
      <>
        작성한 계약서를 링크로 전달하면
        <br />
        <strong>인플루언서</strong>가 확인 후 <strong>서명</strong>합니다
      </>
    ),
  },
  {
    label: "관리",
    pageNo: "04",
    stage: "product",
    title: (
      <>
        계약 관리를
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          효율적으로
        </strong>
      </>
    ),
    description:
      "진행과정 관리, 플랫폼별 관리, 콘텐츠 확인, 수정요청, 서명 관리",
    support: (
      <>
        진행과정 관리,
        <br />
        플랫폼별 관리
        <br />
        <strong>콘텐츠 확인</strong>
        <br />
        <strong>수정요청</strong>
        <br />
        서명 관리
      </>
    ),
    productPreview: "advertiserContractReview",
  },
  {
    label: "모집",
    pageNo: "05",
    stage: "product",
    title: (
      <>
        캠페인 모집도
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          편리하게!
        </strong>
      </>
    ),
    description:
      "캠페인에 지원한 인플루언서 쉽게 확인, 선정하고 1대多 계약서를 자동 생성합니다",
    support: (
      <span className="support-stack">
        <span>
          캠페인에 지원한
          <br />
          <strong>인플루언서 쉽게 확인, 선정</strong>
        </span>
        <span>
          광고주와 인플루언서간
          <br />
          <strong>1대多 계약서 자동 생성</strong>으로
          <br />
          인플루언서에게 책임감 부여
        </span>
      </span>
    ),
    productPreview: "advertiserApplicants",
  },
  {
    label: "시작",
    pageNo: "06",
    stage: "final",
    title: (
      <>
        서로에게
        <br />
        <strong className="font-black">안전한 광고</strong>
      </>
    ),
    description: "연락미에서 시작하세요",
    support: <strong>연락미에서 시작하세요</strong>,
    imageSrc: advertiserProposalAssetUrls.contractHandshake,
    imageAlt: "광고주와 인플루언서가 계약서 서명 후 악수하는 장면",
    imageFit: "cover",
  },
];

const influencerProposalSlides: IntroProposalSlide[] = [
  {
    label: "조건",
    pageNo: "01",
    stage: "product",
    context: (
      <>
        받은 광고 계약
      </>
    ),
    title: (
      <>
        흩어진 광고 조건은
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          바로 확인
        </strong>
      </>
    ),
    description:
      "메일과 카톡에 흩어진 광고 조건은 금액 확인 누락, 일정 착오, 산출물 불명확, 활용 권한 과다로 이어집니다.",
    support: (
      <>
        메일과 카톡에 흩어진 광고 조건은
        <br />
        <strong>금액 확인 누락</strong>, <strong>일정 착오</strong>
        <br />
        <strong>산출물 불명확</strong>, <strong>활용 권한 과다</strong>로 이어집니다
      </>
    ),
    productPreview: "influencerConditionReview",
  },
  {
    label: "링크",
    pageNo: "02",
    stage: "product",
    title: (
      <>
        계약 링크에서
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          핵심 조건 확인
        </strong>
      </>
    ),
    description:
      "광고주가 보낸 계약 링크를 열면 브랜드, 보상, 마감, 컨텐츠가 먼저 보입니다.",
    support: (
      <>
        광고주가 보낸 계약 링크에서
        <br />
        <strong>브랜드, 보상, 마감, 컨텐츠</strong>를 먼저 확인합니다
      </>
    ),
    imageSrc: advertiserProposalAssetUrls.influencerContract,
    imageAlt: "인플루언서 계약서 링크 확인 화면",
    imageFit: "contain",
  },
  {
    label: "원문",
    pageNo: "03",
    stage: "facts",
    title: (
      <>
        PDF 계약서
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          원문 확인
        </strong>
      </>
    ),
    description:
      "요약만 보고 넘기지 않고 광고주가 작성한 PDF 계약서를 확인한 뒤 서명합니다.",
    support: (
      <>
        요약만 보고 넘기지 않고
        <br />
        <strong>광고주가 작성한 계약서 원문</strong>을 확인합니다
      </>
    ),
    productPreview: "influencerPdf",
  },
  {
    label: "요청",
    pageNo: "04",
    stage: "facts",
    title: (
      <>
        수정할 조항은
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          간편하게 조정 요청
        </strong>
      </>
    ),
    description:
      "바꿀 조항을 선택하고 요청 내용을 명확하게 남깁니다.",
    support: (
      <>
        바꿀 조항을 선택하고
        <br />
        <strong>요청 내용</strong>을 명확하게 남깁니다
      </>
    ),
    productPreview: "influencerRevision",
  },
  {
    label: "보관",
    pageNo: "05",
    stage: "facts",
    title: (
      <>
        계약별
        <br />
        할 일을
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          한눈에 관리
        </strong>
      </>
    ),
    description:
      "지원, 진행, 완료, 미선정 상태를 분리해 다음에 해야 할 일을 바로 확인합니다.",
    support: (
      <>
        받은 계약과 서명 완료본을 계약별로 보관하고
        <br />
        다음 할 일을 바로 확인합니다
      </>
    ),
    productPreview: "influencerDashboard",
  },
  {
    label: "신청",
    pageNo: "06",
    stage: "product",
    title: (
      <>
        간편한
        <br />
        <strong className="inline-block bg-gradient-to-br from-[#1d4ed8] to-[#2f6df6] bg-clip-text font-black text-transparent">
          캠페인 신청
        </strong>
      </>
    ),
    description: "조건을 확인하고 필요한 계정으로 바로 지원합니다.",
    support: (
      <>
        조건을 확인한 뒤
        <br />
        <strong>인증된 계정</strong>으로 바로 지원합니다
      </>
    ),
    productPreview: "influencerCampaignApply",
  },
  {
    label: "시작",
    pageNo: "07",
    stage: "final",
    title: (
      <>
        안전하고
        <br />
        간편한
        <br />
        <strong className="font-black">광고 참여</strong>
      </>
    ),
    description: "계약 확인부터 캠페인 신청까지 연락미에서 시작하세요",
    support: <strong>계약 확인부터 캠페인 신청까지</strong>,
    imageSrc: advertiserProposalAssetUrls.contractHandshake,
    imageAlt: "계약서 서명 후 광고주와 인플루언서가 악수하는 장면",
    imageFit: "cover",
  },
];

const roleIntroSlides = {
  advertiser: [
    {
      label: "초안 작성",
      eyebrow: "계약 시작",
      title: ["DM 합의를", "계약서 초안으로"],
      description:
        "브랜드, 보상, 일정, 산출물을 입력하면 광고 조건이 계약서 초안으로 정리됩니다.",
      helper: "조건 입력만으로 초안 생성",
      primaryLabel: "시작하기",
      primaryHref: "/signup/advertiser",
      secondaryLabel: "광고주 로그인",
      secondaryHref: "/login/advertiser",
      icon: ClipboardCheck,
      accentClass: "bg-neutral-950",
      iconClass: "text-neutral-950",
      cardClass: "border-neutral-300 bg-white",
      preview: {
        kind: "proposal",
        header: "광고 계약 시작",
        targetLabel: "상대",
        targetName: "소라핏 · Instagram",
        fields: [
          { label: "진행 단계", value: "조건 확인" },
          { label: "계약명", value: "러닝 챌린지 릴스" },
          { label: "금액", value: "320만원" },
          { label: "업로드", value: "2026.06.12" },
        ],
        chips: ["조건 확인", "유료 광고(PPL)", "릴스 1건"],
        message:
          `상대방, 금액, 일정, 산출물을 입력하면 ${PRODUCT_NAME} 계약 초안으로 이어집니다.`,
        timeline: ["상대 정보 입력", "조건 정리", "검토 링크", "전자서명"],
        actionLabel: "시작하기",
      },
    },
    {
      label: "검토 링크",
      eyebrow: "링크 발송",
      title: ["작성한 계약을", "검토 링크로 발송"],
      description:
        "초안을 인플루언서가 바로 열어볼 수 있는 검토 링크로 보내고 진행 상태를 확인합니다.",
      helper: "계약서 작성 후 링크 발송",
      primaryLabel: "시작하기",
      primaryHref: "/signup/advertiser",
      secondaryLabel: "광고주 로그인",
      secondaryHref: "/login/advertiser",
      icon: FileText,
      accentClass: "bg-blue-600",
      iconClass: "text-blue-700",
      cardClass: "border-blue-200 bg-blue-50/55",
      preview: {
        kind: "proposal",
        header: "계약 조건 정리",
        targetLabel: "계약 대상",
        targetName: "소라핏 · Instagram/TikTok",
        fields: [
          { label: "계약명", value: "러닝 챌린지 릴스 계약" },
          { label: "플랫폼", value: "Instagram · TikTok" },
          { label: "금액", value: "320만원" },
          { label: "기간", value: "2026.06.01-06.20" },
        ],
        chips: ["유료 광고(PPL)", "릴스 1건", "스토리 2건"],
        message:
          "광고 표시, 업로드 일정, 검수 기준, 2차 활용 여부를 계약서 조항으로 정리합니다.",
        timeline: ["조건 입력", "조항 확인", "PDF 초안", "검토 링크"],
        actionLabel: "시작하기",
      },
    },
    {
      label: "수정 기록",
      eyebrow: "검토·수정",
      title: ["검토 링크로", "수정까지 한곳에서"],
      description:
        "작성한 계약서를 링크로 보내고, 인플루언서의 질문과 수정 요청, 광고주의 답변을 계약 이력에 남깁니다.",
      helper: "조항별 요청과 답변 보관",
      primaryLabel: "시작하기",
      primaryHref: "/signup/advertiser",
      secondaryLabel: "광고주 로그인",
      secondaryHref: "/login/advertiser",
      icon: MessageSquareText,
      accentClass: "bg-emerald-600",
      iconClass: "text-emerald-700",
      cardClass: "border-emerald-200 bg-emerald-50/60",
      preview: {
        kind: "proposal",
        header: "검토 링크 발송",
        targetLabel: "받는 사람",
        targetName: "소라핏 · 웰니스 크리에이터",
        fields: [
          { label: "링크 상태", value: "열람 가능" },
          { label: "수정 요청", value: "2차 활용 기간" },
          { label: "답변 기한", value: "오늘 18:00" },
          { label: "최종본", value: "승인 전" },
        ],
        chips: ["조항별 의견", "답변 기록", "최종본 승인"],
        message:
          "수정 요청은 계약서 안에 남기고, 광고주 답변 뒤 최종본을 다시 승인받아 서명 단계로 넘깁니다.",
        timeline: ["링크 열람", "수정 요청", "광고주 답변", "최종 승인"],
        actionLabel: "시작하기",
      },
    },
    {
      label: "서명 증빙",
      eyebrow: "서명·증빙",
      title: ["서명 완료와", "증빙 보관"],
      description:
        "최종본 서명, 동의 시각, 서명 PDF, 이후 제출 상태를 계약별로 모아 문제가 생겨도 확인할 수 있게 둡니다.",
      helper: "최종본과 PDF 증빙 확인",
      primaryLabel: "시작하기",
      primaryHref: "/signup/advertiser",
      secondaryLabel: "광고주 로그인",
      secondaryHref: "/login/advertiser",
      icon: FileSignature,
      accentClass: "bg-amber-500",
      iconClass: "text-amber-700",
      cardClass: "border-amber-200 bg-amber-50/70",
      preview: {
        kind: "contract",
        header: "계약 증빙 대시보드",
        count: "4",
        countLabel: "진행",
        rows: [
          {
            name: "소라핏",
            title: "러닝 챌린지 릴스 계약",
            status: "검토 링크 발송",
            statusClass: "bg-blue-50 text-blue-700",
            due: "오늘 18:00",
          },
          {
            name: "오늘의 주방",
            title: "주방가전 리뷰 컨텐츠",
            status: "수정 요청",
            statusClass: "bg-amber-50 text-amber-800",
            due: "오늘 답변",
          },
          {
            name: "민서홈",
            title: "홈카페 공동구매",
            status: "서명 완료",
            statusClass: "bg-emerald-50 text-emerald-700",
            due: "완료",
          },
        ],
        nextAction: "시작하기",
      },
    },
  ],
  influencer: [
    {
      label: "계약 확인",
      eyebrow: "계약 수신",
      title: ["광고 조건을", "놓치지 않게"],
      description:
        "메일함을 뒤지지 않고 금액, 일정, 산출물, 사용 권한을 먼저 확인합니다.",
      helper: "메일 대신 조건과 기록 정리",
      primaryLabel: "시작하기",
      primaryHref: "/signup/influencer",
      secondaryLabel: "인플루언서 로그인",
      secondaryHref: "/login/influencer",
      icon: ClipboardCheck,
      accentClass: "bg-neutral-950",
      iconClass: "text-neutral-950",
      cardClass: "border-neutral-300 bg-white",
      preview: {
        kind: "proposal",
        header: "브랜드 초대 도착",
        targetLabel: "보낸 브랜드",
        targetName: "브레드룸 · 홈카페 식품",
        fields: [
          { label: "요청 내용", value: "광고 조건 검토" },
          { label: "계약 형태", value: "공동구매" },
          { label: "지급", value: "판매 수수료 18%" },
          { label: "업로드", value: "제품 수령 후 7일" },
        ],
        chips: ["계약 링크", "검토 필요", "서명 전"],
        message:
          "계약 링크 안에서 조건, 산출물, 사용 권한을 먼저 확인합니다.",
        timeline: ["링크 열람", "조건 확인", "수정 요청", "전자서명"],
        actionLabel: "시작하기",
      },
    },
    {
      label: "조건 확인",
      eyebrow: "조건 검토",
      title: ["돈, 일정, 권한을", "서명 전에 확인"],
      description:
        "금액, 컨텐츠 제출 일정, 검수 기준, 광고 표시, 컨텐츠 사용 권한처럼 나중에 문제가 되는 조건을 먼저 봅니다.",
      helper: "숨은 조건을 서명 전 확인",
      primaryLabel: "시작하기",
      primaryHref: "/signup/influencer",
      secondaryLabel: "인플루언서 로그인",
      secondaryHref: "/login/influencer",
      icon: FileText,
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
          "광고주가 입력한 조건을 먼저 확인하고 빠진 산출물, 지급 조건, 사용 권한을 체크합니다.",
        timeline: ["조건 확인", "질문 작성", "수정 요청", "전자서명"],
        actionLabel: "시작하기",
      },
    },
    {
      label: "수정 요청",
      eyebrow: "수정 요청",
      title: ["불리한 조항은", "서명 전에 요청"],
      description:
        "애매한 문구나 불리한 조항은 계약서 안에서 바로 이유를 남기고, 광고주의 답변을 같은 화면에서 기다립니다.",
      helper: "불리한 조항은 바로 요청",
      primaryLabel: "시작하기",
      primaryHref: "/signup/influencer",
      secondaryLabel: "인플루언서 로그인",
      secondaryHref: "/login/influencer",
      icon: MessageSquareText,
      accentClass: "bg-emerald-600",
      iconClass: "text-emerald-700",
      cardClass: "border-emerald-200 bg-emerald-50/60",
      preview: {
        kind: "proposal",
        header: "조항별 수정 요청",
        targetLabel: "제안 브랜드",
        targetName: "브레드룸 · 홈카페 식품",
        fields: [
          { label: "문제 조항", value: "2차 활용 기간" },
          { label: "요청 내용", value: "12개월 -> 3개월" },
          { label: "답변 상태", value: "광고주 확인 중" },
          { label: "서명 상태", value: "대기" },
        ],
        chips: ["요청 사유 기록", "답변 대기", "서명 전 확인"],
        message:
          "활용 기간이 길면 나중에 광고 소재로 계속 쓰일 수 있어요. 기간을 줄이거나 추가 활용 동의를 별도로 받도록 요청합니다.",
        timeline: ["조항 선택", "요청 사유 작성", "광고주 답변", "최종본 확인"],
        actionLabel: "시작하기",
      },
    },
    {
      label: "완료 보관",
      eyebrow: "서명·보관",
      title: ["동의한 계약만", "서명하고 보관"],
      description:
        "최종 조건에 동의한 뒤 전자서명하고, 완료 계약과 제출 상태를 보관해 이후 분쟁이나 확인 요청에 대비합니다.",
      helper: "서명 완료본과 제출 상태 보관",
      primaryLabel: "시작하기",
      primaryHref: "/signup/influencer",
      secondaryLabel: "인플루언서 로그인",
      secondaryHref: "/login/influencer",
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
            due: "서명 가능",
          },
          {
            name: "누디브랜딩",
            title: "뷰티 릴스 패키지",
            status: "제출 대기",
            statusClass: "bg-emerald-50 text-emerald-700",
            due: "제출 대기",
          },
        ],
        nextAction: "시작하기",
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
      { label: "계약명", value: "신제품 언박싱 계약" },
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
      "컨텐츠는 업로드 후 3개월 동안 브랜드 채널에서 활용",
      "릴스 1건, 스토리 2건 업로드 후 초안 검수 1회",
    ],
    generatedClauses: [
      {
        title: "산출물 및 일정",
        text: "인플루언서는 릴스 1건과 스토리 2건을 6월 12일 18:00까지 업로드합니다.",
      },
      {
        title: "컨텐츠 활용 범위",
        text: "브랜드는 업로드 컨텐츠를 브랜드 공식 채널에서 3개월 동안 활용할 수 있습니다.",
      },
      {
        title: "광고 표시",
        text: "컨텐츠에는 협찬 및 광고 표시 문구를 플랫폼 정책에 맞게 포함합니다.",
      },
    ],
  },
  {
    kind: "list",
    label: "수정",
    title: "수정 요청",
    count: "1",
    countLabel: "건",
    dueHeader: "상태",
    accentClass: "bg-amber-500",
    rows: [
      {
        partner: "오브제스튜디오",
        contract: "2차 컨텐츠 사용 범위",
        contractType: "유료 광고 (PPL)",
        channel: "유튜브",
        due: "확인 필요",
      },
      {
        partner: "박도윤",
        contract: "업로드 일정 조정",
        contractType: "제품 협찬",
        channel: "유튜브",
        due: "일정 협의",
      },
      {
        partner: "스튜디오 문",
        contract: "제품 제공 조건",
        contractType: "제품 협찬",
        channel: "블로그",
        due: "조건 확인",
      },
    ],
  },
  {
    kind: "list",
    label: "서명",
    title: "서명 대기",
    count: "4",
    countLabel: "건",
    dueHeader: "상태",
    accentClass: "bg-blue-600",
    rows: [
      {
        partner: "모노트립",
        contract: "카페 팝업 방문 영상",
        contractType: "제품 협찬",
        channel: "유튜브",
        due: "서명 준비",
      },
      {
        partner: "윤서랩",
        contract: "신제품 언박싱 릴스",
        contractType: "공동구매",
        channel: "인스타",
        due: "최종 확인",
      },
      {
        partner: "채널오브",
        contract: "브랜드 숏폼 패키지",
        contractType: "유료 광고 (PPL)",
        channel: "유튜브",
        due: "서명 요청",
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
        channel: "인스타",
        due: "업로드 예정",
      },
      {
        partner: "오브제스튜디오",
        contract: "브랜드 인터뷰 영상",
        contractType: "제품 협찬",
        channel: "유튜브",
        due: "일정 확정",
      },
      {
        partner: "민채널",
        contract: "월간 리뷰 컨텐츠",
        contractType: "제품 협찬",
        channel: "블로그",
        due: "보관 완료",
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
        title: "지급 조건",
        text: "공동구매 대가와 지급 시점은 계약서에서 확정합니다.",
        status: "승인 가능",
      },
      {
        title: "2차 컨텐츠 활용",
        text: "브랜드는 업로드 컨텐츠를 광고 소재로 12개월 동안 활용할 수 있습니다.",
        status: "수정 필요",
        active: true,
      },
      {
        title: "광고 표시",
        text: "컨텐츠에는 협찬 및 공동구매 안내 문구를 플랫폼 정책에 맞게 표시합니다.",
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
      { label: "전체", active: true },
      { label: "인스타" },
      { label: "유튜브" },
    ],
    items: [
      {
        brand: "모노트립",
        contract: "제품 협찬",
        platform: "인스타",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "오늘 확인",
      },
      {
        brand: "오브제스튜디오",
        contract: "유료 광고 (PPL)",
        platform: "유튜브",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "검토 필요",
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
      { label: "전체" },
      { label: "유튜브", active: true },
      { label: "블로그" },
    ],
    items: [
      {
        brand: "채널오브",
        contract: "유료 광고 (PPL)",
        platform: "유튜브",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "서명 대기",
      },
      {
        brand: "민채널",
        contract: "제품 협찬",
        platform: "블로그",
        accountName: "민서홈",
        accountId: "minseo.home",
        due: "서명 확인",
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
      { label: "전체", active: true },
      { label: "인스타" },
      { label: "유튜브" },
      { label: "블로그" },
    ],
    items: [
      {
        brand: "한서진",
        contract: "제품 협찬",
        platform: "인스타",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "업로드 예정",
      },
      {
        brand: "오브제스튜디오",
        contract: "유료 광고 (PPL)",
        platform: "유튜브",
        accountName: "민서홈",
        accountId: "@minseo.home",
        due: "일정 확정",
      },
    ],
  },
];

export function StartPage() {
  const [showIntroRolePicker, setShowIntroRolePicker] = useState(false);

  useEffect(() => {
    if (!showIntroRolePicker) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowIntroRolePicker(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showIntroRolePicker]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f6f3] font-sans text-neutral-950">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[32svh] border-t border-neutral-200/60 bg-[#eef0ec]"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid min-h-screen w-full max-w-[1500px] content-start grid-rows-[60px_auto_44px] px-5 sm:content-normal sm:grid-rows-[68px_minmax(0,1fr)_58px] sm:px-6 lg:grid-rows-[72px_minmax(0,1fr)_60px]">
        <header className="flex items-start justify-between gap-3 pt-2">
          <Link
            to="/"
            className="yl-brand-action -ml-1 flex min-w-0 items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            aria-label={`${PRODUCT_NAME} 홈`}
          >
            <BrandLogo />
          </Link>
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              to="/login"
              className="yl-secondary-action inline-flex min-h-10 shrink-0 items-center rounded-[8px] border px-3 text-[11px] font-bold text-neutral-500 transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              로그인
            </Link>
          </div>
        </header>

        <section className="flex min-h-0 items-start justify-center pb-8 pt-[clamp(46px,8svh,68px)] sm:pt-[clamp(60px,9svh,90px)] lg:pt-[clamp(70px,10svh,112px)]">
          <div className="w-full max-w-[820px]">
            <h1
              className="landing-start-title font-neo-heavy mb-0 text-center text-[30px] leading-[1.1] tracking-normal text-neutral-950 sm:text-[42px] sm:leading-[1.05]"
              aria-label="광고 계약은 확실하게"
            >
              <span className="landing-start-copy-line landing-start-copy-line-1 block">
                광고 계약은
              </span>
              <span className="landing-start-copy-line landing-start-copy-line-2 mt-2 block sm:mt-3">
                확실하게
              </span>
            </h1>
            <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-4">
              {roleCards.map((role) => {
                const tone = getStartRoleTone(role.role);
                const isAdvertiser = role.role === "advertiser";
                const detail = isAdvertiser
                  ? "브랜드 · 광고대행사 · 쇼핑몰 · 로컬매장"
                  : "크리에이터 · 유튜버 · 틱톡커 · 블로거 · 스트리머";

                return (
                  <Link
                    key={role.role}
                    to={role.href}
                    aria-label={`${role.title} 로그인`}
                    data-start-role-action={role.role}
                    className={`yl-card group flex min-h-[184px] flex-col border px-5 pb-4 pt-6 text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950 sm:min-h-[224px] sm:px-7 sm:pb-5 sm:pt-8 lg:min-h-[248px] ${tone.card}`}
                  >
                    <span className="flex min-w-0 items-center justify-between gap-3">
                      <RoleIconCluster role={role.role} />
                    </span>
                    <span className="mt-auto block min-w-0">
                      <strong className="font-neo-heavy block text-[36px] leading-none tracking-normal text-neutral-950 sm:text-[47px]">
                        {role.title}
                      </strong>
                      <span
                        className={`mt-3 block border-t pt-3 text-[12px] font-bold leading-none tracking-normal text-neutral-500 sm:mt-3.5 sm:pt-3.5 ${tone.divider}`}
                      >
                        {detail}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <button
              type="button"
              data-start-intro-picker-trigger
              onClick={() => setShowIntroRolePicker(true)}
              className="mx-auto mt-5 flex w-fit items-center justify-center px-1 py-1 text-[13px] font-black text-neutral-400 transition hover:text-neutral-700 focus-visible:rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-950 sm:mt-6"
            >
              처음이라면 소개 보기 →
            </button>
          </div>
        </section>

        <footer className="flex items-center justify-center gap-5 text-[11px] font-semibold text-neutral-400">
          <Link className="transition hover:text-neutral-950" to="/privacy">
            개인정보
          </Link>
          <Link className="transition hover:text-neutral-950" to="/terms">
            이용약관
          </Link>
          <Link
            className="transition hover:text-neutral-950"
              to="/resources"
          >
            계약 가이드
          </Link>
          <Link className="transition hover:text-neutral-950" to="/support">
            문의
          </Link>
        </footer>
      </div>
      {showIntroRolePicker ? (
        <StartIntroRolePicker onClose={() => setShowIntroRolePicker(false)} />
      ) : null}
    </main>
  );
}

function StartIntroRolePicker({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/24 px-5 backdrop-blur-[1px]"
      onClick={onClose}
      style={{ animation: "introFinalDimIn 180ms ease-out both" }}
    >
      <style>
        {`@keyframes introFinalDimIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes introFinalDialogIn { from { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }`}
      </style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="역할 선택"
        className="grid w-full max-w-[360px] gap-3 rounded-[18px] border border-white/75 bg-white/96 p-4 text-left shadow-[0_28px_74px_rgba(15,23,42,0.25)] sm:p-5"
        onClick={(event) => event.stopPropagation()}
        style={{ animation: "introFinalDialogIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-extrabold text-neutral-500">
              처음이라면
            </p>
            <h2 className="mt-1 text-[20px] font-black leading-tight text-neutral-950">
              역할 선택
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 shrink-0 items-center rounded-[8px] border border-neutral-200 px-3 text-[11px] font-black text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          >
            닫기
          </button>
        </div>
        <div className="grid gap-2 pt-1">
          {roleCards.map((role) => {
            const isAdvertiser = role.role === "advertiser";

            return (
              <Link
                key={role.role}
                to={role.introHref}
                className="group grid min-h-[74px] grid-cols-[1fr_auto] items-center gap-3 rounded-[12px] border border-neutral-200 bg-white px-4 py-3 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-950"
              >
                <span className="min-w-0">
                  <strong className="block text-[17px] font-black text-neutral-950">
                    {role.title}
                  </strong>
                  <span className="mt-1 block truncate text-[11px] font-bold text-neutral-500">
                    {isAdvertiser
                      ? "광고 조건과 계약 운영 흐름"
                      : "받은 계약과 캠페인 참여 흐름"}
                  </span>
                </span>
                <span className="text-[18px] font-black text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-950">
                  →
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RoleIntroPage({ role }: { role: IntroRole }) {
  return (
    <RoleFeatureIntroScreen
      role={role}
      slides={roleIntroSlides[role]}
    />
  );
}

function RoleFeatureIntroScreen({
  role,
}: {
  role: IntroRole;
  slides: RoleIntroSlide[];
}) {
  const startHref = role === "advertiser" ? "/signup/advertiser" : "/signup/influencer";

  return (
    <main className="min-h-svh overflow-x-hidden bg-[#e9ede8] font-sans text-neutral-950 lg:h-svh lg:overflow-hidden">
      <header className="border-b border-neutral-200/70 bg-white/92">
        <div className="mx-auto flex h-[58px] max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-6">
          <BrandLockup />
          <div className="flex min-w-0 items-center">
            <Link
              to={startHref}
              className="inline-flex h-9 w-[104px] shrink-0 items-center justify-center rounded-[8px] bg-blue-600 px-3 text-[12px] font-extrabold text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)] ring-1 ring-blue-500/20 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-blue-700"
            >
              시작하기
            </Link>
          </div>
        </div>
      </header>
      <section className="mx-auto flex min-h-[calc(100svh-60px)] w-full max-w-[1500px] items-start justify-center px-4 py-1.5 pb-1.5 sm:min-h-[calc(100svh-58px)] sm:items-center sm:px-6 sm:py-5 lg:h-[calc(100vh-58px)] lg:min-h-0 lg:overflow-hidden">
        <ProposalIntroCarousel
          role={role}
          ariaLabel={
            role === "advertiser"
              ? "광고주 PDF 제안서형 인트로 슬라이드"
              : "인플루언서 PDF 제안서형 인트로 슬라이드"
          }
          controlLabel="제안서 화면"
          slides={
            role === "advertiser" ? advertiserProposalSlides : influencerProposalSlides
          }
        />
      </section>
    </main>
  );
}

function RoleFeaturePreviewRotator({
  slides,
  previewIndex,
  role,
  className = "",
}: {
  slides: RoleIntroSlide[];
  previewIndex: number;
  role: IntroRole;
  className?: string;
}) {
  const [displayIndex, setDisplayIndex] = useState(previewIndex);
  const [isFading, setIsFading] = useState(false);
  const displayIndexRef = useRef(previewIndex);
  const transitionTimers = useRef<number[]>([]);
  const activeSlide = slides[displayIndex] ?? slides[0];

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

  useEffect(() => {
    if (displayIndexRef.current === previewIndex) {
      return undefined;
    }

    clearTransitionTimers();

    const commitDisplayIndex = () => {
      displayIndexRef.current = previewIndex;
      setDisplayIndex(previewIndex);
    };

    if (prefersReducedMotion()) {
      transitionTimers.current = [
        window.setTimeout(() => {
          commitDisplayIndex();
          setIsFading(false);
          transitionTimers.current = [];
        }, 0),
      ];
      return undefined;
    }

    transitionTimers.current = [
      window.setTimeout(() => setIsFading(true), 0),
      window.setTimeout(commitDisplayIndex, 160),
      window.setTimeout(() => {
        setIsFading(false);
        transitionTimers.current = [];
      }, 340),
    ];

    return clearTransitionTimers;
  }, [
    clearTransitionTimers,
    prefersReducedMotion,
    previewIndex,
  ]);

  useEffect(() => clearTransitionTimers, [clearTransitionTimers]);

  return (
    <section
      aria-label="기능별 화면 미리보기"
      className={`${className} mx-auto flex min-h-[420px] w-full min-w-0 flex-1 max-w-[calc(100vw-40px)] flex-col overflow-visible sm:min-h-[500px] sm:max-w-full lg:h-full lg:min-h-0 lg:max-w-[980px] lg:justify-self-end lg:overflow-hidden`}
    >
      <div className="relative min-h-[420px] flex-1 overflow-visible sm:min-h-[500px] lg:h-full lg:min-h-0 lg:overflow-hidden">
        <div
          className={`h-auto transition duration-300 ease-out lg:h-full ${
            isFading ? "translate-x-4 opacity-0" : "translate-x-0 opacity-100"
          }`}
        >
          <RolePreviewSlideView
            panelId={`role-preview-panel-${previewIndex}`}
            role={role}
            slide={activeSlide}
          />
        </div>
      </div>
    </section>
  );
}

void RoleFeaturePreviewRotator;

function ProposalIntroCarousel({
  role,
  ariaLabel,
  controlLabel,
  slides,
}: {
  role: IntroRole;
  ariaLabel: string;
  controlLabel: string;
  slides: IntroProposalSlide[];
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const activeSlide = slides[slideIndex] ?? slides[0];
  const slidePanelId = `intro-proposal-slide-${slideIndex}`;

  useEffect(() => {
    preloadIntroImages(collectIntroProposalImageSources(slides));
  }, [slides]);

  const showPrevious = useCallback(() => {
    setSlideIndex((currentIndex) =>
      currentIndex === 0 ? slides.length - 1 : currentIndex - 1,
    );
  }, [slides.length]);

  const showNext = useCallback(() => {
    setSlideIndex((currentIndex) => (currentIndex + 1) % slides.length);
  }, [slides.length]);

  return (
    <section
      aria-label={ariaLabel}
      data-intro-pdf-carousel
      className="mx-auto flex w-full min-w-0 justify-center"
    >
      <div className="relative flex w-full min-w-0 max-w-[1280px] flex-col items-center">
        <div
          id={slidePanelId}
          role="group"
          aria-roledescription="slide"
          aria-label={`${slideIndex + 1} / ${slides.length} ${activeSlide.label}`}
          aria-live="polite"
          data-intro-pdf-slide
          className="relative isolate flex h-[calc(100svh-120px)] min-h-0 w-full flex-col overflow-hidden px-0 py-0 sm:h-auto sm:overflow-visible sm:px-2 lg:h-[min(690px,calc(100vh-150px))]"
        >
          <ProposalSlideView role={role} slide={activeSlide} />

          <span className="z-10 mt-2 hidden self-end text-[10px] font-bold tabular-nums leading-none tracking-normal text-[#88918b] sm:mt-3 sm:block lg:absolute lg:bottom-0 lg:right-2 lg:mt-0">
            {activeSlide.pageNo}
          </span>
        </div>

        <div
          data-intro-carousel-controls
          className="z-20 mt-2 flex w-full items-center justify-center sm:mt-3"
        >
          <div className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-neutral-200/75 bg-white/80 px-1.5 shadow-[0_14px_34px_rgba(15,23,42,0.12)] backdrop-blur">
            <button
              type="button"
              aria-label={`이전 ${controlLabel}`}
              aria-controls={slidePanelId}
              title={`이전 ${controlLabel}`}
              onClick={showPrevious}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} />
            </button>
            <div className="flex h-8 items-center justify-center gap-2 px-1.5">
              {slides.map((slide, index) => {
                const selected = index === slideIndex;

                return (
                  <button
                    key={slide.label}
                    type="button"
                    aria-label={`${index + 1}번째 ${controlLabel} 보기`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => setSlideIndex(index)}
                    className={`h-2 rounded-full transition ${
                      selected
                        ? "w-6 bg-neutral-950"
                        : "w-2 bg-neutral-300 hover:bg-neutral-500"
                    }`}
                  />
                );
              })}
            </div>
            <button
              type="button"
              aria-label={`다음 ${controlLabel}`}
              aria-controls={slidePanelId}
              title={`다음 ${controlLabel}`}
              onClick={showNext}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProposalSlideView({
  role,
  slide,
}: {
  role: IntroRole;
  slide: IntroProposalSlide;
}) {
  const desktopSupport = slide.support || slide.description;

  return (
    <div
      className="relative z-10 grid h-full min-h-0 flex-1 grid-rows-[144px_minmax(0,1fr)] gap-1 pb-0 pt-0 sm:h-auto sm:grid-rows-none sm:grid-cols-[minmax(220px,0.32fr)_minmax(0,0.68fr)] sm:items-center sm:gap-[clamp(30px,3.6vw,52px)] lg:h-full"
    >
        <div
          data-intro-copy
          className="mx-auto flex h-full min-h-0 w-full max-w-[330px] flex-col items-center justify-center px-2 text-center sm:mx-0 sm:max-w-none sm:items-start sm:px-0 sm:pl-[clamp(8px,2.2vw,34px)] sm:text-left"
        >
          <div className="mx-auto min-w-0 text-center sm:mx-0 sm:text-left">
            {slide.context ? (
              <p className="mx-auto mb-2 inline-flex max-w-[260px] items-center justify-center rounded-full border border-blue-200/70 bg-white/75 px-2.5 py-1 text-center text-[11px] font-black leading-none tracking-normal text-blue-700 shadow-[0_10px_24px_rgba(37,99,235,0.08)] sm:mx-0 sm:mb-3 sm:max-w-none sm:justify-start sm:px-3 sm:text-left sm:text-[12px]">
                {slide.context}
              </p>
            ) : null}
            <h2
              className="mx-auto max-w-[310px] break-keep text-center font-neo-heavy text-[24px] leading-[1.06] tracking-normal text-neutral-950 sm:mx-0 sm:max-w-none sm:text-left sm:text-[clamp(38px,4.15vw,48px)] sm:leading-[1.07]"
            >
              {slide.title}
            </h2>
          </div>
          {desktopSupport ? (
            <div className="hidden sm:mx-0 sm:mt-5 sm:block sm:min-h-[72px] sm:max-w-[380px] sm:break-keep sm:border-l-[3px] sm:border-blue-600/20 sm:pl-3.5 sm:text-left sm:text-[clamp(15px,1.35vw,17px)] sm:font-normal sm:leading-[1.45] sm:tracking-normal sm:text-[#58625c] sm:[&_.support-stack]:grid sm:[&_.support-stack]:gap-3 [&_strong]:font-black [&_strong]:text-blue-600">
              {desktopSupport}
            </div>
          ) : null}
        </div>

        <ProposalVisual slide={slide} />
        {slide.stage === "final" ? <IntroFinalStartModal role={role} /> : null}
      </div>
  );
}

const introVisualFrameClass =
  "h-full min-h-0 w-full overflow-hidden rounded-[16px] bg-[#e9ede8]";

function ProposalVisual({ slide }: { slide: IntroProposalSlide }) {
  if (slide.stage === "link") {
    return (
      <div data-intro-visual className={introVisualFrameClass}>
        <AdvertiserMobileLinkPreview />
        <IntroDesktopServiceCapture
          desktopOnly
          imageAlt="실제 광고주 계약서 공유 링크 생성 화면"
          imageSrc={advertiserProposalAssetUrls.introContractShare}
          imageClassName="object-contain object-center"
        />
      </div>
    );
  }

  if (slide.riskItems) {
    return (
      <div data-intro-visual className={`${introVisualFrameClass} grid grid-cols-2 grid-rows-2 gap-2 sm:grid-cols-4 sm:grid-rows-none sm:content-center sm:gap-2.5 sm:bg-transparent`}>
        {slide.riskItems.map((item, index) => (
          <article
            key={item.label}
            className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-[#e1e7e2] bg-white shadow-[0_14px_28px_rgba(15,23,42,0.055)] sm:rounded-[16px] sm:shadow-[0_18px_34px_rgba(15,23,42,0.06)]"
          >
            {item.imageSrc ? (
              <>
                <img
                  src={item.imageSrc}
                  alt={item.imageAlt ?? ""}
                  className="min-h-0 w-full flex-1 object-cover object-center sm:h-auto"
                  loading="eager"
                />
                <p className="flex min-h-[42px] items-center justify-center bg-[linear-gradient(180deg,#fff_0%,#fbfcfa_100%)] px-2 py-2 text-center sm:min-h-[72px] sm:px-2.5 sm:py-3">
                  <strong className="break-keep text-[13px] font-black leading-[1.14] tracking-normal text-neutral-950 sm:text-[clamp(15px,1.45vw,18px)]">
                    {item.label}
                  </strong>
                </p>
              </>
            ) : (
              <div className="relative flex min-h-[170px] flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#f8faf7_0%,#eef3ef_100%)] p-4 text-center sm:min-h-0">
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[58%] font-neo-heavy text-[64px] leading-none text-blue-600/16 sm:text-[76px]">
                  0{index + 1}
                </span>
                <strong className="relative z-[1] break-keep text-[18px] font-black leading-[1.22] tracking-normal text-neutral-950 sm:text-[clamp(17px,1.7vw,22px)]">
                  {item.label}
                </strong>
              </div>
            )}
          </article>
        ))}
      </div>
    );
  }

  if (slide.productPreview) {
    return (
      <div data-intro-visual className={introVisualFrameClass}>
        <IntroProposalProductPreview kind={slide.productPreview} />
      </div>
    );
  }

  if (slide.visualFacts) {
    return (
      <div data-intro-visual className={`${introVisualFrameClass} grid content-center gap-2.5 sm:gap-3 sm:p-[clamp(20px,3vw,42px)]`}>
        {slide.visualFacts.map((fact, index) => (
          <div
            key={`${fact.label}-${fact.value}`}
            className="flex min-h-[58px] items-center justify-between gap-3 rounded-[12px] border border-neutral-200 bg-white px-3 py-2.5 shadow-[0_12px_24px_rgba(23,26,23,0.05)] sm:min-h-[84px] sm:gap-4 sm:rounded-[14px] sm:px-5 sm:py-4 sm:shadow-[0_14px_30px_rgba(23,26,23,0.055)]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-[11px] font-black text-white sm:h-9 sm:w-9">
                {index + 1}
              </span>
              <span className="truncate text-[13px] font-extrabold tracking-normal text-neutral-500 sm:text-[14px]">
                {fact.label}
              </span>
            </div>
            <strong
              className={`min-w-0 text-right text-[18px] font-black leading-6 tracking-normal sm:text-[clamp(19px,2vw,24px)] ${advertiserProposalFactToneClass(
                fact.tone,
              )}`}
            >
              {fact.value}
            </strong>
          </div>
        ))}
      </div>
    );
  }

  if (slide.imageSrc) {
    if (slide.stage === "final") {
      return (
        <FinalHandshakeVisual
          imageAlt={slide.imageAlt}
          imageSrc={slide.imageSrc}
        />
      );
    }

    const baseImageFitClass =
      "object-contain object-center";

    return (
      <div
        data-intro-visual
        className={`${introVisualFrameClass} flex items-center justify-center self-center ${
          slide.stage === "product"
              ? "h-full self-center"
            : "h-full"
        }`}
      >
        {slide.imageSrc === advertiserProposalAssetUrls.influencerContract ? (
          <div className="mx-auto h-full w-full">
            <div className="hidden h-full sm:block">
              <InfluencerContractLinkDesktopPreview />
            </div>
            <div className="h-full sm:hidden">
              <InfluencerContractLinkMobilePreview />
            </div>
          </div>
        ) : (
          <img
            src={slide.imageSrc}
            alt={slide.imageAlt ?? ""}
            className={`h-full w-full ${baseImageFitClass} ${
              slide.imageFit === "cover" ? "sm:object-cover" : "sm:object-contain"
            }`}
            loading="eager"
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 sm:h-auto sm:min-h-0" />
  );
}

function FinalHandshakeVisual({
  imageAlt,
  imageSrc,
}: {
  imageAlt?: string;
  imageSrc: string;
}) {
  return (
    <div
      data-intro-visual
      className={`${introVisualFrameClass} flex items-center justify-center`}
    >
      <div className="relative h-full min-h-0 w-full overflow-hidden rounded-[16px] bg-[#eef3ef] shadow-[0_18px_44px_rgba(15,23,42,0.1)] sm:shadow-[0_24px_64px_rgba(15,23,42,0.12)]">
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover object-[52%_center] opacity-28 blur-md sm:hidden"
          loading="eager"
        />
        <img
          src={imageSrc}
          alt={imageAlt ?? ""}
          className="absolute inset-0 h-full w-full object-contain object-center sm:object-cover"
          loading="eager"
        />
      </div>
    </div>
  );
}

function IntroFinalStartModal({ role }: { role: IntroRole }) {
  const signupHref = role === "advertiser" ? "/signup/advertiser" : "/signup/influencer";

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950/24 px-5 backdrop-blur-[1px]"
      style={{ animation: "introFinalDimIn 180ms ease-out both" }}
    >
      <style>
        {`@keyframes introFinalDimIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes introFinalDialogIn { from { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }`}
      </style>
      <div
        role="dialog"
        aria-label="시작하기"
        className="grid w-full max-w-[320px] gap-4 rounded-[18px] border border-white/75 bg-white/96 p-4 text-center shadow-[0_28px_74px_rgba(15,23,42,0.25)] sm:max-w-[340px] sm:p-5"
        style={{ animation: "introFinalDialogIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both" }}
      >
        <Link
          to={signupHref}
          className="inline-flex h-12 items-center justify-center rounded-[10px] bg-blue-600 px-5 text-[15px] font-black text-white shadow-[0_16px_34px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-blue-700"
        >
          시작하기
        </Link>
        <span className="grid gap-1.5 text-[11px] font-bold leading-none text-[#69736c]">
          <span>문의 이메일</span>
          <strong className="text-[14px] font-black text-neutral-950">
            yeollockme@gmail.com
          </strong>
        </span>
      </div>
    </div>
  );
}

function InfluencerContractLinkDesktopPreview() {
  const facts = [
    { label: "광고주", value: "브레드룸", badge: "인증" },
    { label: "보상", value: "1,800,000원" },
    { label: "마감", value: "2026.05.29" },
    { label: "플랫폼", value: "인스타그램", platform: "인스타" },
    { label: "컨텐츠", value: "릴스" },
    { label: "수량", value: "1건" },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-neutral-200 bg-white shadow-[0_18px_48px_rgba(23,26,23,0.08)]">
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-extrabold text-neutral-500">
              오브레 릴스 캠페인
            </p>
            <h3 className="truncate text-[18px] font-black text-neutral-950">
              계약 링크 도착
            </h3>
          </div>
          <span className="inline-flex h-9 shrink-0 items-center rounded-[9px] bg-neutral-950 px-4 text-[12px] font-black text-white">
            서명 전
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,0.42fr)_minmax(0,0.58fr)] gap-3 bg-[#fbfcfa] p-3">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="rounded-[14px] border border-neutral-200 bg-white px-4 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.045)]">
            <p className="text-[11px] font-extrabold text-blue-700">
              핵심 조건
            </p>
            <h4 className="mt-1 text-[24px] font-black leading-tight text-neutral-950">
              계약 내용 확인
            </h4>
            <p className="mt-2 break-keep text-[12px] font-semibold leading-5 text-neutral-500">
              브랜드, 보상, 마감, 컨텐츠를 먼저 확인하고 계약서 원문으로 넘어갑니다.
            </p>
          </div>

          <dl className="grid gap-2">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="grid min-h-10 grid-cols-[76px_minmax(0,1fr)] items-center gap-3 rounded-[10px] border border-neutral-200 bg-white px-3 py-2"
              >
                <dt className="text-[11px] font-extrabold text-neutral-500">
                  {fact.label}
                </dt>
                <dd className="flex min-w-0 items-center justify-end gap-2 text-right text-[13px] font-black text-neutral-950">
                  {fact.platform ? <IntroPlatformMarks platform={fact.platform} /> : null}
                  <span className="truncate">{fact.value}</span>
                  {fact.badge ? (
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">
                      {fact.badge}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>

          <span className="mt-auto inline-flex h-11 items-center justify-center rounded-[10px] bg-blue-600 text-[13px] font-black text-white shadow-[0_16px_34px_rgba(37,99,235,0.18)]">
            계약서 확인하기
          </span>
        </div>

        <div className="flex min-h-0 items-stretch overflow-hidden rounded-[14px] border border-neutral-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
          <div className="flex min-h-0 w-full flex-col p-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <p className="text-[11px] font-extrabold text-neutral-500">
                  브레드룸
                </p>
                <p className="mt-1 text-[16px] font-black text-neutral-950">
                  공동구매 파일럿 계약서
                </p>
              </div>
              <span className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-extrabold text-neutral-700">
                PDF 원문
              </span>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 py-4">
              {[
                ["제1조 계약 목적", "브랜드 공동구매 파일럿 콘텐츠 제작과 게시"],
                ["제2조 컨텐츠 및 일정", "인스타그램 릴스 1건, 2026.05.29 마감"],
                ["제3조 지급 조건", "콘텐츠 확인 후 7영업일 내 1,800,000원 지급"],
                ["제4조 콘텐츠 활용", "브랜드 채널과 랜딩 페이지 활용 범위 확인"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-[10px] bg-neutral-50 px-3 py-3">
                  <p className="text-[12px] font-black text-neutral-950">
                    {title}
                  </p>
                  <p className="mt-1 truncate text-[11px] font-semibold text-neutral-500">
                    {body}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-neutral-200 pt-3 text-[11px] font-black text-neutral-500">
              <span>광고주 브레드룸</span>
              <span className="text-right">인플루언서 크리에이터 소라</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfluencerContractLinkMobilePreview() {
  const facts = [
    { label: "광고주", value: "브레드룸", badge: "인증" },
    { label: "보상", value: "1,800,000원" },
    { label: "마감", value: "2026.05.29" },
    { label: "플랫폼", value: "인스타그램", platform: "인스타" },
    { label: "컨텐츠", value: "릴스" },
    { label: "수량", value: "1건" },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.1)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 px-3.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold text-neutral-500">
            오브레 릴스 캠페인
          </p>
          <p className="truncate text-[13px] font-black text-neutral-950">
            계약 링크 도착
          </p>
        </div>
        <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-neutral-950 px-3 text-[10px] font-black text-white">
          서명 전
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-[#fbfcfa] p-3">
        <div className="rounded-[14px] border border-neutral-200 bg-white px-3.5 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.045)]">
          <p className="text-[10px] font-extrabold text-blue-700">
            핵심 조건
          </p>
          <h3 className="mt-1 text-[20px] font-black leading-tight text-neutral-950">
            계약 내용 확인
          </h3>
        </div>

        <dl className="mt-2 min-h-0 flex-1 divide-y divide-neutral-200 overflow-hidden rounded-[14px] border border-neutral-200 bg-white">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex min-h-0 items-center justify-between gap-3 px-3.5 py-2.5"
            >
              <dt className="shrink-0 text-[10px] font-extrabold text-neutral-500">
                {fact.label}
              </dt>
              <dd className="min-w-0 text-right text-[13px] font-black text-neutral-950">
                {fact.badge ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{fact.value}</span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-black text-blue-700">
                      {fact.badge}
                    </span>
                  </span>
                ) : fact.platform ? (
                  <span className="inline-flex min-w-0 items-center justify-end gap-1.5">
                    <IntroPlatformMarks platform={fact.platform} />
                    <span className="truncate">{fact.value}</span>
                  </span>
                ) : (
                  <span className="truncate">{fact.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-2 h-10 shrink-0 rounded-[10px] bg-blue-600 text-center text-[12px] font-black leading-10 text-white shadow-[0_14px_28px_rgba(37,99,235,0.22)]">
          계약서 확인하기
        </div>
      </div>
    </section>
  );
}

function AdvertiserMobileLinkPreview() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.1)] sm:hidden">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 px-3.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold text-neutral-500">
            선크림 릴스 광고
          </p>
          <p className="truncate text-[13px] font-black text-neutral-950">
            계약 링크 공유
          </p>
        </div>
        <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-blue-600 px-3 text-[10px] font-black text-white">
          작성 완료
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-[#fbfcfa] p-3">
        <div className="rounded-[14px] border border-neutral-200 bg-white p-3 shadow-[0_12px_26px_rgba(15,23,42,0.045)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-black text-neutral-950">계약 링크</p>
            <span className="text-[10px] font-extrabold text-neutral-500">
              광고주 화면
            </span>
          </div>
          <div>
            <p className="mt-3 text-[10px] font-extrabold text-neutral-500">인플루언서</p>
            <p className="mt-0.5 truncate text-[13px] font-black text-neutral-950">
              세라 블로그
            </p>
          </div>
          <div className="mt-2 rounded-[10px] border border-neutral-200 bg-[#fbfcfa] px-2.5 py-2">
            <p className="truncate text-[10px] font-bold text-neutral-500">
              yeollock.me/c/ser...
            </p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="mt-2 h-8 w-full rounded-[9px] bg-blue-600 text-[11px] font-black text-white shadow-[0_12px_24px_rgba(37,99,235,0.18)]"
          >
            링크 복사
          </button>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-center">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-[0_12px_24px_rgba(37,99,235,0.14)]"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-90" strokeWidth={2.4} />
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-[14px] border border-neutral-200 bg-white shadow-[0_12px_26px_rgba(15,23,42,0.045)]">
          <div className="flex h-10 items-center justify-between border-b border-neutral-200 px-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-extrabold text-neutral-500">
                데일리 루틴 블로그
              </p>
              <p className="truncate text-[12px] font-black text-neutral-950">
                계약 확인
              </p>
            </div>
            <span className="rounded-full bg-neutral-950 px-2 py-1 text-[9px] font-black text-white">
              서명 전
            </span>
          </div>
          <div className="grid gap-0 divide-y divide-neutral-200 px-3 pb-2">
            {[
              ["보상", "1,800,000원"],
              ["마감", "2026.05.29"],
              ["플랫폼", "블로그"],
              ["수량", "1건"],
            ].map(([label, value]) => (
              <div key={label} className="flex min-h-[34px] items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold text-neutral-500">{label}</span>
                <strong className="flex min-w-0 items-center justify-end gap-1.5 truncate text-[12px] font-black text-neutral-950">
                  {label === "플랫폼" ? <IntroPlatformMarks platform={value} /> : null}
                  <span className="truncate">{value}</span>
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IntroProposalProductPreview({
  kind,
}: {
  kind: NonNullable<IntroProposalSlide["productPreview"]>;
}) {
  if (kind === "advertiserBuilder") {
    return <AdvertiserBuilderProductPreview />;
  }

  if (kind === "advertiserContractReview") {
    return <AdvertiserContractReviewProductPreview />;
  }

  if (kind === "advertiserApplicants") {
    return <AdvertiserApplicantsProductPreview />;
  }

  if (kind === "influencerConditionReview") {
    return <InfluencerConditionReviewPreview />;
  }

  if (kind === "influencerCampaignApply") {
    return <InfluencerCampaignApplyPreview />;
  }

  if (kind === "influencerDashboard") {
    return (
      <>
        <IntroMobileServiceCapture
          imageAlt="실제 모바일 인플루언서 계약 대시보드 화면"
          imageSrc={advertiserProposalAssetUrls.introInfluencerDashboardMobile}
        />
        <div className="hidden h-full min-h-0 overflow-hidden rounded-[16px] sm:block">
          <InfluencerIntroDashboardPreview
            data={introDashboardDemoData.influencer}
            stateIndex={1}
          />
        </div>
      </>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-neutral-200 bg-[#f4f5f2] p-2 shadow-[0_18px_48px_rgba(23,26,23,0.08)] max-[640px]:rounded-[14px] max-[640px]:p-1.5">
      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[#d9e0d9] bg-white">
          {kind === "influencerPdf" ? (
            <InfluencerContractPdfPreview />
          ) : (
            <InfluencerRevisionRequestPreview />
          )}
        </div>
      </div>
    </section>
  );
}

function IntroDesktopServiceCapture({
  desktopOnly = false,
  imageAlt,
  imageSrc,
  imageClassName = "object-cover object-left-top",
}: {
  desktopOnly?: boolean;
  imageAlt: string;
  imageSrc: string;
  imageClassName?: string;
}) {
  return (
    <section
      data-intro-real-service-capture
      data-intro-headerless-service-capture
      className={`${desktopOnly ? "hidden sm:block" : "block"} h-full min-h-0 overflow-hidden rounded-[16px] border border-neutral-200 bg-[#e9ede8] shadow-[0_18px_48px_rgba(23,26,23,0.08)]`}
    >
      <img
        src={imageSrc}
        alt={imageAlt}
        className={`h-full w-full ${imageClassName}`}
        loading="eager"
      />
    </section>
  );
}

function IntroMobileServiceCapture({
  imageAlt,
  imageSrc,
}: {
  imageAlt: string;
  imageSrc: string;
}) {
  return (
    <section
      data-intro-real-service-capture
      data-intro-headerless-service-capture
      className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-[16px] bg-[#e9ede8] sm:hidden"
    >
      <div className="flex h-full max-h-[606px] w-full max-w-[344px] items-center justify-center overflow-hidden rounded-[16px] bg-[#f1f4f1] shadow-[0_16px_34px_rgba(15,23,42,0.08)] ring-1 ring-neutral-200/80 [@media(max-height:760px)]:aspect-[430/788] [@media(max-height:760px)]:w-auto [@media(max-height:760px)]:max-w-full">
        <div className="h-full max-h-[606px] w-full max-w-[316px] overflow-hidden rounded-[10px] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-neutral-200/85 [@media(max-height:760px)]:aspect-[390/788] [@media(max-height:760px)]:w-auto [@media(max-height:760px)]:max-w-none">
          <img
            src={imageSrc}
            alt={imageAlt}
            className="h-full w-full object-cover object-top"
            loading="eager"
          />
        </div>
      </div>
    </section>
  );
}

function AdvertiserBuilderProductPreview() {
  return (
    <>
      <ActualContractBuilderMobilePreview />
      <IntroDesktopServiceCapture
        desktopOnly
        imageAlt="실제 광고주 전자계약서 작성 화면"
        imageSrc={advertiserProposalAssetUrls.introContractBuilder}
        imageClassName="object-contain object-center"
      />
    </>
  );
}

function ActualContractBuilderMobilePreview() {
  return (
    <IntroMobileServiceCapture
      imageAlt="실제 모바일 광고주 전자계약서 작성 화면"
      imageSrc={advertiserProposalAssetUrls.introContractBuilderMobile}
    />
  );
}

function AdvertiserContractReviewProductPreview() {
  return (
    <>
      <IntroMobileServiceCapture
        imageAlt="실제 모바일 광고주 계약 관리 화면"
        imageSrc={advertiserProposalAssetUrls.introContentReviewMobile}
      />
      <IntroDesktopServiceCapture
        desktopOnly
        imageAlt="실제 광고주 콘텐츠 검수 대시보드 화면"
        imageSrc={advertiserProposalAssetUrls.introContentReview}
        imageClassName="object-contain object-center"
      />
    </>
  );
}

function AdvertiserApplicantsProductPreview() {
  return (
    <>
      <IntroMobileServiceCapture
        imageAlt="실제 모바일 광고주 캠페인 운영 화면"
        imageSrc={advertiserProposalAssetUrls.introCampaignsMobile}
      />
      <IntroDesktopServiceCapture
        desktopOnly
        imageAlt="실제 광고주 캠페인 지원 인플루언서 대시보드 화면"
        imageSrc={advertiserProposalAssetUrls.introCampaignApplicants}
        imageClassName="object-contain object-center"
      />
    </>
  );
}

function InfluencerConditionReviewPreview() {
  const facts = [
    { label: "브랜드", value: "오브레 스튜디오", badge: "인증" },
    { label: "보상", value: "1,800,000원" },
    { label: "마감", value: "2026.05.29" },
    { label: "플랫폼", value: "인스타", platform: "인스타" },
    { label: "컨텐츠", value: "릴스 1건 · 스토리 2건" },
    { label: "활용", value: "브랜드 채널 3개월" },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-neutral-200 bg-[#f4f5f2] p-2 shadow-[0_18px_48px_rgba(23,26,23,0.08)] max-[640px]:rounded-[14px] max-[640px]:p-1.5">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[#d9e0d9] bg-white">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-3.5 max-[640px]:h-11">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-extrabold text-neutral-500">
              받은 계약
            </p>
            <h3 className="truncate text-[15px] font-black text-neutral-950 max-[640px]:text-[14px]">
              릴스 협찬 조건 확인
            </h3>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center rounded-[8px] bg-neutral-950 px-3 text-[11px] font-black text-white max-[640px]:h-7 max-[640px]:px-2.5">
            서명 전
          </span>
        </div>

        <div className="grid min-h-0 flex-1 gap-2 bg-[#fbfcfa] p-2 max-[640px]:gap-1.5 max-[640px]:p-1.5 sm:grid-cols-[minmax(250px,0.42fr)_minmax(0,0.58fr)]">
          <div className="flex min-h-0 flex-col gap-2 max-[640px]:gap-1.5">
            <div className="rounded-[12px] border border-blue-200 bg-blue-50 px-3.5 py-3 max-[640px]:px-3 max-[640px]:py-2">
              <p className="text-[11px] font-black text-blue-700">
                흩어진 광고 조건은
              </p>
              <p className="mt-1 break-keep text-[13px] font-black leading-5 text-neutral-950 max-[640px]:text-[12px] max-[640px]:leading-4">
                금액 확인 누락, 일정 착오, 산출물 불명확, 활용 권한 과다로 이어집니다.
              </p>
            </div>
            <dl className="grid min-h-0 flex-1 gap-2 overflow-hidden max-[640px]:grid-cols-2 max-[640px]:gap-1.5">
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="grid min-h-[58px] grid-cols-[68px_minmax(0,1fr)] items-center gap-2 rounded-[10px] border border-neutral-200 bg-white px-3 py-2 max-[640px]:min-h-[52px] max-[640px]:grid-cols-1 max-[640px]:gap-1 max-[640px]:px-2.5 max-[640px]:py-1.5"
                >
                  <dt className="text-[10px] font-extrabold text-neutral-500">
                    {fact.label}
                  </dt>
                  <dd className="flex min-w-0 items-center justify-end gap-1.5 text-right text-[12px] font-black text-neutral-950 max-[640px]:justify-start max-[640px]:text-left max-[640px]:text-[11px]">
                    {fact.platform ? <IntroPlatformMarks platform={fact.platform} /> : null}
                    <span className="truncate">{fact.value}</span>
                    {fact.badge ? (
                      <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-black text-blue-700 ring-1 ring-blue-200">
                        {fact.badge}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-neutral-200 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.055)] max-[640px]:hidden">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <p className="text-[11px] font-extrabold text-neutral-500">
                  계약서 원문
                </p>
                <p className="mt-1 text-[15px] font-black text-neutral-950">
                  광고 계약 조건
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-700 ring-1 ring-blue-200">
                확인 가능
              </span>
            </div>
            <div className="grid min-h-0 flex-1 gap-2 py-3">
              {[
                ["제2조 컨텐츠", "릴스 1건, 스토리 2건"],
                ["제3조 지급", "콘텐츠 승인 후 7영업일 이내"],
                ["제4조 활용", "브랜드 채널 3개월 활용"],
                ["제5조 일정", "2026.05.29까지 게시"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-[9px] bg-neutral-50 px-3 py-2.5">
                  <p className="text-[11px] font-black text-neutral-950">
                    {title}
                  </p>
                  <p className="mt-1 truncate text-[10px] font-bold text-neutral-500">
                    {body}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 pt-3">
              <span className="inline-flex h-9 items-center justify-center rounded-[8px] border border-neutral-200 text-[11px] font-black text-neutral-700">
                수정 요청
              </span>
              <span className="inline-flex h-9 items-center justify-center rounded-[8px] bg-blue-600 text-[11px] font-black text-white">
                계약서 확인
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfluencerCampaignApplyPreview() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-neutral-200 bg-[#f4f5f2] p-2 shadow-[0_18px_48px_rgba(23,26,23,0.08)] max-[640px]:rounded-[14px] max-[640px]:p-1.5">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[#d9e0d9] bg-white">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-3.5 max-[640px]:h-11">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-extrabold text-neutral-500">
              캠페인 찾기
            </p>
            <h3 className="truncate text-[15px] font-black text-neutral-950 max-[640px]:text-[14px]">
              참여 가능한 캠페인
            </h3>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center rounded-[8px] bg-blue-600 px-3 text-[11px] font-black text-white max-[640px]:h-7 max-[640px]:px-2.5">
            신청
          </span>
        </div>

        <div className="grid min-h-0 flex-1 gap-2 bg-[#fbfcfa] p-2 max-[640px]:gap-1.5 max-[640px]:p-1.5 sm:grid-cols-[minmax(0,0.58fr)_minmax(250px,0.42fr)]">
          <article className="flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-neutral-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
            <div className="h-24 shrink-0 bg-[linear-gradient(135deg,#eff6ff_0%,#ecfdf5_100%)] px-4 py-3 max-[640px]:h-20 max-[640px]:px-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-extrabold text-blue-700">
                    오브레 스튜디오
                  </p>
                  <h4 className="mt-1 break-keep text-[20px] font-black leading-tight text-neutral-950 max-[640px]:text-[17px]">
                    선크림 릴스 캠페인
                  </h4>
                </div>
                <IntroPlatformMarks platform="인스타" size="sm" />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 p-3 max-[640px]:gap-1.5 max-[640px]:p-2.5">
              {[
                ["보상", "900,000원 + 제품"],
                ["컨텐츠", "릴스 1건"],
                ["마감", "2026.05.29"],
                ["상태", "신청 가능"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[9px] bg-neutral-50 px-3 py-2 max-[640px]:px-2.5 max-[640px]:py-1.5">
                  <dt className="text-[10px] font-extrabold text-neutral-500">
                    {label}
                  </dt>
                  <dd className="mt-1 truncate text-[12px] font-black text-neutral-950 max-[640px]:text-[11px]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-auto grid grid-cols-[1fr_auto] items-center gap-3 border-t border-neutral-200 p-3 max-[640px]:p-2.5">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-extrabold text-neutral-500">
                  신청 계정
                </p>
                <p className="mt-0.5 truncate text-[12px] font-black text-neutral-950">
                  @minseo_home
                </p>
              </div>
              <span className="inline-flex h-9 items-center rounded-[8px] bg-blue-600 px-4 text-[11px] font-black text-white">
                신청하기
              </span>
            </div>
          </article>

          <div className="flex min-h-0 flex-col gap-2 max-[640px]:hidden">
            <div className="rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-[11px] font-black text-blue-700">
                인증 계정으로 지원
              </p>
              <p className="mt-1 break-keep text-[13px] font-black leading-5 text-neutral-950">
                캠페인 조건과 연결할 계정을 확인한 뒤 바로 신청합니다.
              </p>
            </div>
            <div className="grid gap-2 rounded-[12px] border border-neutral-200 bg-white p-3">
              {[
                ["인스타그램", "@minseo_home", "인증"],
                ["유튜브", "@minseo_daily", "인증"],
              ].map(([platform, handle, state]) => (
                <div
                  key={platform}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] bg-neutral-50 px-3 py-2"
                >
                  <IntroPlatformMarks platform={platform} size="sm" />
                  <span className="truncate text-[12px] font-black text-neutral-950">
                    {handle}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 ring-1 ring-blue-200">
                    {state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfluencerContractPdfPreview() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#e9ece8] p-2 max-[640px]:p-1.5">
      <div className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-[8px] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.1)]">
        <img
          src={advertiserProposalAssetUrls.contractPdfReviewPage}
          alt="실제 PDF 계약서 원문 첫 페이지"
          className="h-full w-full object-contain object-center"
          loading="eager"
        />
      </div>
    </div>
  );
}

function InfluencerRevisionRequestPreview() {
  const clauseRows = [
    ["제2조", "콘텐츠 업로드 일정"],
    ["제4조", "2차 콘텐츠 활용"],
    ["제5조", "검수 및 수정 기준"],
  ];
  const responseRows = [
    ["요청 생성", "2026.05.22"],
    ["광고주 확인", "진행중"],
    ["서명 상태", "대기"],
  ];

  return (
    <>
      <div className="border-b border-neutral-200 bg-white px-3 py-2 max-[640px]:py-1.5">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-extrabold text-neutral-500 max-[640px]:text-[11px]">
              브레드룸 공동구매
            </p>
            <h3 className="truncate text-[15px] font-black text-neutral-950 max-[640px]:text-[14px]">
              수정 요청 작성
            </h3>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center rounded-[8px] border border-amber-200 bg-amber-50 px-3 text-[11px] font-extrabold text-amber-800 max-[640px]:h-7 max-[640px]:px-2.5">
            서명 전
          </span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-2 bg-[#fbfcfa] p-2 max-[640px]:gap-1.5 max-[640px]:p-1.5 sm:grid-cols-[minmax(260px,0.42fr)_minmax(0,0.58fr)]">
        <div className="flex min-h-0 flex-col gap-2 max-[640px]:gap-1.5">
          <div className="grid grid-cols-2 gap-2 max-[640px]:gap-1.5">
            <div className="rounded-[10px] border border-neutral-200 bg-white px-3 py-2.5 max-[640px]:px-2.5 max-[640px]:py-1.5">
              <p className="text-[10px] font-extrabold text-neutral-500">
                수정 조항
              </p>
              <p className="mt-1 truncate text-[12px] font-black text-neutral-950">
                2차 콘텐츠 활용
              </p>
            </div>
            <div className="rounded-[10px] border border-neutral-200 bg-white px-3 py-2.5 max-[640px]:px-2.5 max-[640px]:py-1.5">
              <p className="text-[10px] font-extrabold text-neutral-500">
                답변 상태
              </p>
              <p className="mt-1 truncate text-[12px] font-black text-blue-700">
                광고주 확인 중
              </p>
            </div>
          </div>
          <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3 max-[640px]:px-2.5 max-[640px]:py-2">
            <p className="text-[11px] font-black text-amber-900">
              12개월 활용 기간
            </p>
            <p className="mt-1 text-[11px] font-bold leading-5 text-amber-800 max-[430px]:hidden">
              브랜드는 업로드 콘텐츠를 광고 소재로 12개월 동안 활용할 수 있습니다.
            </p>
          </div>
          <div className="grid min-h-0 flex-1 gap-2 overflow-hidden rounded-[10px] border border-neutral-200 bg-white p-2 max-[640px]:gap-1.5 max-[640px]:p-1.5 [@media(max-height:760px)]:hidden">
            {clauseRows.map(([label, value], index) => (
              <div
                key={label}
                className={`grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-[8px] px-3 py-2 ${
                  index === 1
                    ? "bg-blue-50 text-blue-800"
                    : "bg-neutral-50 text-neutral-800"
                }`}
              >
                <span className="text-[10px] font-black">{label}</span>
                <span className="truncate text-[11px] font-extrabold">{value}</span>
              </div>
            ))}
          </div>
          <div className="hidden grid-cols-3 gap-1.5 sm:grid">
            {responseRows.map(([label, value]) => (
              <div
                key={label}
                className="rounded-[8px] bg-white px-2 py-2 text-center ring-1 ring-neutral-200"
              >
                <p className="text-[9px] font-extrabold text-neutral-500">{label}</p>
                <p className="mt-0.5 truncate text-[10px] font-black text-neutral-900">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-[10px] border border-neutral-200 bg-white p-3 max-[640px]:p-2">
          <div className="rounded-[10px] border-2 border-blue-500 bg-blue-50 px-3 py-3 shadow-[0_12px_28px_rgba(37,99,235,0.14)] max-[640px]:px-2.5 max-[640px]:py-2">
            <p className="text-[10px] font-extrabold text-blue-700">
              요청 내용
            </p>
            <p className="mt-2 break-keep text-[14px] font-black leading-6 text-neutral-950 max-[640px]:mt-1 max-[640px]:text-[12px] max-[640px]:leading-4">
              3개월로 줄이고 추가 활용은 별도 동의로 진행해주세요.
            </p>
          </div>
          <div className="mt-2 grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] rounded-[8px] border border-neutral-200 bg-white max-[640px]:mt-1.5">
            <div className="border-b border-neutral-200 px-3 py-2 max-[640px]:py-1.5">
              <p className="text-[11px] font-black text-neutral-950">
                수정 요청 메모
              </p>
            </div>
            <div className="min-h-0 overflow-hidden px-3 py-3 max-[640px]:py-2">
              <div className="grid h-full min-h-[116px] content-start rounded-[8px] border border-blue-200 bg-white px-3 py-3 ring-2 ring-blue-100 max-[640px]:min-h-[80px] max-[640px]:px-2.5 max-[640px]:py-2">
                <p className="text-[10px] font-extrabold text-neutral-500">
                  선택 조항 · 제4조 콘텐츠 활용 범위
                </p>
                <p className="mt-2 break-keep text-[12px] font-bold leading-5 text-neutral-800 max-[640px]:line-clamp-3 max-[640px]:text-[11px] max-[640px]:leading-4">
                  광고 소재 활용 기간을 12개월에서 3개월로 조정하고, 추가 사용은 별도 동의 후 진행해주세요.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 p-2 max-[640px]:gap-1.5 max-[640px]:p-1.5">
              <span className="inline-flex h-9 items-center justify-center rounded-[8px] border border-neutral-200 text-[11px] font-black text-neutral-700 max-[640px]:h-8">
                임시저장
              </span>
              <span className="inline-flex h-9 items-center justify-center rounded-[8px] bg-blue-600 text-[11px] font-black text-white max-[640px]:h-8">
                요청 보내기
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function getIntroInfluencerPlatform(platform: string): InfluencerPlatform {
  const normalized = platform.toLowerCase();
  if (platform.includes("인스타") || platform.includes("릴스") || normalized.includes("instagram") || normalized.includes("reels")) return "instagram";
  if (platform.includes("유튜브") || normalized.includes("youtube")) return "youtube";
  if (platform.includes("틱톡") || normalized.includes("tiktok")) return "tiktok";
  if (platform.includes("블로그") || normalized.includes("blog") || normalized.includes("naver")) return "naver_blog";
  return "other";
}

function getIntroPlatformMarks(platform: string): InfluencerPlatform[] {
  const normalized = platform.toLowerCase();
  const marks: InfluencerPlatform[] = [];
  const add = (mark: InfluencerPlatform) => {
    if (!marks.includes(mark)) marks.push(mark);
  };

  if (platform.includes("인스타") || platform.includes("릴스") || normalized.includes("instagram") || normalized.includes("reels")) {
    add("instagram");
  }
  if (platform.includes("유튜브") || normalized.includes("youtube")) {
    add("youtube");
  }
  if (platform.includes("틱톡") || normalized.includes("tiktok")) {
    add("tiktok");
  }
  if (platform.includes("블로그") || normalized.includes("blog") || normalized.includes("naver")) {
    add("naver_blog");
  }
  if ((platform.includes("외 1") || platform.includes("+1")) && marks.length === 1) {
    add(marks[0] === "instagram" ? "youtube" : "instagram");
  }

  return marks.length > 0 ? marks : [getIntroInfluencerPlatform(platform)];
}

function IntroPlatformMarks({
  platform,
  size = "xs",
  className = "",
}: {
  platform: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-label={platform}
      className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}
      title={platform}
    >
      {getIntroPlatformMarks(platform).map((mark) => (
        <span key={`${platform}:${mark}`} className="inline-flex">
          <PlatformBrandMark platform={mark} size={size} />
        </span>
      ))}
    </span>
  );
}

function advertiserProposalFactToneClass(tone: IntroProposalFact["tone"]) {
  if (tone === "blue") {
    return "text-blue-700";
  }

  if (tone === "red") {
    return "text-[#dc2626]";
  }

  return "text-neutral-950";
}

function RolePreviewSlideView({
  slide,
  role,
  panelId,
}: {
  slide: RoleIntroSlide;
  role: IntroRole;
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
        role={role}
        slide={slide}
      />
    );
  }

  return (
    <RoleContractPreview
      panelId={panelId}
      preview={slide.preview}
      role={role}
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
      role="region"
      aria-label={`${slide.label} 미리보기`}
      className="yl-card flex h-full min-h-0 flex-col overflow-hidden border sm:min-h-[420px] lg:min-h-0"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-3 py-2.5 sm:px-5 sm:py-3">
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

      <div className="min-h-0 flex-1 overflow-hidden bg-[#fbfaf7] p-2 sm:p-4">
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

type IntroDashboardRow = {
  platform: string;
  platformClass: string;
  kind: string;
  party: string;
  title: string;
  amount: string;
  status: string;
  statusClass: string;
  deadline: string;
  note: string;
};

type IntroAdvertiserCampaignRow = {
  platform: string;
  platformClass: string;
  brand: string;
  title: string;
  payment: string;
  metric: string;
  metricPercent?: number;
  date: string;
};

type IntroDashboardTab = {
  label: string;
  count: number;
};

type IntroDashboardState = {
  activeTab: string;
  tabs: IntroDashboardTab[];
  itemCount: number;
  rows: IntroAdvertiserCampaignRow[];
  secondaryColumnLabel?: string;
  paymentColumnLabel?: string;
  metricColumnLabel: string;
  dateColumnLabel: string;
  metricBeforeDate?: boolean;
  emptyTitle: string;
  emptyMessage: string;
};

const introDashboardDemoData = {
  advertiser: {
    accountName: "브레드룸",
    accountMeta: "123-**-67890",
    verificationMeta: "",
    states: [
      {
        activeTab: "작성중",
        tabs: [
          { label: "작성중", count: 2 },
          { label: "진행중", count: 3 },
          { label: "종료", count: 2 },
        ],
        itemCount: 2,
        secondaryColumnLabel: "종류",
        paymentColumnLabel: "지급내용",
        metricColumnLabel: "현 단계",
        dateColumnLabel: "마감일",
        emptyTitle: "조건에 맞는 계약이 없습니다",
        emptyMessage: "검색어를 줄이거나 전체로 바꿔보세요.",
        rows: [
          {
            platform: "인스타 외 1",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "협찬",
            title: "민서홈 릴스 협찬 계약",
            payment: "900,000원 + 제품 제공",
            metric: "검토 대기",
            date: "2026.05.29 / D-5",
          },
          {
            platform: "인스타 외 1",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "공동구매",
            title: "루나데이 공동구매 계약",
            payment: "수수료 18%",
            metric: "초안 작성",
            date: "2026.05.31 / D-7",
          },
        ],
      },
      {
        activeTab: "진행중",
        tabs: [
          { label: "작성중", count: 2 },
          { label: "진행중", count: 3 },
          { label: "종료", count: 2 },
        ],
        itemCount: 3,
        secondaryColumnLabel: "종류",
        paymentColumnLabel: "지급내용",
        metricColumnLabel: "현 단계",
        dateColumnLabel: "마감일",
        emptyTitle: "조건에 맞는 계약이 없습니다",
        emptyMessage: "검색어를 줄이거나 전체로 바꿔보세요.",
        rows: [
          {
            platform: "블로그",
            platformClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
            brand: "공동구매",
            title: "지유로그 공동구매 계약",
            payment: "수수료 18%",
            metric: "서명 완료",
            metricPercent: 70,
            date: "2026.05.28 / D-4",
          },
          {
            platform: "유튜브",
            platformClass: "border-rose-200 bg-rose-50 text-rose-700",
            brand: "PPL",
            title: "하루핏 쇼츠 PPL 계약",
            payment: "2,800,000원",
            metric: "검수 대기",
            metricPercent: 50,
            date: "2026.05.27 / D-3",
          },
          {
            platform: "인스타",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "협찬",
            title: "성수 팝업 릴스 계약",
            payment: "900,000원 + 제품 제공",
            metric: "콘텐츠 제출",
            metricPercent: 85,
            date: "2026.05.26 / D-2",
          },
        ],
      },
      {
        activeTab: "종료",
        tabs: [
          { label: "작성중", count: 2 },
          { label: "진행중", count: 3 },
          { label: "종료", count: 2 },
        ],
        itemCount: 2,
        secondaryColumnLabel: "종류",
        paymentColumnLabel: "지급내용",
        metricColumnLabel: "현 단계",
        dateColumnLabel: "종료일",
        emptyTitle: "조건에 맞는 계약이 없습니다",
        emptyMessage: "검색어를 줄이거나 전체로 바꿔보세요.",
        rows: [
          {
            platform: "인스타",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "협찬",
            title: "오브레 릴스 정산 완료 계약",
            payment: "1,800,000원",
            metric: "보관 완료",
            metricPercent: 100,
            date: "2026.05.21 / D+3",
          },
          {
            platform: "블로그",
            platformClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
            brand: "공동구매",
            title: "브루잉랩 공동구매 계약 종료",
            payment: "수수료 18%",
            metric: "검수 완료",
            metricPercent: 100,
            date: "2026.05.19 / D+5",
          },
        ],
      },
    ],
    rows: [
      {
        platform: "인스타",
        platformClass: "border-pink-200 bg-pink-50 text-pink-700",
        kind: "협찬",
        party: "민서홈",
        title: "오브레 비건 선크림 릴스 계약",
        amount: "180만원",
        status: "검토 필요",
        statusClass: "border-amber-200 bg-amber-50 text-amber-800",
        deadline: "D+3",
        note: "릴스 1건 · 스토리 2건",
      },
      {
        platform: "인스타",
        platformClass: "border-pink-200 bg-pink-50 text-pink-700",
        kind: "협찬",
        party: "루나데이",
        title: "오브레 비건 선크림 릴스 계약",
        amount: "180만원",
        status: "수정 요청",
        statusClass: "border-amber-200 bg-amber-50 text-amber-800",
        deadline: "D+1",
        note: "2차 활용 기간 조정",
      },
      {
        platform: "유튜브",
        platformClass: "border-rose-200 bg-rose-50 text-rose-700",
        kind: "PPL",
        party: "하루핏",
        title: "하우스핏 홈트 챌린지 유튜브 리뷰",
        amount: "260만원",
        status: "서명 준비",
        statusClass: "border-blue-200 bg-blue-50 text-blue-700",
        deadline: "D+2",
        note: "유튜브 리뷰 1건",
      },
      {
        platform: "블로그",
        platformClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        kind: "공동구매",
        party: "지유로그",
        title: "브루잉랩 콜드브루 공동구매 계약",
        amount: "판매 18%",
        status: "검수 대기",
        statusClass: "border-neutral-200 bg-white text-neutral-700",
        deadline: "D+4",
        note: "블로그 리뷰 · 공구 링크",
      },
    ],
  },
  influencer: {
    accountName: "민서홈",
    accountMeta: "@minseo_home · creator@minseo-home.kr",
    verificationMeta: "Instagram · YouTube 인증 완료",
    summary: "받은 계약 12건 · 이번 주 확인 4건",
    states: [
      {
        activeTab: "지원중",
        tabs: [
          { label: "지원중", count: 2 },
          { label: "진행중", count: 6 },
          { label: "완료", count: 1 },
          { label: "미선정", count: 1 },
        ],
        itemCount: 2,
        metricColumnLabel: "내 상태",
        dateColumnLabel: "응답기한",
        metricBeforeDate: true,
        emptyTitle: "조건에 맞는 계약이 없습니다",
        emptyMessage: "검색어를 줄이거나 전체로 바꿔보세요.",
        rows: [
          {
            platform: "인스타",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "브레드룸",
            title: "브레드룸 릴스 협찬 계약",
            payment: "900,000원 + 제품 제공",
            metric: "지원 접수",
            date: "D-2 / 2026.05.26",
          },
          {
            platform: "인스타 +1",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "나이트케어",
            title: "나이트케어 언박싱 계약",
            payment: "150만-250만원",
            metric: "지원 접수",
            date: "D-10 / 2026.06.03",
          },
        ],
      },
      {
        activeTab: "진행중",
        tabs: [
          { label: "지원중", count: 2 },
          { label: "진행중", count: 6 },
          { label: "완료", count: 1 },
          { label: "미선정", count: 1 },
        ],
        itemCount: 6,
        metricColumnLabel: "내 할 일",
        dateColumnLabel: "마감일",
        metricBeforeDate: true,
        emptyTitle: "조건에 맞는 계약이 없습니다",
        emptyMessage: "검색어를 줄이거나 전체로 바꿔보세요.",
        rows: [
          {
            platform: "인스타",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "브레드룸",
            title: "공동구매 릴스 계약",
            payment: "수수료 18%",
            metric: "컨텐츠 제출",
            date: "D-4 / 2026.05.28",
          },
          {
            platform: "유튜브",
            platformClass: "border-rose-200 bg-rose-50 text-rose-700",
            brand: "브레드룸",
            title: "나이트 케어 쇼츠 계약",
            payment: "2,800,000원",
            metric: "광고주 검수 필요",
            date: "D-3 / 2026.05.27",
          },
          {
            platform: "인스타",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "브레드룸",
            title: "성수 팝업 릴스 계약",
            payment: "2,100,000원",
            metric: "컨텐츠 제출",
            date: "D-1 / 2026.05.25",
          },
          {
            platform: "인스타",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "나이트케어",
            title: "밤 루틴 릴스 검수",
            payment: "1,600,000원",
            metric: "초안 제출",
            date: "D-4 / 2026.05.28",
          },
          {
            platform: "유튜브",
            platformClass: "border-rose-200 bg-rose-50 text-rose-700",
            brand: "브루잉랩",
            title: "홈카페 쇼츠 계약",
            payment: "판매 수수료 15%",
            metric: "게시 준비",
            date: "D-6 / 2026.05.30",
          },
          {
            platform: "인스타 +1",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "오브레",
            title: "스킨케어 루틴 공동구매",
            payment: "1,400,000원",
            metric: "광고주 검수",
            date: "D-8 / 2026.06.01",
          },
        ],
      },
      {
        activeTab: "완료",
        tabs: [
          { label: "지원중", count: 2 },
          { label: "진행중", count: 6 },
          { label: "완료", count: 1 },
          { label: "미선정", count: 1 },
        ],
        itemCount: 1,
        metricColumnLabel: "결과",
        dateColumnLabel: "완료일",
        metricBeforeDate: true,
        emptyTitle: "조건에 맞는 계약이 없습니다",
        emptyMessage: "검색어를 줄이거나 전체로 바꿔보세요.",
        rows: [
          {
            platform: "인스타",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "브레드룸",
            title: "공동구매 릴스 계약",
            payment: "수수료 18%",
            metric: "정산 보관",
            date: "D+3 / 2026.05.21",
          },
        ],
      },
      {
        activeTab: "미선정",
        tabs: [
          { label: "지원중", count: 2 },
          { label: "진행중", count: 6 },
          { label: "완료", count: 1 },
          { label: "미선정", count: 1 },
        ],
        itemCount: 1,
        metricColumnLabel: "결과",
        dateColumnLabel: "결과일",
        metricBeforeDate: true,
        emptyTitle: "조건에 맞는 계약이 없습니다",
        emptyMessage: "검색어를 줄이거나 전체로 바꿔보세요.",
        rows: [
          {
            platform: "인스타",
            platformClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            brand: "나이트케어",
            title: "언박싱 릴스 제안",
            payment: "150만-250만원",
            metric: "미선정",
            date: "D+4 / 2026.05.20",
          },
        ],
      },
    ],
    rows: [
      {
        platform: "인스타",
        platformClass: "border-pink-200 bg-pink-50 text-pink-700",
        kind: "협찬",
        party: "오브레 스튜디오",
        title: "오브레 비건 선크림 릴스 계약",
        amount: "180만원",
        status: "검토 필요",
        statusClass: "border-amber-200 bg-amber-50 text-amber-800",
        deadline: "D+3",
        note: "조항 확인",
      },
      {
        platform: "인스타",
        platformClass: "border-pink-200 bg-pink-50 text-pink-700",
        kind: "협찬",
        party: "오브레 스튜디오",
        title: "오브레 비건 선크림 릴스 계약",
        amount: "180만원",
        status: "수정 협의",
        statusClass: "border-amber-200 bg-amber-50 text-amber-800",
        deadline: "D+1",
        note: "활용 기간 답변 대기",
      },
      {
        platform: "유튜브",
        platformClass: "border-rose-200 bg-rose-50 text-rose-700",
        kind: "PPL",
        party: "하우스핏",
        title: "홈트 챌린지 유튜브 리뷰",
        amount: "260만원",
        status: "서명 준비",
        statusClass: "border-blue-200 bg-blue-50 text-blue-700",
        deadline: "D+2",
        note: "본인 인증 후 서명",
      },
      {
        platform: "인스타",
        platformClass: "border-pink-200 bg-pink-50 text-pink-700",
        kind: "공동구매",
        party: "브루잉랩",
        title: "콜드브루 릴스 공동구매 계약",
        amount: "판매 18%",
        status: "컨텐츠 제출",
        statusClass: "border-amber-200 bg-amber-50 text-amber-800",
        deadline: "D+4",
        note: "릴스 제출 링크",
      },
      {
        platform: "유튜브",
        platformClass: "border-rose-200 bg-rose-50 text-rose-700",
        kind: "PPL",
        party: "하우스핏",
        title: "홈트 챌린지 유튜브 리뷰",
        amount: "260만원",
        status: "검수 완료",
        statusClass: "border-neutral-200 bg-white text-neutral-700",
        deadline: "완료",
        note: "보관됨",
      },
    ],
  },
} satisfies {
  advertiser: {
    accountName: string;
    accountMeta: string;
    verificationMeta: string;
    states: IntroDashboardState[];
    rows: IntroDashboardRow[];
  };
  influencer: {
    accountName: string;
    accountMeta: string;
    verificationMeta: string;
    summary: string;
    states: IntroDashboardState[];
    rows: IntroDashboardRow[];
  };
};

function RoleDashboardStylePreview({
  slide,
  role,
  panelId,
}: {
  slide: RoleIntroSlide;
  role: IntroRole;
  panelId: string;
}) {
  const isAdvertiser = role === "advertiser";
  const data = isAdvertiser
    ? introDashboardDemoData.advertiser
    : introDashboardDemoData.influencer;
  const stateIndex = Math.max(
    0,
    Math.min(
      data.states.length - 1,
      roleIntroSlides[role].findIndex((candidate) => candidate.label === slide.label),
    ),
  );

  return (
    <div
      id={panelId}
      role="region"
      aria-label={`${slide.label} 미리보기`}
      className="flex h-auto min-h-0 flex-col overflow-visible sm:min-h-[420px] lg:h-full lg:min-h-0 lg:overflow-hidden"
    >
      {isAdvertiser ? (
        <AdvertiserIntroDashboardPreview
          data={introDashboardDemoData.advertiser}
          stateIndex={stateIndex}
        />
      ) : (
        <InfluencerIntroDashboardPreview
          data={introDashboardDemoData.influencer}
          stateIndex={stateIndex}
        />
      )}
    </div>
  );
}

function AdvertiserIntroDashboardPreview({
  data,
  stateIndex,
}: {
  data: typeof introDashboardDemoData.advertiser;
  stateIndex: number;
}) {
  const state = data.states[stateIndex] ?? data.states[0];

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-[12px] border border-neutral-200 bg-[#f4f5f2] shadow-[0_18px_48px_rgba(23,26,23,0.08)]">
      <div className="min-h-0 flex-1 p-2">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white">
          <IntroDashboardTitleBar
            title="계약 운영 대시보드"
            actionLabel="새 계약"
          />
          <IntroAdvertiserAccountBanner
            accountMeta={data.accountMeta}
            accountName={data.accountName}
          />
          <div className="min-h-0 flex-1 p-2">
            <IntroContractBoard state={state} />
          </div>
        </div>
      </div>
    </section>
  );
}

function _IntroAppHeader({ role }: { role: IntroRole }) {
  const isAdvertiser = role === "advertiser";

  return (
    <div className="border-b border-[#d9e0d9] bg-white">
      <div className="flex h-12 min-w-0 items-center justify-between gap-3 px-3">
        <div className="sr-only">
          <span>
            {PRODUCT_NAME}
          </span>
        </div>
        <div className="hidden min-w-0 items-center gap-1.5 md:flex">
          {isAdvertiser ? (
            <nav
              aria-label="광고주 대시보드 전환 미리보기"
              className="inline-flex h-10 items-center overflow-hidden rounded-[9px] border border-neutral-200 bg-white p-0.5"
            >
              {["계약", "캠페인"].map((action, index) => (
                <span
                  key={action}
                  className={`inline-flex h-8 w-12 items-center justify-center rounded-[7px] text-[11px] font-extrabold ${
                    index === 0
                      ? "bg-neutral-950 text-white"
                      : "text-neutral-600"
                  }`}
                >
                  {action}
                </span>
              ))}
            </nav>
          ) : (
            <>
              <IntroHeaderAction
                active
                icon={<FileText className="h-3.5 w-3.5" strokeWidth={2} />}
                label="내 계약"
              />
              <IntroHeaderAction
                icon={<Megaphone className="h-3.5 w-3.5" strokeWidth={2} />}
                label="캠페인 찾기"
              />
            </>
          )}
          <IntroHeaderAction
            icon={<MessageSquareText className="h-3.5 w-3.5" strokeWidth={2} />}
            label="메시지함"
          />
          {isAdvertiser ? (
            <IntroHeaderAction
              icon={<Search className="h-3.5 w-3.5" strokeWidth={2} />}
              label="인플루언서 찾기"
            />
          ) : null}
          <IntroHeaderAction
            icon={<LogOut className="h-3.5 w-3.5" strokeWidth={2} />}
            label="로그아웃"
          />
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-neutral-200 bg-white text-neutral-700">
            <Settings className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        </div>
      </div>
    </div>
  );
}

function IntroHeaderAction({
  active = false,
  icon,
  label,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span
      className={`inline-flex h-10 items-center gap-1.5 rounded-[9px] border px-2.5 text-[11px] font-extrabold ${
        active
          ? "border-neutral-950 bg-neutral-950 text-white"
          : "border-neutral-200 bg-white text-neutral-700"
      }`}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}

function InfluencerIntroDashboardPreview({
  data,
  stateIndex,
}: {
  data: typeof introDashboardDemoData.influencer;
  stateIndex: number;
}) {
  const state = data.states[stateIndex] ?? data.states[0];

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-[12px] border border-neutral-200 bg-[#f4f5f2] shadow-[0_18px_48px_rgba(23,26,23,0.08)]">
      <div className="min-h-0 flex-1 p-2">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white">
          <IntroDashboardTitleBar
            title="내 계약"
          />
          <IntroInfluencerProfileBanner accountName="크리에이터 소라" />
          <div className="min-h-0 flex-1 p-2">
            <IntroContractBoard state={state} />
          </div>
        </div>
      </div>
    </section>
  );
}

function IntroDashboardTitleBar({
  actionLabel,
  title,
  summary,
}: {
  actionLabel?: string;
  title: string;
  summary?: string;
}) {
  return (
    <div className="border-b border-[#d9e0d9] bg-white px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1">
          <h2 className="truncate text-[17px] font-bold text-[#171a17]">
            {title}
          </h2>
          {summary ? (
            <p className="pb-0.5 text-[12px] font-semibold text-[#7d857f]">
              {summary}
            </p>
          ) : null}
        </div>
        {actionLabel ? (
          <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] border border-blue-600 bg-blue-600 px-3 text-[12px] font-extrabold text-white">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            {actionLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function IntroAdvertiserAccountBanner({
  accountName,
  accountMeta,
}: {
  accountName: string;
  accountMeta: string;
}) {
  return (
    <section className="border-b border-neutral-200 bg-[#fbfbf8] px-4 py-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-neutral-950">
            {accountName}
          </p>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-neutral-500">
            사업자번호 {accountMeta}
          </p>
        </div>
        <span className="inline-flex h-10 shrink-0 items-center rounded-md border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-800">
          정보 보기
        </span>
      </div>
    </section>
  );
}

function IntroInfluencerProfileBanner({ accountName }: { accountName: string }) {
  const verifiedPlatforms = [
    { label: "인스타", platform: "instagram" as const, handle: "@creator_sora" },
    { label: "유튜브", platform: "youtube" as const, handle: "@creator_sora" },
  ];

  return (
    <section className="border-b border-neutral-200 bg-[#fcfcfd] px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-800 ring-1 ring-neutral-200">
          <UserCheck className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-extrabold text-neutral-950">
              {accountName}
            </p>
            <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-extrabold text-blue-700">
              인증 완료
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap gap-1.5">
            {verifiedPlatforms.map((platform) => (
              <span
                key={`${platform.label}:${platform.handle}`}
                className="inline-flex h-5 max-w-[170px] items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 text-[10px] font-bold text-neutral-700"
                title={`${platform.label} ${platform.handle}`}
              >
                <PlatformBrandMark platform={platform.platform} size="xs" />
                <span className="truncate">{platform.handle}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IntroContractBoard({ state }: { state: IntroDashboardState }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white">
      <div className="border-b border-[#d9e0d9] bg-[#ecebe5] px-2 pt-2">
        <div className="flex min-w-0 items-end gap-1">
          {state.tabs.map((tab) => {
            const active = tab.label === state.activeTab;

            return (
            <div
              key={tab.label}
              className={`relative flex h-10 min-w-0 flex-1 items-center justify-between gap-0.5 rounded-t-[10px] border px-1 text-[10px] font-extrabold sm:gap-1 sm:px-3 sm:text-[12px] ${
                active
                  ? "z-10 -mb-px border-[#d9e0d9] border-b-white bg-white text-[#171a17]"
                  : "mb-1 border-transparent bg-[#e5e3dc] text-[#59605b]"
              }`}
            >
              <span className="shrink-0 whitespace-nowrap">{tab.label}</span>
              <span
                className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] sm:h-6 sm:min-w-6 sm:px-1.5 sm:text-[12px] ${
                  active ? "bg-[#171a17] text-white" : "bg-white/80 text-[#303630]"
                }`}
              >
                {tab.count}
              </span>
            </div>
            );
          })}
        </div>
      </div>
      <div className="border-b border-[#d9e0d9] bg-[#fbfbf8] px-3 py-2">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold text-[#171a17]">
              계약 목록
            </p>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-[#606861]">
              {state.rows.length}건 표시 · 전체 조건
            </p>
          </div>
          <span className="inline-flex h-8 items-center rounded-[6px] border border-[#e1e6e1] bg-[#fbfcfa] px-2.5 text-[11px] font-bold text-[#606861]">
            필터
          </span>
        </div>
      </div>
      <IntroContractRows state={state} />
    </section>
  );
}

function IntroContractRows({ state }: { state: IntroDashboardState }) {
  const contractRowsGridClass = state.metricBeforeDate
    ? "grid-cols-[72px_70px_minmax(0,1fr)_88px_96px_108px]"
    : "grid-cols-[72px_70px_minmax(0,1fr)_88px_122px_82px]";

  return (
    <>
      <div className={`hidden ${contractRowsGridClass} gap-2 border-b border-[#d7ddd7] bg-[#f7f8f4] px-3 py-2 text-[11px] font-black tracking-[-0.01em] text-[#303630] md:grid`}>
        <span>플랫폼</span>
        <span>{state.secondaryColumnLabel ?? "브랜드"}</span>
        <span>계약명</span>
        <span>{state.paymentColumnLabel ?? "지급내용"}</span>
        {state.metricBeforeDate ? (
          <>
            <span>{state.metricColumnLabel}</span>
            <span>{state.dateColumnLabel}</span>
          </>
        ) : (
          <>
            <span>{state.dateColumnLabel}</span>
            <span>{state.metricColumnLabel}</span>
          </>
        )}
      </div>
      <div className="hidden min-h-0 flex-1 divide-y divide-[#edf1ed] bg-white md:flex md:flex-col">
        {state.rows.length > 0 ? state.rows.map((row, index) => {
          const metricCell = (
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-extrabold text-neutral-950">
                {row.metric}
              </span>
              {typeof row.metricPercent === "number" ? (
                <span className="mt-1 block h-1.5 max-w-[70px] overflow-hidden rounded-full bg-[#e6ebe6]">
                  <span
                    className="block h-full rounded-full bg-[#171a17]"
                    style={{ width: `${row.metricPercent}%` }}
                  />
                </span>
              ) : null}
            </span>
          );
          const dateParts = getIntroDateRenderParts(row.date);
          const dateCell = dateParts.dday && dateParts.dateLabel ? (
            <span className="truncate text-[10px] font-bold tabular-nums text-neutral-700">
              <span
                className={
                  dateParts.isUrgent
                    ? "font-extrabold text-[#dc2626]"
                    : "text-neutral-700"
                }
              >
                {dateParts.dday}
              </span>
              <span className="text-neutral-400">{" / "}</span>
              <span>{dateParts.dateLabel}</span>
            </span>
          ) : (
            <span className="truncate text-[10px] font-bold tabular-nums text-neutral-700">
              {row.date}
            </span>
          );

          return (
            <div
              key={`${row.platform}-${row.title}-${index}`}
              className={`grid min-h-11 ${contractRowsGridClass} items-center gap-2 bg-white px-3 py-2`}
            >
              <IntroPlatformMarks platform={row.platform} className="h-6" />
              <span className="truncate text-[11px] font-semibold text-neutral-700">
                {row.brand}
              </span>
              <span className="truncate text-[12px] font-extrabold text-neutral-950">
                {row.title}
              </span>
              <span className="truncate text-[11px] font-semibold text-neutral-700">
                {row.payment}
              </span>
              {state.metricBeforeDate ? (
                <>
                  {metricCell}
                  {dateCell}
                </>
              ) : (
                <>
                  {dateCell}
                  {metricCell}
                </>
              )}
            </div>
          );
        }) : (
          <div className="flex min-h-[104px] flex-1 flex-col items-center justify-center bg-white px-3 py-6 text-center">
            <p className="text-[13px] font-extrabold text-neutral-950">
              {state.emptyTitle}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-neutral-500">
              {state.emptyMessage}
            </p>
          </div>
        )}
      </div>
      <div className="grid gap-2 p-2 md:hidden">
        {state.rows.length > 0 ? state.rows.map((row, index) => {
          const dateParts = getIntroDateRenderParts(row.date);

          return (
            <div
              key={`${row.platform}-${row.title}-${index}-mobile`}
              className="rounded-[10px] border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <IntroPlatformMarks platform={row.platform} className="h-6 shrink-0" />
                <span className="text-[10px] font-extrabold text-neutral-600">
                  {row.metric}
                </span>
              </div>
              <p className="mt-2 truncate text-[12px] font-extrabold text-neutral-950">
                {row.title}
              </p>
              <p className="mt-1 truncate text-[10px] font-bold text-neutral-500">
                {row.brand} · {row.payment}
              </p>
              <p className="mt-1 truncate text-[10px] font-bold tabular-nums text-neutral-500">
                {state.dateColumnLabel}{" "}
                {dateParts.dday && dateParts.dateLabel ? (
                  <>
                    <span
                      className={
                        dateParts.isUrgent
                          ? "font-extrabold text-[#dc2626]"
                          : "text-neutral-600"
                      }
                    >
                      {dateParts.dday}
                    </span>
                    <span className="text-neutral-400">{" / "}</span>
                    <span>{dateParts.dateLabel}</span>
                  </>
                ) : (
                  row.date
                )}
              </p>
            </div>
          );
        }) : (
          <div className="rounded-[10px] border border-neutral-200 bg-white px-3 py-6 text-center">
            <p className="text-[13px] font-extrabold text-neutral-950">
              {state.emptyTitle}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-neutral-500">
              {state.emptyMessage}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function getIntroDateRenderParts(value: string) {
  const match = /^(D(?:-\d+|\+\d+)) \/ (20\d{2}\.\d{2}\.\d{2})$/.exec(value);
  if (!match) return { label: value };

  const [, dday, dateLabel] = match;
  const urgentMatch = /^D-(\d+)$/.exec(dday);
  const urgentDays = urgentMatch ? Number(urgentMatch[1]) : Number.POSITIVE_INFINITY;

  return {
    label: value,
    dday,
    dateLabel,
    isUrgent: Number.isFinite(urgentDays) && urgentDays >= 0 && urgentDays <= 3,
  };
}

function _IntroAccountBanner({
  icon,
  title,
  name,
  meta,
  detail,
}: {
  icon: ReactNode;
  title: string;
  name: string;
  meta: string;
  detail: string;
}) {
  const compactBusiness = title === "사업자 인증";

  return (
    <section className="border-b border-neutral-200 bg-[#fbfbf8] px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {!compactBusiness ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-white text-neutral-800 ring-1 ring-neutral-200">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          {compactBusiness ? (
            <>
              <p className="truncate text-[15px] font-bold text-neutral-950">
                {name}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-neutral-500">
                사업자번호 {meta}
              </p>
            </>
          ) : (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="text-[13px] font-bold text-neutral-950">{title}</p>
                <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-700">
                  인증 완료
                </span>
                <span className="max-w-[180px] truncate text-[12px] font-semibold text-neutral-800">
                  {name}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] font-semibold text-neutral-500">
                {[meta, detail].filter(Boolean).join(" · ")}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function _IntroSearchBox({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-extrabold text-[#7d857f]">
        {label}
      </span>
      <span className="flex h-9 items-center gap-1.5 rounded-[7px] border border-[#d9e0d9] bg-white px-2 text-[11px] font-semibold text-[#8b938d]">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{placeholder}</span>
      </span>
    </label>
  );
}

function _IntroFilter({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-extrabold text-[#7d857f]">{label}</p>
      <div className="h-9 truncate rounded-[7px] border border-[#d9e0d9] bg-white px-2 py-2 text-[11px] font-semibold text-[#303630]">
        {value}
      </div>
    </div>
  );
}

function _IntroContractRows({
  rows,
  selectedRowIndex,
}: {
  rows: IntroDashboardRow[];
  selectedRowIndex: number;
}) {
  return (
    <>
      <div className="hidden grid-cols-[72px_minmax(0,1fr)_94px_58px] gap-2 border-b border-[#d9e0d9] bg-[#f8faf7] px-3 py-2 text-[10px] font-extrabold text-[#7d857f] md:grid">
        <span>플랫폼</span>
        <span>계약</span>
        <span>현 단계</span>
        <span>마감</span>
      </div>
      <div className="hidden divide-y divide-[#edf1ed] md:block">
        {rows.map((row, index) => (
          <div
            key={`${row.platform}-${row.title}-${row.status}-${index}`}
            className={`grid grid-cols-[72px_minmax(0,1fr)_94px_58px] items-center gap-2 px-3 py-2.5 ${
              index === selectedRowIndex ? "bg-blue-50/45" : "bg-white"
            }`}
          >
            <IntroPlatformMarks platform={row.platform} className="h-6" />
            <span className="truncate text-[12px] font-extrabold text-neutral-950">
              {row.party} · {row.title}
            </span>
            <span
              className={`inline-flex h-6 w-fit max-w-full items-center truncate rounded-[7px] border px-2 text-[10px] font-extrabold ${row.statusClass}`}
            >
              {row.status}
            </span>
            <span className="truncate text-[11px] font-extrabold text-neutral-700">
              {row.deadline}
            </span>
          </div>
        ))}
      </div>
      <div className="grid gap-2 p-2 md:hidden">
        {rows.slice(0, 4).map((row, index) => (
          <div
            key={`${row.platform}-${row.title}-${row.status}-${index}-mobile`}
            className={`rounded-[10px] border border-neutral-200 p-3 ${
              index === selectedRowIndex ? "bg-blue-50/45" : "bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <IntroPlatformMarks platform={row.platform} className="h-6 shrink-0" />
              <span
                className={`inline-flex h-6 max-w-[92px] items-center truncate rounded-[7px] border px-2 text-[10px] font-extrabold ${row.statusClass}`}
              >
                {row.status}
              </span>
            </div>
            <p className="mt-2 truncate text-[12px] font-extrabold text-neutral-950">
              {row.title}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-extrabold text-neutral-500">
              <span className="truncate">{row.party}</span>
              <span className="shrink-0 text-neutral-800">{row.amount}</span>
            </div>
            <p className="mt-1 truncate text-[10px] font-bold text-neutral-400">
              {row.note} · {row.deadline}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

function RoleProposalPreview({
  slide,
  role,
  panelId,
}: {
  slide: RoleIntroSlide;
  preview: RolePreviewProposal;
  role: IntroRole;
  panelId: string;
}) {
  return (
    <RoleDashboardStylePreview
      panelId={panelId}
      role={role}
      slide={slide}
    />
  );
}

function RoleContractPreview({
  slide,
  role,
  panelId,
}: {
  slide: RoleIntroSlide;
  preview: RolePreviewContract;
  role: IntroRole;
  panelId: string;
}) {
  return (
    <RoleDashboardStylePreview
      panelId={panelId}
      role={role}
      slide={slide}
    />
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
            className="inline-flex h-10 items-center rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-bold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
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
              <span>시작하기</span>
              <span
                aria-hidden="true"
                className="text-[15px] leading-none transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
            <Link
              to="/influencer/campaigns"
              className="inline-flex h-11 items-center justify-center rounded-[14px] border border-neutral-200 bg-white px-5 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              모집 캠페인 둘러보기
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
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2.5 bg-[#fbfaf7] p-3 sm:space-y-0 sm:bg-white sm:p-0">
        <div className="hidden grid-cols-[minmax(0,0.82fr)_minmax(0,0.9fr)_minmax(0,1.08fr)_104px] gap-3 border-b border-neutral-200 bg-[#f7f8f4] px-4 py-2.5 text-[11px] font-black tracking-[-0.01em] text-neutral-700 sm:grid sm:px-5">
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
                <MobilePreviewPlatformMeta
                  detail={`${item.accountName} / ${item.accountId}`}
                  platform={item.platform}
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
              <IntroPlatformMarks platform={item.platform} className="h-5" />
              <p className="mt-1.5 truncate text-[10px] font-bold tracking-[-0.005em] text-neutral-400">
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
            className="inline-flex h-10 items-center rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-bold text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
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
              <span>시작하기</span>
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
        <div className="hidden grid-cols-[minmax(0,1.55fr)_minmax(0,0.95fr)_104px] gap-3 border-b border-neutral-200 bg-[#f7f8f4] px-4 py-2.5 text-[11px] font-black tracking-[-0.01em] text-neutral-700 sm:grid sm:px-5">
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

function MobilePreviewPlatformMeta({
  platform,
  detail,
}: {
  platform: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-[6px] bg-[#f8f7f4] px-3 py-2">
      <p className="text-[10px] font-extrabold text-neutral-400">플랫폼</p>
      <div className="mt-1 flex h-5 items-center">
        <IntroPlatformMarks platform={platform} />
      </div>
      <p className="mt-0.5 truncate text-[10px] font-bold text-neutral-400">
        {detail}
      </p>
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
      className="yl-brand-action -ml-1 flex min-h-10 min-w-10 items-center gap-3 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171a17]"
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
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[#7d857f]">
                    <IntroPlatformMarks platform={row.platform} />
                    <span className="truncate">{row.due}</span>
                  </div>
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
          <Link
            className="transition hover:text-[#171a17]"
              to="/resources"
          >
            계약 가이드
          </Link>
          <Link className="transition hover:text-[#171a17]" to="/support">
            문의
          </Link>
        </nav>
      </div>
    </footer>
  );
}
