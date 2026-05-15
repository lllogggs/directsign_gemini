import {
  ArrowLeft,
  ArrowRight,
  FileSignature,
  FileText,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
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

export function AdvertiserCampaignRecruitmentPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<AdvertiserCampaignState>({
    status: "loading",
  });
  const [form, setForm] = useState({
    title: "",
    type: "sponsored_post" as CampaignProposalType,
    budget: "",
    summary: "",
    deadline: "",
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
            ? data.error ?? "모집글을 불러오지 못했습니다."
            : "모집글을 불러오지 못했습니다.",
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
            : "모집글을 불러오지 못했습니다.",
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
    form.budget.trim().length > 0 &&
    form.summary.trim().length > 0 &&
    form.platforms.length > 0;

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
            ? data.error ?? "모집글을 저장하지 못했습니다."
            : "모집글을 저장하지 못했습니다.",
        );
      }

      setState({
        status: "ready",
        brand: data.brand,
        campaigns: data.campaigns,
      });
      setSavedMessage("모집글이 공개 캠페인 목록에 반영되었습니다.");
      setForm((current) => ({
        ...current,
        title: "",
        budget: "",
        summary: "",
        deadline: "",
        deliverables: "",
      }));
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "모집글을 저장하지 못했습니다.",
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
      title="캠페인 모집글 작성"
      description="모집 조건을 정리한 뒤, 실제 진행은 계약 작성과 검토 링크 발급으로 이어갑니다."
      backHref="/advertiser/dashboard"
      backLabel="계약 대시보드"
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
      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[18px] border border-neutral-200 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.055)]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
            <div>
              <p className="text-[12px] font-extrabold text-neutral-400">
                모집 조건 입력
              </p>
              <h2 className="mt-1 text-[20px] font-extrabold text-neutral-950">
                새 모집글
              </h2>
            </div>
            <span className="inline-flex h-9 items-center rounded-full bg-emerald-50 px-3 text-[12px] font-extrabold text-emerald-700">
              공개 등록
            </span>
          </div>

          <div className="mt-4 grid gap-4">
            <CampaignField label="캠페인명">
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

            <div className="grid gap-3 sm:grid-cols-2">
              <CampaignField label="모집 형태">
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
              <CampaignField label="예산/조건">
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

            <CampaignField label="모집 설명">
              <textarea
                required
                rows={5}
                value={form.summary}
                onChange={(event) =>
                  setForm((current) => ({ ...current, summary: event.target.value }))
                }
                placeholder="인플루언서가 바로 판단할 수 있도록 제품, 타깃, 원하는 콘텐츠 톤, 검수 기준을 적어 주세요."
                className="campaign-input resize-none"
              />
            </CampaignField>

            <div className="grid gap-3 sm:grid-cols-2">
              <CampaignField label="제안 마감">
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, deadline: event.target.value }))
                  }
                  className="campaign-input"
                />
              </CampaignField>
              <CampaignField label="산출물">
                <input
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
            </div>

            <CampaignField label="모집 플랫폼">
              <div className="flex flex-wrap gap-2">
                {platformOptions
                  .filter((platform): platform is InfluencerPlatform => platform !== "all")
                  .map((platform) => {
                    const active = form.platforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        type="button"
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

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] bg-blue-600 px-5 text-[14px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none"
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? "저장 중" : "모집글 공개"}
            </button>
          </div>
        </form>

        <section className="rounded-[18px] border border-neutral-200 bg-[#fbfaf7] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-neutral-400">
                공개 중인 모집글
              </p>
              <h2 className="mt-1 truncate text-[20px] font-extrabold text-neutral-950">
                {brand?.displayName ?? "브랜드 프로필 준비 중"}
              </h2>
              <p className="mt-1 text-[13px] font-bold text-neutral-500">
                인플루언서 캠페인 화면에 노출됩니다.
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
            <PanelState icon={<RefreshCw className="h-5 w-5 animate-spin" />} title="모집글을 불러오는 중" />
          ) : state.status === "error" ? (
            <PanelState icon={<Megaphone className="h-5 w-5" />} title={state.message} />
          ) : campaigns.length === 0 ? (
            <PanelState
              icon={<Megaphone className="h-5 w-5" />}
              title="아직 공개 모집글이 없습니다"
              body="첫 모집글을 등록하면 인플루언서 캠페인 화면에 바로 표시됩니다."
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
              ? data.campaigns
              : buildMarketplaceCampaignPosts(marketplaceBrands),
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
      : buildMarketplaceCampaignPosts(marketplaceBrands);
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

  const platformCounts = useMemo(() => {
    const counts = Object.fromEntries(platformOptions.map((platform) => [platform, 0])) as Record<
      PlatformFilter,
      number
    >;
    counts.all = campaigns.length;
    for (const campaign of campaigns) {
      for (const platform of new Set<InfluencerPlatform>(campaign.platforms ?? [])) {
        counts[platform] += 1;
      }
    }
    return counts;
  }, [campaigns]);

  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(
      proposalTypeFilterOptions.map((type) => [type, 0]),
    ) as Record<ProposalTypeFilter, number>;
    counts.all = campaigns.length;
    for (const campaign of campaigns) counts[campaign.type] += 1;
    return counts;
  }, [campaigns]);

  const categoryOptions = useMemo(
    () => ["all", ...Array.from(new Set(campaigns.map((campaign) => campaign.brandCategory))).sort()],
    [campaigns],
  );

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      categoryOptions.map((category) => [category, 0]),
    ) as Record<CategoryFilter, number>;
    counts.all = campaigns.length;
    for (const campaign of campaigns) counts[campaign.brandCategory] += 1;
    return counts;
  }, [campaigns, categoryOptions]);

  const applyToCampaign = async (campaign: MarketplaceCampaignPost) => {
    if (applyingCampaignId) return;

    setApplyingCampaignId(campaign.id);
    setApplicationNotice(undefined);

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
      title="모집 중인 캠페인 확인"
      description="받은 계약을 우선 확인하고, 필요한 경우 모집 조건을 계약 검토 전 참고 정보로 확인합니다."
      backHref="/influencer/dashboard"
      backLabel="계약 대시보드"
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
      <section className="overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.055)]">
        <div className="grid gap-3 border-b border-neutral-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="캠페인 검색"
              placeholder="브랜드, 캠페인, 플랫폼, 산출물 검색"
              className="h-11 w-full rounded-[12px] border border-neutral-200 bg-[#f8f7f4] pl-10 pr-3 text-[13px] font-bold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white"
            />
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <FilterGroup label="플랫폼">
              {platformOptions.map((platform) => (
                <FilterButton
                  key={platform}
                  active={platformFilter === platform}
                  count={platformCounts[platform]}
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
                  count={categoryCounts[category]}
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
                  count={typeCounts[type]}
                  label={type === "all" ? "전체" : proposalTypeLabels[type]}
                  onClick={() => setProposalTypeFilter(type)}
                />
              ))}
            </FilterGroup>
          </div>
        </div>

        {state.status === "loading" ? (
          <PanelState icon={<RefreshCw className="h-5 w-5 animate-spin" />} title="캠페인을 불러오는 중" />
        ) : state.status === "error" ? (
          <PanelState icon={<Megaphone className="h-5 w-5" />} title={state.message} />
        ) : visibleCampaigns.length === 0 ? (
          <PanelState
            icon={<Megaphone className="h-5 w-5" />}
            title="조건에 맞는 캠페인이 없습니다"
            body="검색어를 줄이거나 필터를 전체로 바꿔보세요."
          />
        ) : (
          <div className="grid gap-3 bg-[#fbfaf7] p-4 lg:grid-cols-3">
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
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-neo-heavy hidden text-[19px] leading-none text-neutral-950 sm:inline">
              {PRODUCT_NAME}
            </span>
          </Link>

          <div className="no-scrollbar ml-3 flex min-w-0 items-center gap-2 overflow-x-auto">
            <Link
              to={backHref}
              className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            {actions}
          </div>
        </div>
      </header>

      <section className="border-b border-neutral-200/80 bg-[#f7f6f3]">
        <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
          <p className="inline-flex items-center gap-2 text-[13px] font-extrabold text-neutral-500">
            <Megaphone className="h-4 w-4" />
            {eyebrow}
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div className="min-w-0">
              <h1 className="font-neo-heavy text-[38px] leading-none text-neutral-950 sm:text-[48px]">
                {title}
              </h1>
              <p className="mt-4 max-w-3xl break-keep text-[14px] font-bold leading-6 text-neutral-600">
                {description}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-neutral-200 bg-white p-2 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
              <ShellMetric label="계약 전" value="조건 정리" />
              <ShellMetric label="검토" value="상대 확인" />
              <ShellMetric label="계약" value="작성 연결" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}

function ShellMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-[#f8f7f4] px-3 py-3">
      <p className="text-[11px] font-extrabold text-neutral-400">{label}</p>
      <p className="mt-1 truncate text-[13px] font-extrabold text-neutral-950">
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
    <label className="grid gap-2">
      <span className="text-[13px] font-extrabold text-neutral-800">{label}</span>
      {children}
    </label>
  );
}

function AdvertiserCampaignCard({
  campaign,
}: {
  key?: string;
  campaign: MarketplaceBrandCampaign;
}) {
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
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
          공개
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-[13px] font-bold leading-5 text-neutral-600">
        {campaign.summary ?? "상세 설명은 브랜드 프로필에서 확인합니다."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniInfo label="예산" value={campaign.budget} />
        <MiniInfo label="마감" value={getCampaignDeadlineLabel(campaign.deadline)} />
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
    <article className="flex min-h-[330px] flex-col rounded-[18px] border border-neutral-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-neutral-950 text-[13px] font-extrabold text-white">
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

      <div className="mt-4">
        <p className="text-[12px] font-extrabold text-neutral-400">
          {campaign.typeLabel}
        </p>
        <h2 className="mt-1 line-clamp-2 text-[18px] font-extrabold leading-6 text-neutral-950">
          {campaign.title}
        </h2>
        <p className="mt-3 line-clamp-3 break-keep text-[13px] font-bold leading-5 text-neutral-600">
          {campaign.summary ?? campaign.brandHeadline}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniInfo label="예산" value={campaign.budget} />
        <MiniInfo label="제안 마감" value={campaign.deadlineLabel} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(campaign.platforms ?? []).slice(0, 4).map((platform) => (
          <span
            key={platform}
            className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-extrabold ${getPlatformTone(platform)}`}
          >
            {platformLabels[platform]}
          </span>
        ))}
      </div>

      <div className="mt-auto grid gap-2 pt-5">
        <button
          type="button"
          onClick={() => onApply(campaign)}
          disabled={isApplying}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-neutral-950 px-4 text-[13px] font-extrabold text-white transition hover:bg-neutral-800"
        >
          <Send className="h-4 w-4" />
          {isApplying ? "신청 중" : "캠페인 신청"}
        </button>
        <Link
          to={campaign.brandHref}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-neutral-200 bg-white px-4 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          브랜드 보기
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="text-[11px] font-bold leading-4 text-neutral-400">
          광고주가 수락하면 캠페인 조건이 계약 초안에 반영됩니다.
        </p>
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[14px] border border-neutral-200 bg-[#fbfaf7] px-3 py-2">
      <span className="shrink-0 text-[12px] font-extrabold text-neutral-500">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  count,
  label,
  onClick,
  tone,
}: {
  key?: string;
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  const activeClass = tone ?? "border-neutral-950 bg-neutral-950 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-extrabold transition ${
        active
          ? activeClass
          : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-950"
      }`}
    >
      <span>{label}</span>
      <span className={active ? "opacity-75" : "text-neutral-300"}>
        {count.toLocaleString()}
      </span>
    </button>
  );
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
