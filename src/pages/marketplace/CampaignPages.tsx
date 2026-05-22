import {
  ArrowLeft,
  ChevronDown,
  FileSignature,
  FileText,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
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
import type { InfluencerPlatform } from "../../domain/verification";

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCampaigns();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCampaigns]);

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

  return (
    <CampaignShell
      eyebrow="광고주 캠페인"
      title="캠페인 작성"
      description="모집 조건을 먼저 공개하고, 지원 수락 뒤 같은 조건으로 계약 작성과 검토 링크 발급에 연결합니다."
      backHref="/advertiser/dashboard"
      backLabel="계약 대시보드"
      metrics={[
        {
          label: "작성",
          value: canSubmit ? "완료" : `${9 - missingFormLabels.length}/9`,
        },
        { label: "공개", value: "모집 노출" },
        { label: "다음", value: "계약 작성" },
      ]}
      actions={
        <>
          <Link
            to="/advertiser/builder"
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] bg-blue-600 px-3 text-[13px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)] transition hover:bg-blue-700"
          >
            <FileSignature className="h-4 w-4" />
            계약 작성
          </Link>
          <Link
            to="/advertiser/discover"
            className="hidden h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950 sm:inline-flex"
          >
            <Search className="h-4 w-4" />
            인플루언서 찾기
          </Link>
        </>
      }
    >
      <section className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[18px] border border-neutral-200 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.055)] sm:p-5 lg:min-h-0 lg:overflow-y-auto"
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
                  type="date"
                  value={form.uploadDeadline}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      uploadDeadline: event.target.value,
                    }))
                  }
                  className="campaign-input"
                />
              </CampaignField>
              <CampaignField label="모집마감일">
                <input
                  required
                  type="date"
                  value={form.deadline}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, deadline: event.target.value }))
                  }
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

            <div className="mt-4 rounded-[16px] border border-neutral-200 bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
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
                  className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[14px] bg-blue-600 px-5 text-[14px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none sm:w-auto sm:min-w-[148px]"
                >
                  <Plus className="h-4 w-4" />
                  {isSubmitting ? "저장 중" : "캠페인 저장"}
                </button>
              </div>
            </div>
          </div>
        </form>

        <section className="rounded-[18px] border border-neutral-200 bg-[#fbfaf7] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.04)] lg:min-h-0 lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-neutral-400">
                공개 캠페인 상태
              </p>
              <h2 className="mt-1 truncate text-[20px] font-extrabold text-neutral-950">
                {brand?.displayName ?? "브랜드 프로필 준비 중"}
              </h2>
              <p className="mt-1 text-[13px] font-bold text-neutral-500">
                지원 접수와 종료 상태는 계약 대시보드와 분리해 확인합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadCampaigns()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-neutral-200 bg-white text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {state.status === "loading" ? (
            <PanelState icon={<RefreshCw className="h-5 w-5 animate-spin" />} title="캠페인을 불러오는 중" />
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
      `${campaign.title} 캠페인에 신청할까요? 신청 내용은 광고주 메시지함에 전달됩니다.`,
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
          ? "이미 신청한 캠페인입니다. 광고주가 확인하면 계약 초안으로 이어집니다."
          : "신청이 전달됐습니다. 광고주가 수락하면 캠페인 조건으로 계약 초안이 생성됩니다.",
      });
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
      backLabel="계약 대시보드"
      metrics={[
        { label: "모집", value: `${visibleCampaigns.length}건` },
        {
          label: "조건",
          value: activeFilterCount > 0 ? `${activeFilterCount}개 적용` : "전체",
        },
        { label: "신청", value: "계약 연결" },
      ]}
      actions={
        <>
          <Link
            to="/influencer/dashboard"
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] bg-blue-600 px-3 text-[13px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)] transition hover:bg-blue-700"
          >
            <FileSignature className="h-4 w-4" />
            받은 계약
          </Link>
          <Link
            to="/influencer/messages"
            className="hidden h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950 sm:inline-flex"
          >
            <FileText className="h-4 w-4" />
            메시지함
          </Link>
        </>
      }
    >
      <section className="overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.055)] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="border-b border-neutral-200 bg-white">
          <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-extrabold text-neutral-950">
                모집 캠페인
              </p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-neutral-500">
                {visibleCampaigns.length.toLocaleString()}건 표시 · {filterSummary}
              </p>
            </div>
            <CampaignFilterToggleButton
              open={filtersOpen}
              activeCount={activeFilterLabels.length}
              controlsId="influencer-campaign-filters"
              onClick={() => setFiltersOpen((current) => !current)}
            />
          </div>
          {filtersOpen ? (
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

        {state.status === "loading" ? (
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
          <div className="grid gap-3 bg-[#fbfaf7] p-3 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto xl:grid-cols-3">
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
  return (
    <main className="flex h-svh flex-col overflow-hidden bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1320px] items-center justify-between px-4 sm:h-14 sm:px-6 lg:px-8">
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
              className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950 sm:h-10 sm:text-[13px]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            {actions}
          </div>
        </div>
      </header>

      <section className="shrink-0 border-b border-neutral-200/80 bg-[#f7f6f3]">
        <div className="mx-auto max-w-[1320px] px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8">
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
            <div className="grid grid-cols-3 gap-1.5 rounded-[14px] border border-neutral-200 bg-white p-1.5 shadow-[0_12px_34px_rgba(15,23,42,0.04)] sm:gap-2 sm:rounded-[18px] sm:p-2">
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

      <div className="mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col overflow-y-auto px-4 py-2 sm:px-6 sm:py-3 lg:px-8">
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
    <div className="rounded-[12px] bg-[#f8f7f4] px-2.5 py-2 sm:rounded-[14px] sm:px-3 sm:py-3">
      <p className="text-[11px] font-extrabold text-neutral-400">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-extrabold text-neutral-950 sm:mt-1 sm:text-[13px]">
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
    <article className="rounded-[14px] border border-neutral-200 bg-white p-4">
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
      <p className="mt-3 line-clamp-2 text-[13px] font-bold leading-5 text-neutral-600">
        {campaign.summary ?? "상세 설명은 브랜드 프로필에서 확인합니다."}
      </p>
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
      <div className="mt-3 flex flex-wrap gap-1.5">
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
    <article className="flex min-h-[248px] flex-col rounded-[14px] border border-neutral-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:min-h-[292px] sm:p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-neutral-950 text-[11px] font-extrabold text-white sm:h-10 sm:w-10 sm:rounded-[12px] sm:text-[12px]">
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
        <span className="inline-flex h-7 items-center rounded-full bg-blue-50 px-2.5 text-[10px] font-extrabold text-blue-700">
          모집 중
        </span>
      </div>

      <div className="mt-3 sm:mt-4">
        <p className="text-[12px] font-extrabold text-neutral-400">
          {campaign.typeLabel}
        </p>
        <h2 className="mt-1 line-clamp-2 text-[15px] font-extrabold leading-5 text-neutral-950 sm:text-[16px] sm:leading-6">
          {campaign.title}
        </h2>
        <p className="mt-1.5 line-clamp-1 break-keep text-[12px] font-bold leading-5 text-neutral-600 sm:mt-2 sm:line-clamp-2 sm:text-[13px]">
          {campaign.summary ?? campaign.brandHeadline}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniInfo label="지급" value={campaign.budget} />
        <MiniInfo label="모집마감" value={campaign.deadlineLabel} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(campaign.platforms ?? []).slice(0, 4).map((platform) => (
          <span
            key={platform}
          className={`inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-extrabold sm:h-7 sm:px-2.5 sm:text-[11px] ${getPlatformTone(platform)}`}
          >
            {platformLabels[platform]}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-3 sm:pt-4">
        <button
          type="button"
          onClick={() => onApply(campaign)}
          disabled={isApplying}
          aria-busy={isApplying}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-neutral-950 px-4 text-[13px] font-extrabold text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:bg-neutral-300 disabled:text-neutral-500"
        >
          <Send className="h-4 w-4" />
          {isApplying ? "신청 중" : "신청"}
        </button>
      </div>
    </article>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[#f8f7f4] px-3 py-2">
      <p className="text-[10px] font-extrabold text-neutral-400">{label}</p>
      <p className="mt-1 truncate text-[12px] font-extrabold text-neutral-950">
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
    <div className="flex min-w-0 items-center gap-2 rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-2.5 py-1.5">
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
