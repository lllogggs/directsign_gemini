import {
  ArrowLeft,
  ChevronDown,
  FileSignature,
  FileText,
  LogOut,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Settings,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  buildMarketplaceCampaignPosts,
  getCampaignDeadlineLabel,
  getPlatformTone,
  marketplaceBrands,
  platformLabels,
  proposalTypeLabels,
  type CampaignProposalType,
  type MarketplaceBrandCampaign,
  type MarketplaceBrandProfile,
  type MarketplaceCampaignPost,
} from "../../domain/marketplace";
import {
  formatMarketplaceMessageDate,
  type MarketplaceMessageThread,
  type MarketplaceMessagesResponse,
  type MarketplaceProposalStatus,
} from "../../domain/marketplaceInbox";
import type { InfluencerPlatform } from "../../domain/verification";
import { MobileSurfaceSwitch } from "../../components/MobileSurfaceSwitch";

type CampaignState =
  | { status: "loading" }
  | { status: "ready"; campaigns: MarketplaceCampaignPost[] }
  | { status: "error"; message: string };

type AdvertiserCampaignState =
  | { status: "loading" }
  | {
      status: "ready";
      brand: MarketplaceBrandProfile | null;
      campaigns: MarketplaceBrandCampaign[];
    }
  | { status: "error"; message: string };

type PlatformFilter = "all" | InfluencerPlatform;
type ProposalTypeFilter = "all" | CampaignProposalType;
type CategoryFilter = "all" | string;
type InfluencerCampaignView = "open" | "applied";
type AdvertiserCampaignView = "applicants" | "campaigns";

const platformOptions: PlatformFilter[] = [
  "all",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];

const proposalTypeOptions: CampaignProposalType[] = [
  "sponsored_post",
  "product_seeding",
  "ppl",
  "group_buy",
  "visit_review",
];

const proposalTypeFilterOptions: ProposalTypeFilter[] = ["all", ...proposalTypeOptions];

type MarketplaceCampaignsResponse = {
  campaigns: MarketplaceCampaignPost[];
};

type AdvertiserCampaignsResponse = {
  brand: MarketplaceBrandProfile | null;
  campaigns: MarketplaceBrandCampaign[];
};

type CampaignApplicationResponse = {
  proposal?: {
    id: string;
    status: string;
    campaign_id?: string;
    target_handle?: string;
  };
  already_submitted?: boolean;
};

type CampaignApplicationsState =
  | { status: "loading" }
  | { status: "ready"; applications: MarketplaceMessageThread[] }
  | { status: "error"; message: string };

type CampaignApplicantAcceptResponse = {
  contract?: {
    id: string;
  };
};

const applicationStatusMeta: Record<
  MarketplaceProposalStatus,
  { label: string; className: string }
> = {
  submitted: {
    label: "신청 완료",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  reviewed: {
    label: "검토 중",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  converted_to_contract: {
    label: "계약 생성",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  closed: {
    label: "종료",
    className: "border-neutral-200 bg-neutral-100 text-neutral-600",
  },
};

type CampaignShellMetric = {
  label: string;
  value: string;
};

const defaultCampaignShellMetrics: CampaignShellMetric[] = [
  { label: "계약 전", value: "조건 정리" },
  { label: "검토", value: "상대 확인" },
  { label: "계약", value: "작성 연결" },
];

export function AdvertiserCampaignRecruitmentPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<AdvertiserCampaignState>({
    status: "loading",
  });
  const [form, setForm] = useState({
    title: "",
    type: "sponsored_post" as CampaignProposalType,
    applicantLimit: "",
    budget: "",
    summary: "",
    deadline: "",
    uploadDeadline: "",
    platforms: ["instagram"] as InfluencerPlatform[],
    deliverables: "",
  });
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | undefined>();
  const [applicationsState, setApplicationsState] =
    useState<CampaignApplicationsState>({ status: "loading" });
  const [activeCampaignView, setActiveCampaignView] =
    useState<AdvertiserCampaignView>("applicants");
  const [selectingApplicantId, setSelectingApplicantId] = useState<string | undefined>();

  const loadCampaigns = useCallback(async () => {
    setState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );

    try {
      const response = await apiFetch("/api/advertiser/campaigns", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

      if (response.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | AdvertiserCampaignsResponse
        | { error?: string };

      if (!response.ok || !("campaigns" in data)) {
        throw new Error(
          "error" in data
            ? data.error ?? "캠페인을 불러오지 못했습니다."
            : "캠페인을 불러오지 못했습니다.",
        );
      }

      setState({
        status: "ready",
        brand: data.brand,
        campaigns: data.campaigns,
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "캠페인을 불러오지 못했습니다.",
      });
    }
  }, [navigate]);

  const loadCampaignApplications = useCallback(async () => {
    setApplicationsState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );

    try {
      const response = await apiFetch("/api/marketplace/messages?role=advertiser", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

      if (response.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | MarketplaceMessagesResponse
        | { error?: string };

      if (!response.ok || !("threads" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        throw new Error(errorMessage ?? "지원자를 불러오지 못했습니다.");
      }

      setApplicationsState({
        status: "ready",
        applications: data.threads.filter(isCampaignApplicationThread),
      });
    } catch (error) {
      setApplicationsState({
        status: "error",
        message:
          error instanceof Error ? error.message : "지원자를 불러오지 못했습니다.",
      });
    }
  }, [navigate]);

  const refreshCampaignWorkspace = useCallback(() => {
    void loadCampaigns();
    void loadCampaignApplications();
  }, [loadCampaignApplications, loadCampaigns]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshCampaignWorkspace();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshCampaignWorkspace]);

  const canSubmit =
    form.title.trim().length > 0 &&
    form.applicantLimit.trim().length > 0 &&
    form.budget.trim().length > 0 &&
    form.deliverables.trim().length > 0 &&
    form.summary.trim().length > 0 &&
    form.uploadDeadline.trim().length > 0 &&
    form.deadline.trim().length > 0 &&
    form.platforms.length > 0;
  const missingFormLabels = [
    form.platforms.length > 0 ? undefined : "플랫폼",
    form.type.trim().length > 0 ? undefined : "광고형태",
    form.title.trim().length > 0 ? undefined : "제목",
    form.applicantLimit.trim().length > 0 ? undefined : "모집인원",
    form.budget.trim().length > 0 ? undefined : "지급내용",
    form.deliverables.trim().length > 0 ? undefined : "산출물",
    form.summary.trim().length > 0 ? undefined : "캠페인설명",
    form.uploadDeadline.trim().length > 0 ? undefined : "업로드 마감일",
    form.deadline.trim().length > 0 ? undefined : "모집마감일",
  ].filter(Boolean) as string[];
  const submitHelperText = canSubmit
    ? "필수 조건이 준비되었습니다. 공개하면 인플루언서 캠페인 화면에 바로 노출됩니다."
    : `남은 필수 항목: ${missingFormLabels.slice(0, 4).join(", ")}${
        missingFormLabels.length > 4 ? ` 외 ${missingFormLabels.length - 4}개` : ""
      }`;

  const togglePlatform = (platform: InfluencerPlatform) => {
    setForm((current) => {
      const exists = current.platforms.includes(platform);
      return {
        ...current,
        platforms: exists
          ? current.platforms.filter((item) => item !== platform)
          : [...current.platforms, platform],
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(undefined);
    setSavedMessage(undefined);

    try {
      const response = await apiFetch("/api/advertiser/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          deliverables: form.deliverables
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      if (response.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | AdvertiserCampaignsResponse
        | { error?: string };

      if (!response.ok || !("campaigns" in data)) {
        throw new Error(
          "error" in data
            ? data.error ?? "캠페인을 저장하지 못했습니다."
            : "캠페인을 저장하지 못했습니다.",
        );
      }

      setState({
        status: "ready",
        brand: data.brand,
        campaigns: data.campaigns,
      });
      void loadCampaignApplications();
      setSavedMessage("캠페인이 공개 목록에 반영되었습니다.");
      setForm((current) => ({
        ...current,
        title: "",
        applicantLimit: "",
        budget: "",
        summary: "",
        deadline: "",
        uploadDeadline: "",
        deliverables: "",
      }));
      navigate("/advertiser/campaigns");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "캠페인을 저장하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const campaigns = state.status === "ready" ? state.campaigns : [];
  const brand = state.status === "ready" ? state.brand : null;
  const campaignApplications =
    applicationsState.status === "ready" ? applicationsState.applications : [];

  const selectCampaignApplicant = async (application: MarketplaceMessageThread) => {
    if (
      selectingApplicantId ||
      application.status === "converted_to_contract" ||
      application.status === "closed"
    ) {
      return;
    }

    const applicantName =
      application.counterpartName || application.senderName || "인플루언서";
    const confirmed = window.confirm(
      `${applicantName}을 선정할까요? 선정하면 계약 초안이 생성됩니다.`,
    );
    if (!confirmed) return;

    setSelectingApplicantId(application.id);

    try {
      const response = await apiFetch(
        `/api/advertiser/marketplace/proposals/${encodeURIComponent(application.id)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );

      if (response.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | CampaignApplicantAcceptResponse
        | { error?: string };

      if (!response.ok || !("contract" in data) || !data.contract?.id) {
        throw new Error(
          "error" in data
            ? data.error ?? "계약 초안을 생성하지 못했습니다."
            : "계약 초안을 생성하지 못했습니다.",
        );
      }

      navigate(`/advertiser/contract/${data.contract.id}`);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "선정에 실패했습니다.",
      );
    } finally {
      setSelectingApplicantId(undefined);
    }
  };

  return (
    <CampaignShell
      eyebrow="광고주 캠페인"
      title="캠페인 작성"
      description="모집 조건을 공개하고 지원자를 한곳에서 확인합니다."
      backHref="/advertiser/campaigns"
      backLabel="캠페인 대시보드"
      metrics={[
        {
          label: "작성",
          value: canSubmit ? "완료" : `${9 - missingFormLabels.length}/9`,
        },
        { label: "공개", value: "모집 노출" },
        { label: "지원자", value: "선정" },
      ]}
      actions={
        <>
          <Link
            to="/advertiser/builder"
            className="yl-header-action yl-header-action-primary"
          >
            <FileSignature className="h-4 w-4" />
            <span className="hidden sm:inline">계약 작성</span>
          </Link>
          <Link
            to="/advertiser/discover"
            className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">인플루언서 찾기</span>
          </Link>
        </>
      }
    >
      <section className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
        <form
          onSubmit={handleSubmit}
          className="yl-card border p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
            <div>
              <p className="text-[12px] font-extrabold text-neutral-400">
                캠페인 조건 입력
              </p>
              <h2 className="mt-1 text-[20px] font-extrabold text-neutral-950">
                캠페인 작성 폼
              </h2>
              <p className="mt-1 break-keep text-[12px] font-bold leading-5 text-neutral-500">
                인플루언서가 지원 전에 보는 금액, 산출물, 일정만 빠짐없이 정리합니다.
              </p>
            </div>
            <span className="inline-flex h-9 items-center rounded-full bg-emerald-50 px-3 text-[12px] font-extrabold text-emerald-700">
              모집 공개
            </span>
          </div>

          <div className="mt-4 grid gap-4">
            <CampaignField label="플랫폼">
              <div className="flex flex-wrap gap-2">
                {platformOptions
                  .filter((platform): platform is InfluencerPlatform => platform !== "all")
                  .map((platform) => {
                    const active = form.platforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        type="button"
                        aria-pressed={active}
                        onClick={() => togglePlatform(platform)}
                        className={`inline-flex h-9 items-center rounded-[10px] border px-3 text-[12px] font-extrabold transition ${
                          active
                            ? "border-neutral-950 bg-neutral-950 text-white"
                            : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-950"
                        }`}
                      >
                        {platformLabels[platform]}
                      </button>
                    );
                  })}
              </div>
            </CampaignField>

            <div className="grid gap-3 sm:grid-cols-2">
              <CampaignField label="광고형태">
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value as CampaignProposalType,
                    }))
                  }
                  className="campaign-input"
                >
                  {proposalTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {proposalTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </CampaignField>
              <CampaignField label="제목">
                <input
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="예: 여름 러닝 챌린지 릴스 모집"
                  className="campaign-input"
                />
              </CampaignField>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CampaignField label="모집인원">
                <input
                  required
                  value={form.applicantLimit}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      applicantLimit: event.target.value,
                    }))
                  }
                  placeholder="예: 5명"
                  className="campaign-input"
                />
              </CampaignField>
              <CampaignField label="지급내용">
                <input
                  required
                  value={form.budget}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, budget: event.target.value }))
                  }
                  placeholder="예: 150만-300만원"
                  className="campaign-input"
                />
              </CampaignField>
            </div>

            <CampaignField label="산출물">
              <input
                required
                value={form.deliverables}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    deliverables: event.target.value,
                  }))
                }
                placeholder="예: 릴스 1건, 스토리 2건"
                className="campaign-input"
              />
            </CampaignField>

            <CampaignField label="캠페인설명">
              <textarea
                required
                rows={3}
                value={form.summary}
                onChange={(event) =>
                  setForm((current) => ({ ...current, summary: event.target.value }))
                }
                placeholder="인플루언서가 바로 판단할 수 있도록 제품, 타깃, 원하는 컨텐츠 톤, 검수 기준을 적어 주세요."
                className="campaign-input resize-none"
              />
            </CampaignField>

            <div className="grid gap-3 sm:grid-cols-2">
              <CampaignField label="업로드 마감일">
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
                  maxLength={10}
                  value={form.uploadDeadline}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      uploadDeadline: event.target.value,
                    }))
                  }
                  placeholder="예: 2026-06-04"
                  className="campaign-input"
                />
              </CampaignField>
              <CampaignField label="모집마감일">
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
                  maxLength={10}
                  value={form.deadline}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, deadline: event.target.value }))
                  }
                  placeholder="예: 2026-05-28"
                  className="campaign-input"
                />
              </CampaignField>
            </div>

            {submitError ? (
              <p className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-extrabold text-rose-700">
                {submitError}
              </p>
            ) : null}
            {savedMessage ? (
              <p className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-extrabold text-emerald-700">
                {savedMessage}
              </p>
            ) : null}

            <div className="yl-panel mt-4 border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className={`break-keep text-[12px] font-extrabold leading-5 ${
                    canSubmit ? "text-emerald-700" : "text-neutral-500"
                  }`}
                >
                  {submitHelperText}
                </p>
                <button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-blue-600 px-5 text-[14px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none sm:w-auto sm:min-w-[148px]"
                >
                  <Plus className="h-4 w-4" />
                  {isSubmitting ? "저장 중" : "캠페인 저장"}
                </button>
              </div>
            </div>
          </div>
        </form>

        <section className="yl-panel border p-4 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-neutral-400">
                캠페인 관리
              </p>
              <h2 className="mt-1 truncate text-[20px] font-extrabold text-neutral-950">
                {brand?.displayName ?? "브랜드 프로필 준비 중"}
              </h2>
              <p className="mt-1 text-[13px] font-bold text-neutral-500">
                지원자 정보를 확인하고 선정합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshCampaignWorkspace}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-neutral-200 bg-white text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <AdvertiserCampaignViewTabs
            value={activeCampaignView}
            applicantsCount={campaignApplications.length}
            campaignsCount={campaigns.length}
            onChange={setActiveCampaignView}
          />

          {activeCampaignView === "applicants" ? (
            applicationsState.status === "loading" ? (
              <PanelState
                icon={<RefreshCw className="h-5 w-5 animate-spin" />}
                title="지원자를 불러오는 중"
              />
            ) : applicationsState.status === "error" ? (
              <PanelState
                icon={<Megaphone className="h-5 w-5" />}
                title={applicationsState.message}
              />
            ) : campaignApplications.length === 0 ? (
              <PanelState
                icon={<Megaphone className="h-5 w-5" />}
                title="아직 지원자가 없습니다"
                body="지원이 들어오면 캠페인별로 바로 확인할 수 있습니다."
              />
            ) : (
              <AdvertiserCampaignApplicantList
                applications={campaignApplications}
                selectingApplicantId={selectingApplicantId}
                onSelect={selectCampaignApplicant}
              />
            )
          ) : state.status === "loading" ? (
            <PanelState
              icon={<RefreshCw className="h-5 w-5 animate-spin" />}
              title="캠페인을 불러오는 중"
            />
          ) : state.status === "error" ? (
            <PanelState icon={<Megaphone className="h-5 w-5" />} title={state.message} />
          ) : campaigns.length === 0 ? (
            <PanelState
              icon={<Megaphone className="h-5 w-5" />}
              title="아직 공개 캠페인이 없습니다"
              body="첫 캠페인을 등록하면 인플루언서 캠페인 화면에 바로 표시됩니다."
            />
          ) : (
            <div className="mt-4 grid gap-3">
              {campaigns.map((campaign) => (
                <AdvertiserCampaignCard
                  key={campaign.id ?? `${campaign.title}-${campaign.type}`}
                  campaign={campaign}
                />
              ))}
            </div>
          )}
        </section>
      </section>
    </CampaignShell>
  );
}

export function InfluencerCampaignDiscoveryPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<CampaignState>({ status: "loading" });
  const [applicationsState, setApplicationsState] =
    useState<CampaignApplicationsState>({ status: "loading" });
  const [activeView, setActiveView] = useState<InfluencerCampaignView>("open");
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [proposalTypeFilter, setProposalTypeFilter] =
    useState<ProposalTypeFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [applyingCampaignId, setApplyingCampaignId] = useState<string | undefined>();
  const [applicationNotice, setApplicationNotice] = useState<
    | { campaignId: string; tone: "success" | "error"; message: string }
    | undefined
  >();

  useEffect(() => {
    let active = true;

    void apiFetch("/api/marketplace/campaigns", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("캠페인 목록을 불러오지 못했습니다.");
        return (await response.json()) as MarketplaceCampaignsResponse;
      })
      .then((data) => {
        if (!active) return;
        setState({
          status: "ready",
          campaigns:
            data.campaigns.length > 0
              ? dedupeCampaignsByBrandIdentity(data.campaigns)
              : dedupeCampaignsByBrandIdentity(
                  buildMarketplaceCampaignPosts(marketplaceBrands),
                ),
        });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "캠페인 목록을 불러오지 못했습니다.",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const loadApplications = useCallback(async () => {
    setApplicationsState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );

    try {
      const response = await apiFetch("/api/marketplace/messages?role=influencer", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

      if (response.status === 401) {
        setApplicationsState({ status: "ready", applications: [] });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | MarketplaceMessagesResponse
        | { error?: string };

      if (!response.ok || !("threads" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        throw new Error(errorMessage ?? "신청한 캠페인을 불러오지 못했습니다.");
      }

      setApplicationsState({
        status: "ready",
        applications: data.threads.filter(isInfluencerCampaignApplication),
      });
    } catch (error) {
      setApplicationsState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "신청한 캠페인을 불러오지 못했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadApplications();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadApplications]);

  const campaigns =
    state.status === "ready"
      ? state.campaigns
      : dedupeCampaignsByBrandIdentity(buildMarketplaceCampaignPosts(marketplaceBrands));
  const visibleCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      if (
        platformFilter !== "all" &&
        !(campaign.platforms ?? []).includes(platformFilter)
      ) {
        return false;
      }
      if (proposalTypeFilter !== "all" && campaign.type !== proposalTypeFilter) {
        return false;
      }
      if (categoryFilter !== "all" && campaign.brandCategory !== categoryFilter) {
        return false;
      }
      if (!normalizedQuery) return true;

      return [
        campaign.brandName,
        campaign.brandCategory,
        campaign.title,
        campaign.summary ?? "",
        campaign.budget,
        campaign.typeLabel,
        ...campaign.platformLabels,
        ...(campaign.deliverables ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [campaigns, categoryFilter, platformFilter, proposalTypeFilter, query]);
  const applications =
    applicationsState.status === "ready" ? applicationsState.applications : [];

  const categoryOptions = useMemo(
    () => ["all", ...Array.from(new Set(campaigns.map((campaign) => campaign.brandCategory))).sort()],
    [campaigns],
  );
  const activeFilterCount = [
    query.trim().length > 0,
    platformFilter !== "all",
    categoryFilter !== "all",
    proposalTypeFilter !== "all",
  ].filter(Boolean).length;
  const activeFilterLabels = [
    query.trim() ? `검색 ${query.trim()}` : null,
    platformFilter !== "all" ? platformLabels[platformFilter] : null,
    categoryFilter !== "all" ? categoryFilter : null,
    proposalTypeFilter !== "all" ? proposalTypeLabels[proposalTypeFilter] : null,
  ].filter((label): label is string => Boolean(label));
  const filterSummary =
    activeFilterLabels.length > 0 ? activeFilterLabels.join(" · ") : "전체 조건";

  const applyToCampaign = async (campaign: MarketplaceCampaignPost) => {
    if (applyingCampaignId) return;

    const confirmed = window.confirm(
      `${campaign.title} 캠페인에 신청할까요? 신청 내역은 신청한 캠페인에 표시됩니다.`,
    );
    if (!confirmed) return;

    setApplyingCampaignId(campaign.id);
    setApplicationNotice({
      campaignId: campaign.id,
      tone: "success",
      message: `${campaign.title} 신청을 전송 중입니다.`,
    });

    try {
      const response = await apiFetch(
        `/api/marketplace/campaigns/${encodeURIComponent(campaign.id)}/applications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );

      if (response.status === 401) {
        navigate("/login/influencer", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | CampaignApplicationResponse
        | { error?: string };

      if (!response.ok || !("proposal" in data)) {
        throw new Error(
          "error" in data
            ? data.error ?? "캠페인 신청을 저장하지 못했습니다."
            : "캠페인 신청을 저장하지 못했습니다.",
        );
      }

      setApplicationNotice({
        campaignId: campaign.id,
        tone: "success",
        message: data.already_submitted
          ? "이미 신청한 캠페인입니다. 광고주가 확인하면 계약으로 이어집니다."
          : "신청이 전달됐습니다. 광고주가 수락하면 계약이 생성됩니다.",
      });
      setActiveView("applied");
      void loadApplications();
    } catch (error) {
      setApplicationNotice({
        campaignId: campaign.id,
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "캠페인 신청을 저장하지 못했습니다.",
      });
    } finally {
      setApplyingCampaignId(undefined);
    }
  };

  return (
    <CampaignShell
      eyebrow="인플루언서 캠페인"
      title="캠페인 탐색"
      description="모집 조건을 빠르게 비교하고, 관심 있는 캠페인은 신청 후 광고주 수락을 기다립니다."
      backHref="/influencer/dashboard"
      backLabel="내 계약"
      metrics={[
        { label: "모집", value: `${visibleCampaigns.length}건` },
        {
          label: "조건",
          value: activeFilterCount > 0 ? `${activeFilterCount}개 적용` : "전체",
        },
        { label: "신청", value: `${applications.length}건` },
      ]}
      actions={
        <>
          <Link
            to="/influencer/dashboard"
            className="yl-header-action yl-header-action-primary"
          >
            <FileSignature className="h-4 w-4" />
            <span className="hidden sm:inline">받은 계약</span>
          </Link>
          <Link
            to="/influencer/messages"
            className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">메시지함</span>
          </Link>
        </>
      }
    >
      <section className="yl-card flex min-h-0 flex-1 flex-col overflow-hidden border">
        <div className="border-b border-neutral-200 bg-white">
          <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-extrabold text-neutral-950">
                {activeView === "open" ? "모집 캠페인" : "신청한 캠페인"}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-neutral-500">
                {activeView === "open"
                  ? `${visibleCampaigns.length.toLocaleString()}건 표시 · ${filterSummary}`
                  : `${applications.length.toLocaleString()}건 표시`}
              </p>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <CampaignViewTabs
                value={activeView}
                openCount={visibleCampaigns.length}
                appliedCount={applications.length}
                onChange={setActiveView}
              />
              {activeView === "open" ? (
                <CampaignFilterToggleButton
                  open={filtersOpen}
                  activeCount={activeFilterLabels.length}
                  controlsId="influencer-campaign-filters"
                  onClick={() => setFiltersOpen((current) => !current)}
                />
              ) : null}
            </div>
          </div>
          {activeView === "open" && filtersOpen ? (
            <div
              id="influencer-campaign-filters"
              className="grid gap-2 border-t border-neutral-200 bg-[#fbfaf7] p-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start"
            >
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="캠페인 검색"
                  placeholder="브랜드, 캠페인, 플랫폼, 산출물 검색"
                  className="h-9 w-full rounded-[8px] border border-neutral-200 bg-white pl-10 pr-3 text-[12px] font-bold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950"
                />
              </div>
              <div className="grid min-w-0 gap-2 lg:grid-cols-3">
                <FilterGroup label="플랫폼">
                  {platformOptions.map((platform) => (
                    <FilterButton
                      key={platform}
                      active={platformFilter === platform}
                      label={platform === "all" ? "전체" : platformLabels[platform]}
                      onClick={() => setPlatformFilter(platform)}
                      tone={platform === "all" ? undefined : getPlatformTone(platform)}
                    />
                  ))}
                </FilterGroup>
                <FilterGroup label="카테고리">
                  {categoryOptions.map((category) => (
                    <FilterButton
                      key={category}
                      active={categoryFilter === category}
                      label={category === "all" ? "전체" : category}
                      onClick={() => setCategoryFilter(category)}
                    />
                  ))}
                </FilterGroup>
                <FilterGroup label="형태">
                  {proposalTypeFilterOptions.map((type) => (
                    <FilterButton
                      key={type}
                      active={proposalTypeFilter === type}
                      label={type === "all" ? "전체" : proposalTypeLabels[type]}
                      onClick={() => setProposalTypeFilter(type)}
                    />
                  ))}
                </FilterGroup>
              </div>
            </div>
          ) : null}
        </div>

        {activeView === "applied" ? (
          applicationsState.status === "loading" ? (
            <PanelState
              icon={<RefreshCw className="h-5 w-5 animate-spin" />}
              title="신청한 캠페인을 불러오는 중"
            />
          ) : applicationsState.status === "error" ? (
            <PanelState
              icon={<Megaphone className="h-5 w-5" />}
              title={applicationsState.message}
            />
          ) : applications.length === 0 ? (
            <PanelState
              icon={<Send className="h-5 w-5" />}
              title="아직 신청한 캠페인이 없습니다"
              body="관심 있는 캠페인을 신청하면 이곳에서 진행 상태를 확인합니다."
            />
          ) : (
            <AppliedCampaignList applications={applications} />
          )
        ) : state.status === "loading" ? (
          <PanelState icon={<RefreshCw className="h-5 w-5 animate-spin" />} title="캠페인을 불러오는 중" />
        ) : state.status === "error" ? (
          <PanelState icon={<Megaphone className="h-5 w-5" />} title={state.message} />
        ) : visibleCampaigns.length === 0 ? (
          <PanelState
            icon={<Megaphone className="h-5 w-5" />}
            title="조건에 맞는 캠페인이 없습니다"
            body="검색어나 조건을 줄여보세요."
          />
        ) : (
          <div
            data-campaign-scroll-region="open"
            className="grid min-h-0 flex-1 auto-rows-max gap-x-3 gap-y-5 overflow-y-auto overscroll-contain bg-[#fbfaf7] p-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {applicationNotice ? (
              <p
                className={`rounded-[12px] border px-3 py-2 text-[12px] font-extrabold lg:col-span-3 ${
                  applicationNotice.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {applicationNotice.message}
              </p>
            ) : null}
            {visibleCampaigns.map((campaign) => (
              <CampaignPostCard
                key={campaign.id}
                campaign={campaign}
                isApplying={applyingCampaignId === campaign.id}
                onApply={applyToCampaign}
              />
            ))}
          </div>
        )}
      </section>
    </CampaignShell>
  );
}

function CampaignShell({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  metrics = defaultCampaignShellMetrics,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  metrics?: CampaignShellMetric[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const role = backHref.startsWith("/influencer") ? "influencer" : "advertiser";
  const handleLogout = async () => {
    try {
      await apiFetch(`/api/${role}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] ${role} logout request failed`, error);
    } finally {
      navigate(role === "advertiser" ? "/login/advertiser" : "/login/influencer", {
        replace: true,
      });
    }
  };

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)] sm:h-10 sm:w-10 sm:rounded-[13px]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-neo-heavy hidden text-[19px] leading-none text-neutral-950 sm:inline">
              {PRODUCT_NAME}
            </span>
          </Link>

          <div className="no-scrollbar ml-3 flex min-w-0 items-center gap-2 overflow-x-auto">
            <Link
              to={backHref}
              className="yl-header-action yl-header-action-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            {actions}
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(`/reset-password?role=${role}`, { replace: false })
              }
              className="yl-header-icon-action"
              aria-label="계정 설정"
              title="계정 설정"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <MobileSurfaceSwitch role={role} active="campaigns" />

      <section className="shrink-0 border-b border-neutral-200/80 bg-[#f7f6f3]">
        <div className="mx-auto max-w-[1500px] px-3 py-2.5 sm:px-5 sm:py-3 lg:px-6">
          <p className="inline-flex items-center gap-2 text-[12px] font-extrabold text-neutral-500 sm:text-[13px]">
            <Megaphone className="h-4 w-4" />
            {eyebrow}
          </p>
          <div className="mt-1.5 grid gap-2 sm:mt-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-end">
            <div className="min-w-0">
              <h1 className="font-neo-heavy text-[26px] leading-[1.05] text-neutral-950 sm:text-[34px] sm:leading-none">
                {title}
              </h1>
              <p className="mt-1.5 line-clamp-1 max-w-3xl break-keep text-[12px] font-bold leading-5 text-neutral-600 sm:mt-3 sm:line-clamp-none sm:text-[13px] sm:leading-6">
                {description}
              </p>
            </div>
            <div className="yl-evidence-strip grid-cols-3 sm:gap-2 sm:p-2">
              {metrics.map((metric) => (
                <ShellMetric
                  key={`${metric.label}-${metric.value}`}
                  label={metric.label}
                  value={metric.value}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col overflow-y-auto px-3 py-2 sm:px-5 sm:py-3 lg:px-6">
        {children}
      </div>
    </main>
  );
}

function ShellMetric({
  label,
  value,
}: {
  key?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="yl-fact-tile px-2.5 py-2 sm:px-3 sm:py-3">
      <p className="yl-fact-label truncate">{label}</p>
      <p className="yl-fact-value truncate text-[12px] sm:text-[13px]">
        {value}
      </p>
    </div>
  );
}

function CampaignField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-extrabold text-neutral-800">{label}</span>
      {children}
    </div>
  );
}

function AdvertiserCampaignCard({
  campaign,
}: {
  key?: string;
  campaign: MarketplaceBrandCampaign;
}) {
  const statusMeta = getAdvertiserCampaignStatusMeta(campaign);

  return (
    <article className="yl-card border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-neutral-400">
            {proposalTypeLabels[campaign.type]}
          </p>
          <h3 className="mt-1 line-clamp-2 text-[16px] font-extrabold leading-6 text-neutral-950">
            {campaign.title}
          </h3>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusMeta.className}`}
        >
          {statusMeta.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniInfo label="지급" value={campaign.budget} />
        <MiniInfo label="모집" value={campaign.applicantLimit ?? "상시"} />
        <MiniInfo
          label="업로드"
          value={getCampaignDeadlineLabel(campaign.uploadDeadline)}
        />
        <MiniInfo
          label="모집마감"
          value={getCampaignDeadlineLabel(campaign.deadline)}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(campaign.platforms ?? []).map((platform) => (
          <span
            key={platform}
            className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-extrabold ${getPlatformTone(platform)}`}
          >
            {platformLabels[platform]}
          </span>
        ))}
      </div>
    </article>
  );
}

function getAdvertiserCampaignStatusMeta(campaign: MarketplaceBrandCampaign) {
  if (campaign.status === "ended") {
    return {
      label: "종료",
      className: "bg-neutral-100 text-neutral-600",
    };
  }
  if (campaign.status === "closed") {
    return {
      label: "모집 종료",
      className: "bg-amber-50 text-amber-700",
    };
  }
  if (campaign.status === "draft") {
    return {
      label: "비공개",
      className: "bg-neutral-100 text-neutral-600",
    };
  }

  return {
    label: "공개",
    className: "bg-emerald-50 text-emerald-700",
  };
}

function AdvertiserCampaignViewTabs({
  value,
  applicantsCount,
  campaignsCount,
  onChange,
}: {
  value: AdvertiserCampaignView;
  applicantsCount: number;
  campaignsCount: number;
  onChange: (value: AdvertiserCampaignView) => void;
}) {
  const tabs: Array<{ id: AdvertiserCampaignView; label: string; count: number }> = [
    { id: "applicants", label: "지원자", count: applicantsCount },
    { id: "campaigns", label: "공개 캠페인", count: campaignsCount },
  ];

  return (
    <div
      className="mt-4 grid grid-cols-2 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1"
      role="tablist"
      aria-label="캠페인 관리 보기"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`h-9 min-w-0 rounded-full px-2 text-[12px] font-extrabold transition ${
              active
                ? "bg-white text-neutral-950 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <span className="inline-flex max-w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap">
              {tab.label}
              <span className={active ? "text-neutral-500" : "text-neutral-400"}>
                {tab.count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AdvertiserCampaignApplicantList({
  applications,
  selectingApplicantId,
  onSelect,
}: {
  applications: MarketplaceMessageThread[];
  selectingApplicantId: string | undefined;
  onSelect: (application: MarketplaceMessageThread) => void;
}) {
  return (
    <section className="mt-4 rounded-[12px] border border-neutral-200 bg-white p-2">
      <div className="grid gap-2">
        {applications.map((application) => (
          <AdvertiserCampaignApplicantRow
            key={application.id}
            application={application}
            isSelecting={selectingApplicantId === application.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function AdvertiserCampaignApplicantRow({
  application,
  isSelecting,
  onSelect,
}: {
  key?: string;
  application: MarketplaceMessageThread;
  isSelecting: boolean;
  onSelect: (application: MarketplaceMessageThread) => void;
}) {
  const title = formatAppliedCampaignTitle(application);
  const applicantName =
    application.counterpartName || application.senderName || "인플루언서";
  const intro =
    application.counterpartIntro || application.senderIntro || "소개가 아직 없습니다.";
  const avatarLabel = buildCampaignApplicantAvatarLabel(
    application.counterpartAvatarLabel,
    applicantName,
  );
  const canSelect =
    !application.convertedContractId &&
    application.status !== "converted_to_contract" &&
    application.status !== "closed";

  return (
    <article className="rounded-[10px] border border-neutral-100 bg-white p-3 transition hover:bg-[#f8faf7]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-[12px] font-extrabold text-white">
            {avatarLabel}
          </span>
          <div className="min-w-0">
            {application.counterpartHref ? (
              <Link
                to={application.counterpartHref}
                className="block truncate text-[13px] font-extrabold text-neutral-950 hover:underline"
                title={applicantName}
              >
                {applicantName}
              </Link>
            ) : (
              <p className="truncate text-[13px] font-extrabold text-neutral-950">
                {applicantName}
              </p>
            )}
            <p className="mt-0.5 truncate text-[11px] font-semibold text-neutral-500">
              {intro}
            </p>
          </div>
        </div>

        {application.convertedContractId ? (
          <Link
            to={`/advertiser/contract/${application.convertedContractId}`}
            className="inline-flex h-9 w-[88px] items-center justify-center rounded-md bg-neutral-950 text-[12px] font-semibold text-white transition hover:bg-black"
          >
            계약 보기
          </Link>
        ) : canSelect ? (
          <button
            type="button"
            onClick={() => onSelect(application)}
            disabled={isSelecting}
            className="inline-flex h-9 w-[88px] items-center justify-center rounded-md bg-blue-600 text-[12px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isSelecting ? "선정 중" : "선정"}
          </button>
        ) : (
          <span
            className={`inline-flex h-9 w-[88px] items-center justify-center rounded-md border text-[12px] font-semibold ${applicationStatusMeta[application.status].className}`}
          >
            {applicationStatusMeta[application.status].label}
          </span>
        )}
      </div>

      <p className="mt-3 truncate text-[13px] font-bold text-neutral-800" title={title}>
        {title}
      </p>

      <div className="mt-2">
        <CampaignApplicantPlatformPills platforms={application.platforms} />
      </div>
    </article>
  );
}

function CampaignApplicantPlatformPills({
  platforms,
}: {
  platforms: MarketplaceMessageThread["platforms"];
}) {
  const visiblePlatforms =
    platforms.length > 0
      ? platforms
      : [{ platform: "other" as InfluencerPlatform, label: platformLabels.other }];

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visiblePlatforms.slice(0, 2).map((item, index) => {
        const label = platformLabels[item.platform] ?? item.label;
        const text = item.followersLabel
          ? `${label} ${item.followersLabel}`
          : label;

        return (
          <span
            key={`${item.platform}-${item.handle ?? index}`}
            className={`inline-flex h-7 max-w-full items-center rounded-full border px-2 text-[11px] font-extrabold ${getPlatformTone(item.platform)}`}
            title={text}
          >
            <span className="truncate">{text}</span>
          </span>
        );
      })}
      {visiblePlatforms.length > 2 ? (
        <span className="inline-flex h-7 items-center rounded-full border border-neutral-200 bg-white px-2 text-[11px] font-extrabold text-neutral-500">
          +{visiblePlatforms.length - 2}
        </span>
      ) : null}
    </div>
  );
}

function buildCampaignApplicantAvatarLabel(
  label: string | undefined,
  name: string,
) {
  const raw = (label || name).trim();
  if (!raw) return "IN";

  const compact = raw.replace(/\s+/g, "");
  if (/^[A-Za-z0-9]+$/u.test(compact)) {
    return compact.slice(0, 2).toUpperCase();
  }

  return compact.slice(0, 2);
}

function CampaignPostCard({
  campaign,
  isApplying,
  onApply,
}: {
  key?: string;
  campaign: MarketplaceCampaignPost;
  isApplying: boolean;
  onApply: (campaign: MarketplaceCampaignPost) => void;
}) {
  return (
    <article className="yl-card flex min-h-[258px] flex-col border p-3 sm:p-3.5">
      <div className="flex items-start gap-3">
        <span className="yl-profile-mark flex h-9 w-9 shrink-0 items-center justify-center text-[11px] font-extrabold sm:h-10 sm:w-10 sm:text-[12px]">
          {campaign.brandLogoLabel}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-extrabold text-neutral-950">
            {campaign.brandName}
          </p>
          <p className="mt-1 truncate text-[12px] font-bold text-neutral-400">
            {campaign.brandCategory}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onApply(campaign)}
          disabled={isApplying}
          aria-busy={isApplying}
          className="yl-primary-action inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[8px] px-3 text-[11px] font-extrabold transition disabled:cursor-wait disabled:bg-neutral-300 disabled:text-neutral-500"
        >
          <Send className="h-3.5 w-3.5" />
          {isApplying ? "신청 중" : "신청"}
        </button>
      </div>

      <div className="mt-3">
        <p className="text-[12px] font-extrabold text-neutral-400">
          {campaign.typeLabel}
        </p>
        <h2 className="mt-1 line-clamp-2 text-[15px] font-extrabold leading-5 text-neutral-950 sm:text-[16px] sm:leading-6">
          {campaign.title}
        </h2>
        <p className="mt-1.5 line-clamp-1 break-keep text-[12px] font-bold leading-5 text-neutral-600 sm:text-[13px]">
          {campaign.summary ?? campaign.brandHeadline}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniInfo label="지급" value={campaign.budget} />
        <MiniInfo label="모집마감" value={campaign.deadlineLabel} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(campaign.platforms ?? []).slice(0, 4).map((platform) => (
          <span
            key={platform}
          className={`inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-extrabold sm:h-7 sm:px-2.5 sm:text-[11px] ${getPlatformTone(platform)}`}
          >
            {platformLabels[platform]}
          </span>
        ))}
      </div>

    </article>
  );
}

function CampaignViewTabs({
  value,
  openCount,
  appliedCount,
  onChange,
}: {
  value: InfluencerCampaignView;
  openCount: number;
  appliedCount: number;
  onChange: (value: InfluencerCampaignView) => void;
}) {
  const tabs: Array<{ id: InfluencerCampaignView; label: string; count: number }> = [
    { id: "open", label: "모집 캠페인", count: openCount },
    { id: "applied", label: "신청한 캠페인", count: appliedCount },
  ];

  return (
    <div
      className="grid min-w-[250px] grid-cols-2 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1 lg:w-[320px]"
      role="tablist"
      aria-label="캠페인 보기"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`h-9 min-w-0 rounded-full px-2 text-[12px] font-extrabold transition ${
              active
                ? "bg-white text-neutral-950 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <span className="inline-flex max-w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap">
              {tab.label}
              <span className={active ? "text-neutral-500" : "text-neutral-400"}>
                {tab.count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AppliedCampaignList({
  applications,
}: {
  applications: MarketplaceMessageThread[];
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="hidden grid-cols-[minmax(170px,0.48fr)_minmax(320px,1fr)_132px_132px_132px] border-b border-neutral-200 bg-[#f8faf7] px-4 py-3 text-[11px] font-semibold text-neutral-500 lg:grid">
        <span>브랜드</span>
        <span>캠페인</span>
        <span>상태</span>
        <span className="text-right">신청일</span>
        <span className="sr-only">액션</span>
      </div>
      <div
        data-campaign-scroll-region="applied"
        className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto overscroll-contain"
      >
        {applications.map((application) => (
          <div key={application.id}>
            <AppliedCampaignRow application={application} />
          </div>
        ))}
      </div>
    </section>
  );
}

function AppliedCampaignRow({
  application,
}: {
  application: MarketplaceMessageThread;
}) {
  const statusMeta = applicationStatusMeta[application.status];
  const title = formatAppliedCampaignTitle(application);

  return (
    <article className="grid gap-3 px-4 py-3 hover:bg-[#f8faf7] lg:grid-cols-[minmax(170px,0.48fr)_minmax(320px,1fr)_132px_132px_132px] lg:items-center">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-extrabold text-neutral-950">
          {application.targetName || application.counterpartName}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-extrabold text-neutral-950" title={title}>
          {title}
        </p>
      </div>
      <span
        className={`inline-flex h-7 w-fit items-center rounded-md border px-2 text-[11px] font-extrabold ${statusMeta.className}`}
      >
        {statusMeta.label}
      </span>
      <p className="text-right text-[12px] font-semibold tabular-nums text-neutral-500">
        {formatMarketplaceMessageDate(application.createdAt)}
      </p>
      <div className="flex justify-start lg:justify-end">
        {application.convertedContractId ? (
          <Link
            to={`/contract/${application.convertedContractId}`}
            className="inline-flex h-9 w-[96px] items-center justify-center rounded-md bg-blue-600 text-[12px] font-semibold text-white transition hover:bg-blue-700"
          >
            계약 검토
          </Link>
        ) : (
          <span className="inline-flex h-9 w-[96px] items-center justify-center rounded-md border border-neutral-200 bg-white text-[12px] font-semibold text-neutral-500">
            대기
          </span>
        )}
      </div>
    </article>
  );
}

function isInfluencerCampaignApplication(thread: MarketplaceMessageThread) {
  return isCampaignApplicationThread(thread);
}

function isCampaignApplicationThread(thread: MarketplaceMessageThread) {
  return thread.direction === "influencer_to_brand" && Boolean(thread.campaignId);
}

function formatAppliedCampaignTitle(application: MarketplaceMessageThread) {
  if (application.campaignTitle) return application.campaignTitle;

  const summary = application.proposalSummary;
  const startToken = "캠페인 신청:";
  const startIndex = summary.indexOf(startToken);
  if (startIndex < 0) return summary.split(/[.。]/u)[0]?.trim() || "캠페인";

  const valueStart = startIndex + startToken.length;
  const stopTokens = [
    "모집인원:",
    "지급내용:",
    "산출물:",
    "플랫폼:",
    "업로드 마감일:",
    "모집마감일:",
  ];
  const nextStopIndex = stopTokens
    .map((token) => summary.indexOf(token, valueStart))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const raw =
    nextStopIndex === undefined
      ? summary.slice(valueStart)
      : summary.slice(valueStart, nextStopIndex);

  return raw.replace(/\s+/g, " ").trim() || "캠페인";
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="yl-fact-tile px-3 py-2">
      <p className="yl-fact-label truncate">{label}</p>
      <p className="yl-fact-value truncate">
        {value}
      </p>
    </div>
  );
}

function CampaignFilterToggleButton({
  open,
  activeCount,
  controlsId,
  onClick,
}: {
  open: boolean;
  activeCount: number;
  controlsId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controlsId}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-neutral-200 bg-white px-2.5 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
    >
      <SlidersHorizontal className="h-3.5 w-3.5 text-neutral-500" strokeWidth={2} />
      <span>필터</span>
      {activeCount > 0 ? (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-950 px-1 text-[11px] font-extrabold text-white">
          {activeCount}
        </span>
      ) : null}
      <ChevronDown
        className={`h-3.5 w-3.5 text-neutral-500 transition-transform ${
          open ? "rotate-180" : ""
        }`}
        strokeWidth={2}
      />
    </button>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[8px] border border-neutral-200 bg-[#fbfaf7] px-2.5 py-1.5">
      <span className="shrink-0 text-[12px] font-extrabold text-neutral-500">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  label,
  onClick,
  tone,
}: {
  key?: string;
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  const activeClass = tone ?? "border-neutral-950 bg-neutral-950 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-extrabold transition sm:px-2 ${
        active
          ? activeClass
          : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-950"
      }`}
    >
      <span>{label}</span>
    </button>
  );
}

function dedupeCampaignsByBrandIdentity(campaigns: MarketplaceCampaignPost[]) {
  const brandHandleByIdentity = new Map<string, string>();

  return campaigns.filter((campaign) => {
    const identity = [
      campaign.brandName,
      campaign.brandCategory,
    ]
      .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
      .join("|");
    const firstBrandHandle = brandHandleByIdentity.get(identity);

    if (!firstBrandHandle) {
      brandHandleByIdentity.set(identity, campaign.brandHandle);
      return true;
    }

    return firstBrandHandle === campaign.brandHandle;
  });
}

function PanelState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <section className="flex min-h-[240px] items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-white text-neutral-500 ring-1 ring-neutral-200">
          {icon}
        </div>
        <h2 className="mt-4 text-[15px] font-extrabold text-neutral-950">
          {title}
        </h2>
        {body ? (
          <p className="mt-2 text-[13px] font-bold leading-5 text-neutral-500">
            {body}
          </p>
        ) : null}
      </div>
    </section>
  );
}
