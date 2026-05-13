import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAppStore,
  Contract,
  ContractPlatform,
  ContractStatus,
  ContractType,
  Clause,
} from "../../store";
import { createShareToken } from "../../domain/contracts";
import { buildContractShareUrl } from "../../domain/links";
import {
  verificationStatusLabel,
  verificationStatusTone,
} from "../../domain/verification";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { PRODUCT_NAME } from "../../domain/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { apiFetch } from "../../domain/api";

type StepId = 1 | 2 | 3 | 4 | 5;
type ResultMode = "draft" | "share";

interface ContractDraft {
  advertiserName: string;
  advertiserManager: string;
  title: string;
  type: ContractType;
  influencerName: string;
  influencerUrl: string;
  influencerContact: string;
  channels: string[];
  channelDetails: Record<string, { postCount: string; duration: string }>;
  hasOtherChannel: boolean;
  otherChannel: string;
  otherChannelDetails: {
    postCount: string;
    duration: string;
  };
  campaignStart: string;
  campaignEnd: string;
  uploadDueDate: string;
  reviewDueDate: string;
  revisionLimit: string;
  disclosureText: string;
  trackingLink: string;
  exclusivity: string;
  payment: string;
  customClauses: { id: string; category: string; content: string }[];
  newClauseCategory: string;
  newClauseContent: string;
}

interface ValidationError {
  field: string;
  message: string;
  step: StepId;
}

const STEPS: Array<{ s: StepId; label: string }> = [
  { s: 1, label: "기본 정보" },
  { s: 2, label: "채널 조건" },
  { s: 3, label: "일정 및 지급" },
  { s: 4, label: "특약 사항" },
  { s: 5, label: "발송 전 확인" },
];

const CHANNEL_OPTIONS = [
  "인스타그램 피드",
  "인스타그램 릴스",
  "인스타그램 스토리",
  "유튜브 숏츠",
  "유튜브 일반영상",
  "네이버 블로그",
  "틱톡",
  "기타 커뮤니티",
];

const INITIAL_DRAFT: ContractDraft = {
  advertiserName: "",
  advertiserManager: "",
  title: "",
  type: "협찬",
  influencerName: "",
  influencerUrl: "",
  influencerContact: "",
  channels: [],
  channelDetails: {},
  hasOtherChannel: false,
  otherChannel: "",
  otherChannelDetails: {
    postCount: "",
    duration: "",
  },
  campaignStart: "",
  campaignEnd: "",
  uploadDueDate: "",
  reviewDueDate: "",
  revisionLimit: "",
  disclosureText: "콘텐츠 제목 또는 본문 첫 부분에 '유료광고' 또는 '#광고'를 명확히 표시",
  trackingLink: "",
  exclusivity: "",
  payment: "",
  customClauses: [],
  newClauseCategory: "",
  newClauseContent: "",
};

const isBlank = (value?: string) => !value || value.trim().length === 0;
const REQUIRED_DISCLOSURE_PATTERN = /광고|유료|협찬|대가|sponsored|ad/i;

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const getDeliverableRows = (draft: ContractDraft) => {
  const selectedRows = draft.channels.map((channel) => ({
    channel,
    postCount: draft.channelDetails[channel]?.postCount ?? "",
    duration: draft.channelDetails[channel]?.duration ?? "",
  }));

  if (draft.hasOtherChannel) {
    selectedRows.push({
      channel: draft.otherChannel.trim(),
      postCount: draft.otherChannelDetails.postCount,
      duration: draft.otherChannelDetails.duration,
    });
  }

  return selectedRows;
};

const getSelectedPlatforms = (draft: ContractDraft): ContractPlatform[] => {
  const platforms = new Set<ContractPlatform>();
  const allChannels = [
    ...draft.channels,
    draft.hasOtherChannel ? draft.otherChannel : "",
    draft.influencerUrl,
  ].map((channel) => channel.toLowerCase());

  allChannels.forEach((channel) => {
    if (channel.includes("인스타") || channel.includes("instagram")) {
      platforms.add("INSTAGRAM");
    } else if (channel.includes("유튜브") || channel.includes("youtube")) {
      platforms.add("YOUTUBE");
    } else if (channel.includes("틱톡") || channel.includes("tiktok")) {
      platforms.add("TIKTOK");
    } else if (
      channel.includes("블로그") ||
      channel.includes("blog") ||
      channel.includes("naver")
    ) {
      platforms.add("NAVER_BLOG");
    } else if (channel.trim()) {
      platforms.add("OTHER");
    }
  });

  return Array.from(platforms);
};

const buildContractClauses = (draft: ContractDraft): Clause[] => {
  const clauses: Clause[] = [];
  const deliverables = getDeliverableRows(draft)
    .filter((row) => row.channel)
    .map(
      (row) =>
        `- ${row.channel}: 업로드 ${row.postCount || "입력 필요"}, 유지기간 ${
          row.duration || "입력 필요"
        }`,
    );

  if (deliverables.length > 0) {
    clauses.push({
      clause_id: "draft_deliverables",
      category: "제공 매체 및 업로드 조건",
      content: `본 계약에 따라 인플루언서는 다음 매체에 정해진 건수의 콘텐츠를 업로드하고 지정된 기간 동안 유지해야 한다:\n${deliverables.join(
        "\n",
      )}`,
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  if (
    draft.campaignStart ||
    draft.campaignEnd ||
    draft.uploadDueDate ||
    draft.reviewDueDate ||
    draft.revisionLimit
  ) {
    clauses.push({
      clause_id: "draft_schedule",
      category: "캠페인 일정 및 검수",
      content: [
        `캠페인 기간: ${draft.campaignStart || "입력 필요"} ~ ${
          draft.campaignEnd || "입력 필요"
        }`,
        `콘텐츠 업로드 마감: ${draft.uploadDueDate || "입력 필요"}`,
        `광고주 검수 회신 기한: ${draft.reviewDueDate || "입력 필요"}`,
        `수정 가능 횟수: ${draft.revisionLimit || "입력 필요"}`,
      ].join("\n"),
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  if (draft.disclosureText || draft.trackingLink) {
    clauses.push({
      clause_id: "draft_disclosure",
      category: "광고 표시 및 추적 조건",
      content: [
        `광고 표시 문구: ${draft.disclosureText || "입력 필요"}`,
        "광고주와 인플루언서는 경제적 이해관계가 소비자에게 명확히 인식되도록 콘텐츠의 제목, 본문 첫 부분, 영상 설명 또는 플랫폼상 쉽게 확인 가능한 위치에 광고 표시를 유지해야 한다.",
        "플랫폼 정책이나 관계 법령상 더 엄격한 표시가 필요한 경우 그 기준을 우선 적용한다.",
        draft.trackingLink ? `필수 링크/쿠폰/해시태그: ${draft.trackingLink}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  if (draft.exclusivity) {
    clauses.push({
      clause_id: "draft_exclusivity",
      category: "경쟁사 배제",
      content: `업로드 후 다음 조건에 따라 동종 업계의 타 브랜드 광고를 진행하지 아니한다: ${draft.exclusivity}`,
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  if (draft.payment) {
    clauses.push({
      clause_id: "draft_payment",
      category: "대가 지급",
      content: `본 계약의 대가로 광고주는 인플루언서에게 다음과 같이 지급한다: ${draft.payment}`,
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  draft.customClauses.forEach((clause) => {
    clauses.push({
      clause_id: clause.id,
      category: clause.category || "기타 특약",
      content: clause.content,
      status: "PENDING_REVIEW",
      history: [],
    });
  });

  return clauses;
};

const validateContractDraft = (draft: ContractDraft): ValidationError[] => {
  const errors: ValidationError[] = [];

  const requireField = (step: StepId, field: string, value: string, message: string) => {
    if (isBlank(value)) errors.push({ step, field, message });
  };

  requireField(1, "advertiserName", draft.advertiserName, "광고주/브랜드명을 입력하세요.");
  requireField(1, "title", draft.title, "계약 건명을 입력하세요.");
  requireField(1, "influencerName", draft.influencerName, "인플루언서명 또는 채널명을 입력하세요.");
  requireField(1, "influencerUrl", draft.influencerUrl, "메인 채널 URL을 입력하세요.");
  requireField(1, "influencerContact", draft.influencerContact, "연락처를 입력하세요.");

  if (
    !isBlank(draft.influencerContact) &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.influencerContact.trim())
  ) {
    errors.push({
      step: 1,
      field: "influencerContact",
      message: "서명 계정 확인을 위해 인플루언서 이메일을 입력하세요.",
    });
  }

  if (!isBlank(draft.influencerUrl) && !isHttpUrl(draft.influencerUrl)) {
    errors.push({
      step: 1,
      field: "influencerUrl",
      message: "메인 채널 URL은 http 또는 https 주소여야 합니다.",
    });
  }

  if (!isBlank(draft.trackingLink) && !isHttpUrl(draft.trackingLink)) {
    errors.push({
      step: 3,
      field: "trackingLink",
      message: "추적 링크는 http 또는 https 주소만 입력할 수 있습니다.",
    });
  }

  const deliverables = getDeliverableRows(draft);
  if (deliverables.length === 0) {
    errors.push({
      step: 2,
      field: "channels",
      message: "계약에 포함할 플랫폼을 최소 1개 선택하세요.",
    });
  }

  draft.channels.forEach((channel) => {
    const details = draft.channelDetails[channel];
    requireField(2, `${channel}.postCount`, details?.postCount ?? "", `${channel} 업로드 건수를 입력하세요.`);
    requireField(2, `${channel}.duration`, details?.duration ?? "", `${channel} 게시물 유지 기간을 입력하세요.`);
  });

  if (draft.hasOtherChannel) {
    requireField(2, "otherChannel", draft.otherChannel, "기타 매체명을 입력하세요.");
    requireField(2, "otherChannel.postCount", draft.otherChannelDetails.postCount, "기타 매체 업로드 건수를 입력하세요.");
    requireField(2, "otherChannel.duration", draft.otherChannelDetails.duration, "기타 매체 게시물 유지 기간을 입력하세요.");
  }

  requireField(3, "campaignStart", draft.campaignStart, "캠페인 시작일을 입력하세요.");
  requireField(3, "campaignEnd", draft.campaignEnd, "캠페인 종료일을 입력하세요.");
  requireField(3, "uploadDueDate", draft.uploadDueDate, "콘텐츠 업로드 마감일을 입력하세요.");
  requireField(3, "reviewDueDate", draft.reviewDueDate, "광고주 검수 회신 기한을 입력하세요.");
  requireField(3, "revisionLimit", draft.revisionLimit, "수정 가능 횟수를 입력하세요.");
  requireField(3, "payment", draft.payment, "지급 조건을 입력하세요.");
  requireField(3, "disclosureText", draft.disclosureText, "광고 표시 조건을 입력하세요.");

  if (
    !isBlank(draft.disclosureText) &&
    !REQUIRED_DISCLOSURE_PATTERN.test(draft.disclosureText)
  ) {
    errors.push({
      step: 3,
      field: "disclosureText",
      message: "광고 표시 조건에는 #광고, 유료광고, 협찬 등 대가 표시 문구가 포함되어야 합니다.",
    });
  }

  if (draft.campaignStart && draft.campaignEnd && draft.campaignEnd < draft.campaignStart) {
    errors.push({
      step: 3,
      field: "campaignEnd",
      message: "캠페인 종료일은 시작일 이후여야 합니다.",
    });
  }

  if (buildContractClauses(draft).length === 0) {
    errors.push({
      step: 5,
      field: "clauses",
      message: "계약서에 들어갈 조항이 없습니다.",
    });
  }

  return errors;
};

const buildWorkflow = (status: ContractStatus): Contract["workflow"] => {
  if (status === "DRAFT") {
    return {
      next_actor: "advertiser",
      next_action: "발송 전 확인에서 누락 조건을 점검하고 공유 링크를 생성하세요.",
      due_at: addDays(3),
      risk_level: "low",
      last_message: "계약 초안이 저장되었습니다.",
    };
  }

  return {
    next_actor: "influencer",
    next_action: "인플루언서 검토 응답을 기다리는 중입니다.",
    due_at: addDays(2),
    risk_level: "medium",
    last_message: "공유 링크가 발급되어 상대방 검토를 기다리고 있습니다.",
  };
};

export function ContractBuilder() {
  const navigate = useNavigate();
  const addContract = useAppStore((state) => state.addContract);
  const updateContract = useAppStore((state) => state.updateContract);
  const getContract = useAppStore((state) => state.getContract);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const syncError = useAppStore((state) => state.syncError);
  const resetHydration = useAppStore((state) => state.resetHydration);
  const { summary: verificationSummary, isLoading: isVerificationLoading } =
    useVerificationSummary({ role: "advertiser" });
  const advertiserVerificationStatus =
    verificationSummary?.advertiser.status ?? "not_submitted";
  const canSendContract = advertiserVerificationStatus === "approved";

  const [step, setStep] = useState<StepId>(1);
  const [draft, setDraft] = useState<ContractDraft>(INITIAL_DRAFT);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [savedContractId, setSavedContractId] = useState("");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [result, setResult] = useState<{
    mode: ResultMode;
    link?: string;
    stale?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const clauses = useMemo(() => buildContractClauses(draft), [draft]);
  const allErrors = useMemo(() => validateContractDraft(draft), [draft]);
  const stepErrors = validationErrors.filter((error) => error.step === step);
  const currentStepHasBlockingError = allErrors.some((error) => error.step === step);
  const shareResultState =
    result?.mode === "share"
      ? syncError
        ? "error"
        : isSyncing
          ? "syncing"
          : "ready"
      : undefined;

  const updateDraft = (
    updater: Partial<ContractDraft> | ((current: ContractDraft) => ContractDraft),
  ) => {
    setDraft((current) =>
      typeof updater === "function" ? updater(current) : { ...current, ...updater },
    );
    setValidationErrors([]);
    setResult((current) => (current?.mode === "share" ? { ...current, stale: true } : current));
  };

  const handleChannelToggle = (channel: string) => {
    updateDraft((current) => {
      if (current.channels.includes(channel)) {
        const nextChannels = current.channels.filter((item) => item !== channel);
        const nextDetails = { ...current.channelDetails };
        delete nextDetails[channel];
        return { ...current, channels: nextChannels, channelDetails: nextDetails };
      }

      return { ...current, channels: [...current.channels, channel] };
    });
  };

  const handleChannelDetailChange = (
    channel: string,
    field: "postCount" | "duration",
    value: string,
  ) => {
    updateDraft((current) => ({
      ...current,
      channelDetails: {
        ...current.channelDetails,
        [channel]: {
          ...current.channelDetails[channel],
          [field]: value,
        },
      },
    }));
  };

  const handleOtherChannelToggle = (checked: boolean) => {
    updateDraft((current) => ({
      ...current,
      hasOtherChannel: checked,
      otherChannel: checked ? current.otherChannel : "",
      otherChannelDetails: checked
        ? current.otherChannelDetails
        : { postCount: "", duration: "" },
    }));
  };

  const addCustomClause = () => {
    if (!draft.newClauseContent.trim()) return;

    updateDraft((current) => ({
      ...current,
      customClauses: [
        ...current.customClauses,
        {
          id: `custom_${Date.now()}`,
          category: current.newClauseCategory.trim() || "기타 특약",
          content: current.newClauseContent.trim(),
        },
      ],
      newClauseCategory: "",
      newClauseContent: "",
    }));
  };

  const addTemplateClause = (type: "delivery" | "cs") => {
    const category =
      type === "delivery" ? "배송 및 파손 책임" : "고객 CS 및 교환/환불";
    const content =
      type === "delivery"
        ? "제품의 배송, 설치 및 회수 과정에서 발생하는 파손의 책임은 공급사 또는 광고주가 부담한다."
        : "제품의 AS 및 불량 문제로 인한 교환/환불 응대는 광고주가 정한 담당 창구에서 처리한다.";

    updateDraft((current) => {
      const exists = current.customClauses.some(
        (clause) => clause.category === category && clause.content === content,
      );
      if (exists) return current;

      return {
        ...current,
        customClauses: [
          ...current.customClauses,
          { id: `template_${type}`, category, content },
        ],
      };
    });
  };

  const removeCustomClause = (id: string) => {
    updateDraft((current) => ({
      ...current,
      customClauses: current.customClauses.filter((clause) => clause.id !== id),
    }));
  };

  const goNext = () => {
    const nextErrors = validateContractDraft(draft).filter(
      (error) => error.step === step,
    );

    if (nextErrors.length > 0) {
      setValidationErrors(nextErrors);
      return;
    }

    setValidationErrors([]);
    setStep((current) => Math.min(current + 1, 5) as StepId);
  };

  const goBack = () => {
    setValidationErrors([]);
    setStep((current) => Math.max(current - 1, 1) as StepId);
  };

  const buildContractPayload = (
    status: ContractStatus,
    shareToken?: string,
  ): Omit<Contract, "id" | "created_at" | "updated_at"> => ({
    advertiser_id: "adv_1",
    advertiser_info: {
      name: draft.advertiserName.trim(),
      manager: draft.advertiserManager.trim() || undefined,
    },
    title: draft.title.trim(),
    type: draft.type,
    status,
    influencer_info: {
      name: draft.influencerName.trim(),
      channel_url: draft.influencerUrl.trim(),
      contact: draft.influencerContact.trim(),
    },
    campaign: {
      budget: draft.payment.trim(),
      start_date: draft.campaignStart,
      end_date: draft.campaignEnd,
      upload_due_at: draft.uploadDueDate,
      review_due_at: draft.reviewDueDate,
      revision_limit: draft.revisionLimit.trim(),
      disclosure_text: draft.disclosureText.trim(),
      tracking_link: draft.trackingLink.trim() || undefined,
      period:
        draft.campaignStart && draft.campaignEnd
          ? `${draft.campaignStart} - ${draft.campaignEnd}`
          : undefined,
      platforms: getSelectedPlatforms(draft),
      deliverables: getDeliverableRows(draft)
        .filter((row) => row.channel)
        .map((row) => `${row.channel} ${row.postCount} / ${row.duration}`),
    },
    workflow: buildWorkflow(status),
    evidence: {
      share_token_status: status === "DRAFT" ? "not_issued" : "active",
      share_token: status === "DRAFT" ? undefined : shareToken,
      share_token_expires_at: status === "DRAFT" ? undefined : addDays(7),
      audit_ready: status !== "DRAFT",
      pdf_status: status === "DRAFT" ? "not_ready" : "draft_ready",
    },
    audit_events: [],
    clauses,
  });

  const saveContract = (mode: ResultMode) => {
    if (mode === "share" && !canSendContract) {
      setStep(5);
      setValidationErrors([
        {
          field: "advertiser_verification",
          message: "광고주 사업자 인증 승인 후 계약을 발송할 수 있습니다.",
          step: 5,
        },
      ]);
      return;
    }

    const errors = validateContractDraft(draft);

    if (errors.length > 0) {
      setValidationErrors(errors);
      setStep(errors[0].step);
      return;
    }

    const status: ContractStatus = mode === "draft" ? "DRAFT" : "REVIEWING";
    const existing = savedContractId ? getContract(savedContractId) : undefined;
    const shareToken =
      status === "DRAFT"
        ? undefined
        : (existing?.evidence?.share_token ?? createShareToken());
    const payload = buildContractPayload(status, shareToken);
    const now = new Date().toISOString();
    const event = {
      id: `audit_${Date.now()}`,
      actor: "advertiser" as const,
      action: mode === "draft" ? "draft_saved" : "share_link_issued",
      description:
        mode === "draft"
          ? "광고주가 계약 초안을 저장했습니다."
          : "광고주가 발송 전 확인을 마치고 공유 링크를 생성했습니다.",
      created_at: now,
    };

    let contractId = existing?.id;
    if (existing) {
      updateContract(existing.id, {
        ...payload,
        audit_events: [...(existing.audit_events ?? []), event],
      });
    } else {
      const created = addContract({
        ...payload,
        audit_events: [event],
      });
      contractId = created.id;
      setSavedContractId(created.id);
    }

    const link =
      mode === "share" && contractId
        ? buildContractShareUrl(contractId, payload.evidence?.share_token)
        : undefined;
    setResult({ mode, link, stale: false });
  };

  const copyToClipboard = () => {
    if (!result?.link || result.stale || isSyncing || syncError) return;
    navigator.clipboard.writeText(result.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleLogout = async () => {
    try {
      await apiFetch("/api/advertiser/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn("[Yeollock] advertiser logout request failed", error);
    } finally {
      resetHydration();
      navigate("/login/advertiser", { replace: true });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f7f6f3] font-sans text-neutral-950 lg:h-[100dvh] lg:overflow-hidden">
      <header className="z-10 flex h-[68px] shrink-0 items-center justify-between border-b border-neutral-200/80 bg-[#f7f6f3]/95 px-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-neutral-200 bg-white/75 text-neutral-500 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950"
            aria-label="대시보드로 돌아가기"
          >
            <ArrowLeft strokeWidth={1.5} className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="font-neo-heavy text-[18px] leading-none text-neutral-950">
              {PRODUCT_NAME}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-neutral-200 bg-white/75 px-3 text-[13px] font-semibold text-neutral-600 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950"
          aria-label="로그아웃"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.8} />
          <span className="hidden sm:inline">로그아웃</span>
        </button>
      </header>

      <main className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(400px,500px)_minmax(0,1fr)] lg:gap-4 lg:overflow-hidden lg:px-5 lg:pb-5 xl:grid-cols-[200px_minmax(400px,480px)_minmax(460px,1fr)]">
        <aside className="relative z-10 hidden min-h-0 flex-col gap-10 overflow-y-auto border border-neutral-200/90 bg-white/95 p-5 shadow-[0_1px_0_rgba(15,23,42,0.035),0_18px_46px_rgba(15,23,42,0.05)] xl:mt-5 xl:flex xl:rounded-[16px]">
          <div>
            <h3 className="mb-10 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
              계약 작성
            </h3>
            <nav className="relative space-y-8">
              <div className="absolute bottom-6 left-[11px] top-6 z-0 w-px bg-neutral-100" />
              {STEPS.map((item) => (
                <div
                  key={item.s}
                  className={`relative z-10 flex items-center gap-6 transition-all duration-300 ${
                    step === item.s
                      ? "translate-x-2 text-neutral-900"
                      : step > item.s
                        ? "text-neutral-900"
                        : "text-neutral-400"
                  }`}
                >
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] transition-all duration-300 ${
                      step === item.s
                        ? "border border-neutral-900 bg-white text-neutral-900 ring-4 ring-[#ebe6dc]"
                        : step > item.s
                          ? "bg-neutral-900 text-white"
                          : "border border-neutral-200 bg-white text-neutral-300"
                    }`}
                  >
                    {step > item.s ? <Check strokeWidth={3} className="h-3 w-3" /> : item.s}
                  </div>
                  <span className={`text-[13px] font-medium tracking-wide ${step === item.s ? "font-semibold" : ""}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <section className="contract-builder-surface relative z-0 min-h-0 w-full bg-transparent lg:overflow-hidden">
          <div className="mx-auto flex h-full max-w-[520px] flex-col p-6 md:p-10 lg:px-1 lg:py-5">
            <div className="custom-scrollbar min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                {step} / 5 단계
              </p>
              <h1 className="font-neo-heavy mb-3 text-[28px] leading-tight text-neutral-950 lg:text-[30px]">
                새 전자계약서 작성
              </h1>
              <p className="mb-6 text-[13px] leading-relaxed text-neutral-500">
                핵심 조건을 구조화하고 발송 전 체크리스트를 통과한 뒤 공유 링크를 생성합니다.
              </p>

              <div className="mb-5 rounded-[16px] border border-neutral-200/90 bg-white/95 p-3.5 shadow-[0_1px_0_rgba(15,23,42,0.035),0_14px_34px_rgba(15,23,42,0.035)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      광고주 인증 상태
                    </p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                      {canSendContract
                        ? "계약 공유 링크를 생성하고 인플루언서에게 발송할 수 있습니다."
                        : "승인 전에는 초안 저장만 가능하고 공유 링크 발송은 차단됩니다."}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${verificationStatusTone(
                      advertiserVerificationStatus,
                    )}`}
                  >
                    {isVerificationLoading
                      ? "확인중"
                      : verificationStatusLabel(advertiserVerificationStatus)}
                  </span>
                </div>
                {!canSendContract && !isVerificationLoading && (
                  <button
                    type="button"
                    onClick={() => navigate("/advertiser/verification")}
                    className="mt-3 h-9 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
                  >
                    사업자 인증 요청하기
                  </button>
                )}
              </div>

              {stepErrors.length > 0 && <ValidationSummary errors={stepErrors} />}

              <div className="space-y-5">
              {step === 1 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-4">
                  <div>
                    <Label>계약 유형</Label>
                    <Select
                      value={draft.type}
                      onValueChange={(value) =>
                        updateDraft({ type: value as ContractType })
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="협찬">제품 협찬</SelectItem>
                        <SelectItem value="PPL">유료 광고 (PPL)</SelectItem>
                        <SelectItem value="공동구매">공동구매</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>광고주/브랜드명</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 다이렉트뷰티"
                      value={draft.advertiserName}
                      onChange={(event) =>
                        updateDraft({ advertiserName: event.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label>담당자명</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 김마케팅 매니저"
                      value={draft.advertiserManager}
                      onChange={(event) =>
                        updateDraft({ advertiserManager: event.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label>계약 건명</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 5월 선크림 숏폼 PPL 계약"
                      value={draft.title}
                      onChange={(event) => updateDraft({ title: event.target.value })}
                    />
                  </div>

                  <div className="border-t border-neutral-100 pt-3">
                    <h3 className="mb-3 text-sm font-medium">인플루언서 정보</h3>
                    <div className="space-y-3">
                      <div>
                        <Label>성명 또는 채널명</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="예: 뷰티온에어"
                          value={draft.influencerName}
                          onChange={(event) =>
                            updateDraft({ influencerName: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>메인 채널 URL</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="https://instagram.com/..."
                          value={draft.influencerUrl}
                          onChange={(event) =>
                            updateDraft({ influencerUrl: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>연락처</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="creator@brand.co.kr"
                          value={draft.influencerContact}
                          onChange={(event) =>
                            updateDraft({ influencerContact: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div>
                    <Label className="mb-3 block">대상 플랫폼 및 콘텐츠 포맷</Label>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {CHANNEL_OPTIONS.map((channel) => (
                        <div
                          key={channel}
                          className={`rounded-[14px] border transition-colors ${
                            draft.channels.includes(channel)
                              ? "border-neutral-900 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                              : "border-neutral-200 bg-white/75"
                          }`}
                        >
                          <label className="flex cursor-pointer items-start p-3">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900"
                              checked={draft.channels.includes(channel)}
                              onChange={() => handleChannelToggle(channel)}
                            />
                            <span className="ml-3 text-sm font-medium">{channel}</span>
                          </label>
                          {draft.channels.includes(channel) && (
                            <div className="ml-7 grid grid-cols-1 gap-2 px-3 pb-3">
                              <div>
                                <Label className="text-xs text-neutral-500">
                                  업로드 건수
                                </Label>
                                <Input
                                  className="mt-1 h-8 bg-white text-xs"
                                  placeholder="예: 2회"
                                  value={draft.channelDetails[channel]?.postCount || ""}
                                  onChange={(event) =>
                                    handleChannelDetailChange(
                                      channel,
                                      "postCount",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-neutral-500">
                                  게시물 유지 기간
                                </Label>
                                <Input
                                  className="mt-1 h-8 bg-white text-xs"
                                  placeholder="예: 3개월"
                                  value={draft.channelDetails[channel]?.duration || ""}
                                  onChange={(event) =>
                                    handleChannelDetailChange(
                                      channel,
                                      "duration",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className={`rounded-[14px] border bg-white transition-colors ${
                      draft.hasOtherChannel
                        ? "border-neutral-900 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                        : "border-neutral-200"
                    }`}
                  >
                    <label className="flex cursor-pointer items-start p-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900"
                        checked={draft.hasOtherChannel}
                        onChange={(event) => handleOtherChannelToggle(event.target.checked)}
                      />
                      <span className="ml-3 text-sm font-medium">기타 매체 직접 입력</span>
                    </label>
                    {draft.hasOtherChannel && (
                      <div className="ml-7 grid grid-cols-1 gap-3 px-3 pb-3">
                        <div>
                          <Label className="text-xs text-neutral-500">매체명</Label>
                          <Input
                            className="mt-1 h-8 bg-white text-xs"
                            placeholder="예: 네이버 카페, 커뮤니티"
                            value={draft.otherChannel}
                            onChange={(event) =>
                              updateDraft({ otherChannel: event.target.value })
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-neutral-500">
                              업로드 건수
                            </Label>
                            <Input
                              className="mt-1 h-8 bg-white text-xs"
                              placeholder="예: 1회"
                              value={draft.otherChannelDetails.postCount}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  otherChannelDetails: {
                                    ...current.otherChannelDetails,
                                    postCount: event.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-neutral-500">
                              게시물 유지 기간
                            </Label>
                            <Input
                              className="mt-1 h-8 bg-white text-xs"
                              placeholder="예: 6개월"
                              value={draft.otherChannelDetails.duration}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  otherChannelDetails: {
                                    ...current.otherChannelDetails,
                                    duration: event.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {step === 3 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>캠페인 시작일</Label>
                      <Input
                        type="date"
                        className="mt-1.5"
                        value={draft.campaignStart}
                        onChange={(event) =>
                          updateDraft({ campaignStart: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>캠페인 종료일</Label>
                      <Input
                        type="date"
                        className="mt-1.5"
                        value={draft.campaignEnd}
                        onChange={(event) =>
                          updateDraft({ campaignEnd: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>업로드 마감일</Label>
                      <Input
                        type="date"
                        className="mt-1.5"
                        value={draft.uploadDueDate}
                        onChange={(event) =>
                          updateDraft({ uploadDueDate: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>검수 회신 기한</Label>
                      <Input
                        type="date"
                        className="mt-1.5"
                        value={draft.reviewDueDate}
                        onChange={(event) =>
                          updateDraft({ reviewDueDate: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label>수정 가능 횟수</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 최대 2회"
                      value={draft.revisionLimit}
                      onChange={(event) =>
                        updateDraft({ revisionLimit: event.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label>광고 표시 조건</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 본문 첫 줄에 유료광고 또는 #광고 표기"
                      value={draft.disclosureText}
                      onChange={(event) =>
                        updateDraft({ disclosureText: event.target.value })
                      }
                    />
                    <p className="mt-2 text-[12px] leading-5 text-neutral-500">
                      소비자가 쉽게 볼 수 있는 위치에 경제적 이해관계가 드러나는 문구를
                      포함해야 합니다.
                    </p>
                  </div>

                  <div>
                    <Label>쿠폰/링크/해시태그</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: #브랜드명 #AD / 쿠폰코드 SUN20"
                      value={draft.trackingLink}
                      onChange={(event) => updateDraft({ trackingLink: event.target.value })}
                    />
                  </div>

                  <div>
                    <Label>경쟁사 배제 조건</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 업로드 후 2개월간 동종 선케어 브랜드 광고 불가"
                      value={draft.exclusivity}
                      onChange={(event) => updateDraft({ exclusivity: event.target.value })}
                    />
                  </div>

                  <div>
                    <Label>지급 조건</Label>
                    <Textarea
                      className="mt-1.5 min-h-[110px]"
                      placeholder="예: 총 1,200,000원, 세금계산서 수령 후 7영업일 내 지급"
                      value={draft.payment}
                      onChange={(event) => updateDraft({ payment: event.target.value })}
                    />
                  </div>
                </section>
              )}

              {step === 4 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div>
                    <Label className="mb-2 block">즐겨찾는 기본 특약 추가</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addTemplateClause("delivery")}
                        className="rounded-[12px] text-xs"
                      >
                        <Plus className="mr-1 h-3 w-3" /> 파손 책임
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addTemplateClause("cs")}
                        className="rounded-[12px] text-xs"
                      >
                        <Plus className="mr-1 h-3 w-3" /> 고객 CS 전담
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-neutral-200/90 bg-white/95 p-4 shadow-[0_1px_0_rgba(15,23,42,0.035),0_16px_42px_rgba(15,23,42,0.035)]">
                    <h3 className="mb-3 text-sm font-semibold">직접 특약 추가</h3>
                    <div className="space-y-3">
                      <Input
                        placeholder="조항 카테고리 (예: 비밀유지)"
                        value={draft.newClauseCategory}
                        onChange={(event) =>
                          updateDraft({ newClauseCategory: event.target.value })
                        }
                      />
                      <Textarea
                        placeholder="세부 내용을 입력하세요"
                        value={draft.newClauseContent}
                        onChange={(event) =>
                          updateDraft({ newClauseContent: event.target.value })
                        }
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full rounded-[12px]"
                        onClick={addCustomClause}
                        disabled={!draft.newClauseContent.trim()}
                      >
                        조항 추가하기
                      </Button>
                    </div>
                  </div>

                  {draft.customClauses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
                        추가된 특약
                      </p>
                      {draft.customClauses.map((clause) => (
                        <div
                          key={clause.id}
                          className="flex items-start justify-between gap-3 rounded-[14px] border border-neutral-200 bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.03)]"
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-neutral-900">
                              {clause.category}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-neutral-500">
                              {clause.content}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCustomClause(clause.id)}
                            className="shrink-0 p-1 text-neutral-400 hover:text-neutral-900"
                            aria-label="특약 삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {step === 5 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-5">
                  {allErrors.length > 0 ? (
                    <ValidationSummary errors={allErrors} />
                  ) : (
                    <div className="rounded-[16px] border border-neutral-200 bg-[#fbfaf7] p-4 text-[13px] text-neutral-800">
                      필수 조건이 모두 채워졌습니다. 초안 저장 또는 공유 링크 생성을 선택하세요.
                    </div>
                  )}

                  {result?.stale && (
                    <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-800">
                      계약 내용을 수정했습니다. 기존 공유 링크에 반영하려면 다시 공유 링크를 생성하세요.
                    </div>
                  )}

                  <ReviewBlock title="계약 당사자">
                    <SummaryRow label="광고주" value={draft.advertiserName || "미입력"} />
                    <SummaryRow label="담당자" value={draft.advertiserManager || "-"} />
                    <SummaryRow label="인플루언서" value={draft.influencerName || "미입력"} />
                  </ReviewBlock>

                  <ReviewBlock title="캠페인 조건">
                    <SummaryRow
                      label="기간"
                      value={
                        draft.campaignStart && draft.campaignEnd
                          ? `${draft.campaignStart} - ${draft.campaignEnd}`
                          : "미입력"
                      }
                    />
                    <SummaryRow label="업로드 마감" value={draft.uploadDueDate || "미입력"} />
                    <SummaryRow label="검수 기한" value={draft.reviewDueDate || "미입력"} />
                    <SummaryRow label="수정 횟수" value={draft.revisionLimit || "미입력"} />
                  </ReviewBlock>

                  <ReviewBlock title="발송 상태">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-neutral-500" />
                      <p className="text-[13px] leading-6 text-neutral-600">
                        공유 링크 생성 전에는 대시보드에 <b>초안</b>으로 저장됩니다. 링크 생성 후에만
                        <b> 검토 중</b> 상태로 전환됩니다.
                      </p>
                    </div>
                  </ReviewBlock>
                </section>
              )}
              </div>

              {result && (
                <div className="mt-7 rounded-[20px] border border-neutral-200/90 bg-white p-6 text-center shadow-[0_1px_0_rgba(15,23,42,0.035),0_20px_58px_rgba(15,23,42,0.06)]">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-50">
                    <CheckCircle2 strokeWidth={1.5} className="h-6 w-6 text-neutral-900" />
                  </div>
                  <h3 className="mb-3 text-xl font-heading tracking-tight text-neutral-900">
                    {result.mode === "draft"
                      ? "초안 저장 완료"
                      : shareResultState === "syncing"
                        ? "공유 링크 저장 중"
                        : shareResultState === "error"
                          ? "공유 링크 확인 필요"
                          : "공유 링크 생성 완료"}
                  </h3>
                  <p className="mx-auto mb-6 max-w-[320px] text-[13px] leading-6 text-neutral-500">
                    {result.mode === "draft"
                      ? "계약이 초안 상태로 저장되었습니다. 아직 상대방에게 공유되지 않았습니다."
                      : shareResultState === "syncing"
                        ? "변경 사항 저장이 끝나면 링크를 복사해 전달할 수 있습니다."
                        : shareResultState === "error"
                          ? "변경 사항이 완전히 저장되지 않았습니다. 저장 상태를 확인한 뒤 공유하세요."
                          : "이 링크를 전달하면 상대방이 계약서를 검토할 수 있습니다."}
                  </p>
                  {result.mode === "share" && (
                    <div
                      className={`mb-5 border px-4 py-3 text-left text-[12px] leading-5 ${
                        shareResultState === "error"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-neutral-200 bg-neutral-50 text-neutral-800"
                      }`}
                    >
                      {shareResultState === "error"
                        ? "저장에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 공유 링크를 생성하세요."
                        : shareResultState === "syncing"
                          ? "계약 내용을 저장하고 있습니다."
                          : "저장이 완료되었습니다. 링크를 전달해도 됩니다."}
                    </div>
                  )}
                  {result.mode === "share" &&
                    result.link &&
                    shareResultState === "ready" &&
                    !result.stale && (
                      <div className="flex w-full items-center gap-3">
                        <Input
                          readOnly
                          value={result.link}
                          className="h-11 flex-1 rounded-[12px] border-neutral-200 bg-[#fbfaf7] px-4 font-mono text-[12px] text-neutral-600 focus-visible:ring-0"
                        />
                        <Button
                          type="button"
                          onClick={copyToClipboard}
                          disabled={result.stale || isSyncing || Boolean(syncError)}
                          className="h-11 shrink-0 rounded-[12px] bg-neutral-950 px-5 text-[13px] font-bold text-white hover:bg-neutral-800 disabled:bg-neutral-100 disabled:text-neutral-400"
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          {copied ? "복사됨" : "복사"}
                        </Button>
                      </div>
                    )}
                  {savedContractId && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 h-10 rounded-[12px] border-neutral-200 bg-white px-5 text-[13px] font-semibold text-neutral-700"
                      onClick={() => navigate(`/advertiser/contract/${savedContractId}`)}
                    >
                      관리 화면 열기
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-20 -mx-6 mt-4 flex shrink-0 flex-col gap-3 border-t border-neutral-200 bg-[#f7f6f3]/95 px-6 pb-4 pt-4 shadow-[0_-18px_36px_rgba(15,23,42,0.08)] backdrop-blur md:-mx-10 md:px-10 lg:static lg:mx-0 lg:bg-[#f7f6f3] lg:px-0 lg:pb-0 lg:shadow-none lg:backdrop-blur-none">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-[12px] border-neutral-200 bg-white text-[13px] font-bold text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:bg-neutral-100 lg:hidden"
                onClick={() => setMobilePreviewOpen(true)}
              >
                <FileText className="mr-2 h-4 w-4" strokeWidth={1.8} />
                초안 확인하기
              </Button>

              <div className="flex gap-3">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-[12px] border-neutral-200 bg-white px-7 text-[14px] font-bold text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:bg-neutral-100 hover:text-neutral-900"
                    onClick={goBack}
                  >
                    이전
                  </Button>
                )}

                {step < 5 ? (
                <Button
                  type="button"
                  className="h-12 flex-1 rounded-[12px] bg-neutral-950 text-[14px] font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-neutral-800"
                  onClick={goNext}
                >
                  다음
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 flex-1 rounded-[12px] border-neutral-200 bg-white text-[14px] font-bold text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:bg-neutral-100"
                    onClick={() => saveContract("draft")}
                  >
                    초안 저장
                  </Button>
                  <Button
                    type="button"
                    className="h-12 flex-1 rounded-[12px] bg-neutral-950 text-[14px] font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-neutral-800 disabled:translate-y-0 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
                      onClick={() => saveContract("share")}
                      disabled={
                        currentStepHasBlockingError ||
                        isVerificationLoading ||
                        !canSendContract
                      }
                    >
                      공유 링크 생성
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="hidden min-h-0 flex-col overflow-hidden bg-transparent py-5 lg:flex">
          <BuilderReviewPanel draft={draft} clauses={clauses} />
        </section>
      </main>

      <Dialog open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className="!left-0 !top-0 !block !h-dvh !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 bg-[#f7f6f3] p-0 ring-0 sm:!max-w-none lg:hidden"
        >
          <div className="flex h-dvh min-h-0 flex-col bg-[#f7f6f3]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.035)]">
              <DialogHeader className="sr-only">
                <DialogTitle>계약서 초안 미리보기</DialogTitle>
                <DialogDescription>
                  작성 중인 입력값이 반영된 모바일 계약서 초안 미리보기입니다.
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                className="inline-flex h-10 min-w-0 items-center gap-2 rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-bold text-neutral-800 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:bg-neutral-100"
                onClick={() => setMobilePreviewOpen(false)}
                aria-label="입력 화면으로 돌아가기"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="truncate">입력으로 돌아가기</span>
              </button>
              <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-bold text-neutral-500">
                실시간 초안
              </span>
            </div>

            <div className="min-h-0 flex-1 p-3">
              <BuilderReviewPanel draft={draft} clauses={clauses} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const BuilderReviewPanel: React.FC<{
  draft: ContractDraft;
  clauses: Clause[];
}> = ({ draft, clauses }) => {
  const hasDeliverables = getDeliverableRows(draft).some((row) => row.channel);
  const deliverables = getDeliverableRows(draft).filter(
    (row) => row.channel || row.postCount || row.duration,
  );
  const previewDate = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] border border-neutral-200 bg-[#e8e5de] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_18px_42px_rgba(15,23,42,0.05)]">
      <div className="custom-scrollbar h-full overflow-y-auto pr-1">
        <div className="sticky top-0 z-10 mx-auto w-full max-w-[760px] rounded-[12px] border border-neutral-200 bg-white/95 p-3 text-neutral-950 shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-neutral-200 bg-neutral-50 text-neutral-700">
                <FileText className="h-4 w-4" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  문서 미리보기
                </p>
                <h2 className="mt-0.5 truncate text-[18px] font-semibold">
                  {draft.title || `${draft.type} 계약서`}
                </h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[12px] font-semibold text-neutral-600">
                A4
              </span>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[12px] font-semibold text-neutral-600">
                {previewDate}
              </span>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <ChecklistLine checked={!isBlank(draft.title)} label="계약명" />
            <ChecklistLine checked={!isBlank(draft.influencerName)} label="상대방" />
            <ChecklistLine checked={hasDeliverables} label="플랫폼" />
            <ChecklistLine checked={!isBlank(draft.payment)} label="지급" />
            <ChecklistLine checked={clauses.length > 0} label="조항" />
          </div>
        </div>

        <article className="mx-auto mt-3 min-h-[1080px] w-full max-w-[680px] rounded-[3px] border border-neutral-300 bg-white px-5 py-8 shadow-[0_1px_0_rgba(15,23,42,0.05),0_20px_46px_rgba(15,23,42,0.18)] sm:px-10 sm:py-10">
          <header className="border-b border-neutral-200 pb-7 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              전자계약서 초안
            </p>
            <h2 className="mt-3 text-[22px] font-semibold leading-tight text-neutral-950 sm:text-[28px]">
              {draft.title || `${draft.type} 계약서`}
            </h2>
            <p className="mt-3 text-[13px] font-semibold text-neutral-500">
              작성일 {previewDate}
            </p>
          </header>

          <ContractDocumentSection title="계약 개요">
            <DocumentRows
              rows={[
                ["계약 종류", formatDraftValue(draft.type)],
                ["광고주", formatDraftValue(draft.advertiserName)],
                ["광고주 담당자", formatDraftValue(draft.advertiserManager, "-")],
                ["인플루언서", formatDraftValue(draft.influencerName)],
                ["연락처", formatDraftValue(draft.influencerContact)],
                ["대표 채널", formatDraftValue(draft.influencerUrl)],
              ]}
            />
          </ContractDocumentSection>

          <ContractDocumentSection title="제1조 제공 매체 및 콘텐츠 조건">
            {deliverables.length > 0 ? (
              <div className="space-y-2">
                {deliverables.map((row, index) => (
                  <div
                    key={`${row.channel}-${index}`}
                    className="border border-neutral-200 bg-neutral-50/60 px-4 py-3"
                  >
                    <p className="text-[13px] font-semibold text-neutral-950">
                      {row.channel || "매체명 입력 필요"}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-neutral-600">
                      업로드 {row.postCount || "입력 필요"} · 유지기간{" "}
                      {row.duration || "입력 필요"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <DocumentEmpty text="채널 조건을 선택하면 제공 콘텐츠 조건이 여기에 작성됩니다." />
            )}
          </ContractDocumentSection>

          <ContractDocumentSection title="제2조 일정 및 검수">
            <DocumentRows
              rows={[
                ["캠페인 기간", formatDateRange(draft.campaignStart, draft.campaignEnd)],
                ["업로드 마감일", formatDraftValue(draft.uploadDueDate)],
                ["광고주 검수 회신", formatDraftValue(draft.reviewDueDate)],
                ["수정 가능 횟수", formatDraftValue(draft.revisionLimit)],
              ]}
            />
          </ContractDocumentSection>

          <ContractDocumentSection title="제3조 광고 표시 및 추적">
            <DocumentParagraph>
              {formatDraftValue(
                draft.disclosureText,
                "광고 표시 조건을 입력하면 계약서에 반영됩니다.",
              )}
            </DocumentParagraph>
            {draft.trackingLink && (
              <p className="mt-3 rounded-[10px] border border-neutral-200 bg-white px-4 py-3 font-mono text-[12px] leading-5 text-neutral-600">
                {draft.trackingLink}
              </p>
            )}
          </ContractDocumentSection>

          <ContractDocumentSection title="제4조 지급 조건">
            <DocumentParagraph>
              {formatDraftValue(
                draft.payment,
                "지급 금액, 세금 처리, 지급 시점을 입력하면 계약서에 반영됩니다.",
              )}
            </DocumentParagraph>
          </ContractDocumentSection>

          {draft.exclusivity && (
            <ContractDocumentSection title="제5조 경쟁사 배제">
              <DocumentParagraph>{draft.exclusivity}</DocumentParagraph>
            </ContractDocumentSection>
          )}

          <ContractDocumentSection title="특약 및 자동 생성 조항">
            {clauses.length > 0 ? (
              <div className="space-y-4">
                {clauses.map((clause, index) => (
                  <section
                    key={clause.clause_id}
                    className="border-b border-neutral-100 pb-4 last:border-0 last:pb-0"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span className="font-mono text-[12px] font-semibold text-neutral-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="text-[14px] font-semibold text-neutral-950">
                        {clause.category}
                      </h3>
                    </div>
                    <p className="whitespace-pre-wrap pl-7 text-[13px] leading-6 text-neutral-600">
                      {clause.content}
                    </p>
                  </section>
                ))}
              </div>
            ) : (
              <DocumentEmpty text="필수 조건을 입력하면 계약 조항이 자동으로 생성됩니다." />
            )}
          </ContractDocumentSection>

          <section className="mt-8 grid grid-cols-2 gap-4 border-t border-neutral-200 pt-6">
            <SignatureBox label="광고주" value={draft.advertiserName || "서명 전"} />
            <SignatureBox label="인플루언서" value={draft.influencerName || "서명 전"} />
          </section>
        </article>
      </div>
    </div>
  );
};

const ContractDocumentSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className="border-b border-neutral-200 py-6 last:border-0">
    <h3 className="mb-4 text-[15px] font-semibold text-neutral-950">
      {title}
    </h3>
    {children}
  </section>
);

const DocumentRows: React.FC<{ rows: Array<[string, string]> }> = ({ rows }) => (
  <dl className="overflow-hidden border border-neutral-300">
    {rows.map(([label, value]) => (
      <div
        key={label}
        className="grid min-w-0 grid-cols-[108px_1fr] border-b border-neutral-200 last:border-b-0 sm:grid-cols-[132px_1fr]"
      >
        <dt className="bg-neutral-50 px-3 py-2.5 text-[11px] font-semibold text-neutral-500">
          {label}
        </dt>
        <dd className="min-w-0 break-words border-l border-neutral-200 px-3 py-2.5 text-[13px] font-semibold text-neutral-900">
          {value}
        </dd>
      </div>
    ))}
  </dl>
);

const DocumentParagraph: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="whitespace-pre-wrap text-[13px] leading-7 text-neutral-700">
    {children}
  </p>
);

const DocumentEmpty: React.FC<{ text: string }> = ({ text }) => (
  <div className="border border-dashed border-neutral-300 bg-neutral-50/70 px-4 py-5 text-center text-[13px] leading-6 text-neutral-500">
    {text}
  </div>
);

const SignatureBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border border-neutral-300 bg-white px-4 py-5">
    <p className="text-[11px] font-semibold text-neutral-400">{label}</p>
    <p className="mt-5 border-t border-neutral-200 pt-3 text-center text-[13px] font-semibold text-neutral-800">
      {value}
    </p>
  </div>
);

const formatDraftValue = (value?: string, fallback = "입력 필요") => {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
};

const formatDateRange = (start?: string, end?: string) => {
  if (!start && !end) return "입력 필요";
  return `${start || "시작일 입력 필요"} - ${end || "종료일 입력 필요"}`;
};

const ChecklistLine: React.FC<{ checked: boolean; label: string }> = ({
  checked,
  label,
}) => (
  <div className="flex items-center gap-2 rounded-lg bg-neutral-100 px-2.5 py-2">
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
        checked ? "bg-neutral-950 text-white" : "bg-white text-neutral-400"
      }`}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
    <span
      className={
        checked
          ? "truncate text-[12px] font-semibold text-neutral-950"
          : "truncate text-[12px] text-neutral-500"
      }
    >
      {label}
    </span>
  </div>
);

const ValidationSummary: React.FC<{ errors: ValidationError[] }> = ({ errors }) => (
  <div className="mb-6 rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
    <p className="mb-2 font-semibold">확인이 필요한 항목</p>
    <ul className="space-y-1">
      {errors.map((error) => (
        <li key={`${error.step}-${error.field}`}>- {error.message}</li>
      ))}
    </ul>
  </div>
);

const ReviewBlock: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="rounded-[16px] border border-neutral-200/90 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
    <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
      {title}
    </h3>
    <div className="space-y-2">{children}</div>
  </div>
);

const SummaryRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-start justify-between gap-4 text-[13px]">
    <span className="text-neutral-400">{label}</span>
    <span className="max-w-[260px] text-right font-medium text-neutral-800">
      {value}
    </span>
  </div>
);
