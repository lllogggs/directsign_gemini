import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  LogOut,
  Save,
  UserRound,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { LogoMark } from "../../components/BrandLogo";
import { InfluencerAccountSettingsMenu } from "../../components/InfluencerAccountSettingsMenu";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  type InfluencerDashboardResponse,
} from "../../domain/influencerDashboard";
import { clearInfluencerDashboardPreload } from "../../domain/influencerDashboardPreload";
import {
  campaignProposalTypeOptions,
  platformLabels,
  proposalTypeLabels,
  type CampaignProposalType,
} from "../../domain/marketplace";
import { buildLoginRedirect } from "../../domain/navigation";
import {
  buildDefaultPublicProfileSettings,
  getInfluencerPublicProfilePath,
  type InfluencerPublicProfileResponse,
  type InfluencerPublicProfileSettings,
} from "../../domain/publicInfluencerProfile";
import { finishFastLoginTransition } from "../../domain/fastLoginTransition";
import { translateApiErrorMessage } from "../../domain/userMessages";
import { clearMarketplaceMessageSummaryCache } from "../../hooks/useMarketplaceMessageSummary";
import { clearVerificationSummaryCache } from "../../hooks/useVerificationSummary";

type ProfileForm = {
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  audience: string;
  categories: string;
  startingPriceLabel: string;
  responseTimeLabel: string;
  brandFit: string;
  collaborationTypes: CampaignProposalType[];
};

type PageState =
  | { status: "loading" }
  | {
      status: "ready";
      dashboard: InfluencerDashboardResponse;
      profile: InfluencerPublicProfileSettings | null;
    }
  | { status: "error"; message: string };

type PublicProfileApiPayload = InfluencerPublicProfileResponse & {
  authenticated?: boolean;
  error?: string;
};

type DashboardApiPayload =
  | InfluencerDashboardResponse
  | { authenticated?: false; error?: string };

const toProfileForm = (
  profile: InfluencerPublicProfileSettings,
): ProfileForm => ({
  displayName: profile.displayName,
  headline: profile.headline,
  bio: profile.bio,
  location: profile.location,
  audience: profile.audience,
  categories: profile.categories.join(", "),
  startingPriceLabel: profile.startingPriceLabel,
  responseTimeLabel: profile.responseTimeLabel,
  brandFit: profile.brandFit.join("\n"),
  collaborationTypes: profile.collaborationTypes,
});

const parseListField = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 6);

const readJson = async <T,>(response: Response) =>
  (await response.json().catch(() => ({}))) as T;

export function InfluencerPublicProfileSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | undefined>();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saveSuccess, setSaveSuccess] = useState<string | undefined>();

  const redirectToLogin = useCallback(() => {
    const currentPath = `${location.pathname}${location.search}`;
    navigate(
      buildLoginRedirect(
        "/login/influencer",
        currentPath,
        "/influencer/dashboard",
        ["/influencer"],
      ),
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  const loadProfile = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({ status: "loading" });
    setSaveError(undefined);
    setSaveSuccess(undefined);

    try {
      const [profileResponse, dashboardResponse] = await Promise.all([
        apiFetch("/api/influencer/public-profile", {
          headers: { Accept: "application/json" },
          credentials: "include",
        }),
        apiFetch("/api/influencer/dashboard?includeApplications=false", {
          headers: { Accept: "application/json" },
          credentials: "include",
        }),
      ]);
      const [profilePayload, dashboardPayload] = await Promise.all([
        readJson<PublicProfileApiPayload>(profileResponse),
        readJson<DashboardApiPayload>(dashboardResponse),
      ]);

      if (requestId !== requestIdRef.current) return;
      if (
        profileResponse.status === 401 ||
        dashboardResponse.status === 401 ||
        profilePayload.authenticated === false ||
        dashboardPayload.authenticated === false
      ) {
        redirectToLogin();
        return;
      }

      if (!profileResponse.ok) {
        throw new Error(
          profilePayload.error ?? "공개 프로필을 불러오지 못했습니다.",
        );
      }
      if (!dashboardResponse.ok || dashboardPayload.authenticated !== true) {
        const errorMessage =
          "error" in dashboardPayload &&
          typeof dashboardPayload.error === "string"
            ? dashboardPayload.error
            : undefined;
        throw new Error(
          errorMessage ?? "인플루언서 계정 정보를 불러오지 못했습니다.",
        );
      }

      const profile = profilePayload.profile ?? null;
      const formSource =
        profile ?? buildDefaultPublicProfileSettings(dashboardPayload);
      setState({ status: "ready", dashboard: dashboardPayload, profile });
      setForm(toProfileForm(formSource));
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState({
        status: "error",
        message: translateApiErrorMessage(
          error instanceof Error ? error.message : undefined,
          "공개 프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ),
      });
    }
  }, [redirectToLogin]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [loadProfile]);

  const canSave = useMemo(() => {
    if (!form) return false;
    return (
      form.displayName.trim().length > 0 &&
      form.headline.trim().length > 0 &&
      form.bio.trim().length > 0 &&
      form.location.trim().length > 0 &&
      form.audience.trim().length > 0 &&
      parseListField(form.categories).length > 0 &&
      form.startingPriceLabel.trim().length > 0 &&
      form.responseTimeLabel.trim().length > 0 &&
      parseListField(form.brandFit).length > 0 &&
      form.collaborationTypes.length > 0
    );
  }, [form]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || !canSave || isSaving || state.status !== "ready") return;

    setIsSaving(true);
    setSaveError(undefined);
    setSaveSuccess(undefined);

    try {
      const response = await apiFetch("/api/influencer/public-profile", {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          headline: form.headline.trim(),
          bio: form.bio.trim(),
          location: form.location.trim(),
          audience: form.audience.trim(),
          categories: parseListField(form.categories),
          startingPriceLabel: form.startingPriceLabel.trim(),
          responseTimeLabel: form.responseTimeLabel.trim(),
          brandFit: parseListField(form.brandFit),
          collaborationTypes: form.collaborationTypes,
        }),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = await readJson<{
        profile?: InfluencerPublicProfileSettings;
        error?: string;
      }>(response);
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error ?? "공개 프로필을 저장하지 못했습니다.");
      }

      setState((current) =>
        current.status === "ready"
          ? { ...current, profile: payload.profile ?? null }
          : current,
      );
      setForm(toProfileForm(payload.profile));
      setSaveSuccess("공개 프로필을 저장했습니다.");
    } catch (error) {
      setSaveError(
        translateApiErrorMessage(
          error instanceof Error ? error.message : undefined,
          "공개 프로필을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarSelect = async (file: File | undefined) => {
    if (!file || isAvatarUploading || state.status !== "ready") return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setAvatarUploadError("PNG, JPG, WebP 이미지만 올릴 수 있습니다.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setAvatarUploadError("이미지는 3MB 이하로 올려주세요.");
      return;
    }

    setIsAvatarUploading(true);
    setAvatarUploadError(undefined);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await apiFetch("/api/influencer/public-profile/avatar", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            data_url: dataUrl,
          },
        }),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = await readJson<{ image_url?: string; error?: string }>(
        response,
      );
      if (!response.ok || !payload.image_url) {
        throw new Error(payload.error ?? "이미지를 저장하지 못했습니다.");
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              dashboard: {
                ...current.dashboard,
                user: {
                  ...current.dashboard.user,
                  avatar_url: payload.image_url,
                },
              },
            }
          : current,
      );
    } catch (error) {
      setAvatarUploadError(
        translateApiErrorMessage(
          error instanceof Error ? error.message : undefined,
          "이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ),
      );
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/influencer/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] influencer logout request failed`, error);
    } finally {
      finishFastLoginTransition("influencer");
      clearInfluencerDashboardPreload();
      clearVerificationSummaryCache("influencer");
      clearMarketplaceMessageSummaryCache("influencer");
      navigate("/login/influencer", { replace: true });
    }
  };

  const savedHandle =
    state.status === "ready" && state.profile?.handle
      ? state.profile.handle
      : undefined;
  const account =
    state.status === "ready"
      ? {
          name: state.dashboard.user.name || "인플루언서",
          email: state.dashboard.user.email,
        }
      : { name: "인플루언서" };

  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950">
      <ProfileAppHeader
        savedHandle={savedHandle}
        account={account}
        accountMenuOpen={accountMenuOpen}
        onDashboard={() => navigate("/influencer/dashboard")}
        onLogout={handleLogout}
        onToggleSettings={() => setAccountMenuOpen((current) => !current)}
        onCloseSettings={() => setAccountMenuOpen(false)}
        onManageProfile={() => setAccountMenuOpen(false)}
        onChangePassword={() => {
          setAccountMenuOpen(false);
          navigate("/reset-password?role=influencer");
        }}
      />

      <main className="mx-auto w-full max-w-[980px] px-3 py-4 sm:px-5 sm:py-6">
        {state.status === "loading" ? (
          <ProfileLoadingView />
        ) : state.status === "error" ? (
          <ProfileErrorView message={state.message} onRetry={loadProfile} />
        ) : !form ? (
          <ProfileLoadingView />
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-neutral-500">
                  인플루언서 계정
                </p>
                <h1 className="mt-1 text-[26px] font-bold leading-tight text-neutral-950 sm:text-[30px]">
                  공개 프로필 관리
                </h1>
              </div>
              <span
                className={`inline-flex h-8 w-fit items-center rounded-full border px-3 text-[12px] font-semibold ${
                  state.profile?.published
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-neutral-200 bg-white text-neutral-600"
                }`}
              >
                {state.profile?.published ? "공개 중" : "저장 전"}
              </span>
            </div>

            <section className="overflow-hidden rounded-[8px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.05)]">
              <div className="border-b border-neutral-200 bg-[#fbfbf9] px-4 py-3 sm:px-5">
                <h2 className="text-[15px] font-bold text-neutral-950">
                  프로필 정보
                </h2>
              </div>

              <form onSubmit={handleSubmit}>
                <ProfileField label="프로필 이미지" fieldId="profile-avatar">
                  <div
                    id="profile-avatar"
                    className="flex flex-wrap items-center gap-3"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200">
                      {state.dashboard.user.avatar_url ? (
                        <img
                          src={state.dashboard.user.avatar_url}
                          alt="현재 프로필 이미지"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserRound className="h-6 w-6" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isAvatarUploading}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-neutral-200 bg-white px-3 text-[13px] font-bold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-wait disabled:text-neutral-400"
                      >
                        <ImagePlus className="h-4 w-4" />
                        {isAvatarUploading ? "업로드 중" : "이미지 변경"}
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(event) => {
                          void handleAvatarSelect(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                      {avatarUploadError ? (
                        <p
                          role="alert"
                          className="mt-2 text-[12px] font-semibold text-rose-700"
                        >
                          {avatarUploadError}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[12px] font-medium text-neutral-500">
                          PNG, JPG, WebP · 최대 3MB
                        </p>
                      )}
                    </div>
                  </div>
                </ProfileField>

                <ProfileField label="활동명" htmlFor="profile-display-name">
                  <input
                    id="profile-display-name"
                    required
                    value={form.displayName}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, displayName: event.target.value }
                          : current,
                      )
                    }
                    className="marketplace-input"
                    autoComplete="name"
                  />
                </ProfileField>

                <ProfileField label="한 줄 소개" htmlFor="profile-headline">
                  <input
                    id="profile-headline"
                    required
                    value={form.headline}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, headline: event.target.value }
                          : current,
                      )
                    }
                    className="marketplace-input"
                  />
                </ProfileField>

                <ProfileField label="소개" htmlFor="profile-bio">
                  <textarea
                    id="profile-bio"
                    required
                    rows={5}
                    value={form.bio}
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, bio: event.target.value } : current,
                      )
                    }
                    className="marketplace-input resize-y"
                  />
                </ProfileField>

                <ProfileField label="활동 지역" htmlFor="profile-location">
                  <input
                    id="profile-location"
                    required
                    value={form.location}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, location: event.target.value }
                          : current,
                      )
                    }
                    className="marketplace-input"
                  />
                </ProfileField>

                <ProfileField label="주요 오디언스" htmlFor="profile-audience">
                  <input
                    id="profile-audience"
                    required
                    value={form.audience}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, audience: event.target.value }
                          : current,
                      )
                    }
                    className="marketplace-input"
                  />
                </ProfileField>

                <ProfileField label="카테고리" htmlFor="profile-categories">
                  <input
                    id="profile-categories"
                    required
                    value={form.categories}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, categories: event.target.value }
                          : current,
                      )
                    }
                    placeholder="뷰티, 라이프스타일, 패션"
                    className="marketplace-input"
                  />
                </ProfileField>

                <ProfileField label="시작 금액" htmlFor="profile-starting-price">
                  <input
                    id="profile-starting-price"
                    required
                    value={form.startingPriceLabel}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, startingPriceLabel: event.target.value }
                          : current,
                      )
                    }
                    placeholder="예: 30만원부터"
                    className="marketplace-input"
                  />
                </ProfileField>

                <ProfileField label="응답 시간" htmlFor="profile-response-time">
                  <input
                    id="profile-response-time"
                    required
                    value={form.responseTimeLabel}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, responseTimeLabel: event.target.value }
                          : current,
                      )
                    }
                    placeholder="예: 영업일 기준 2일 이내"
                    className="marketplace-input"
                  />
                </ProfileField>

                <ProfileField label="브랜드 적합 조건" htmlFor="profile-brand-fit">
                  <textarea
                    id="profile-brand-fit"
                    required
                    rows={4}
                    value={form.brandFit}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, brandFit: event.target.value }
                          : current,
                      )
                    }
                    placeholder={"지속 가능한 제품\n콘텐츠 활용 범위 사전 협의"}
                    className="marketplace-input resize-y"
                  />
                </ProfileField>

                <ProfileField label="협업 형태" fieldId="profile-collaboration-types">
                  <div
                    id="profile-collaboration-types"
                    className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {campaignProposalTypeOptions.map((type) => {
                      const checked = form.collaborationTypes.includes(type);
                      return (
                        <label
                          key={type}
                          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[8px] border border-neutral-200 bg-[#fbfaf7] px-3 text-[13px] font-semibold text-neutral-800 transition hover:border-neutral-300 hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setForm((current) => {
                                if (!current) return current;
                                const collaborationTypes = checked
                                  ? current.collaborationTypes.filter(
                                      (item) => item !== type,
                                    )
                                  : [...current.collaborationTypes, type];
                                return { ...current, collaborationTypes };
                              })
                            }
                            className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>{proposalTypeLabels[type]}</span>
                        </label>
                      );
                    })}
                  </div>
                </ProfileField>

                <div className="border-t border-neutral-200 bg-[#fbfbf9] px-4 py-3 sm:px-5">
                  <h2 className="text-[15px] font-bold text-neutral-950">
                    인증된 플랫폼 계정
                  </h2>
                </div>
                <VerifiedPlatformRows
                  platforms={state.dashboard.verification.approved_platforms}
                />

                <div className="flex flex-col gap-3 border-t border-neutral-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-h-5" aria-live="polite">
                    {saveError ? (
                      <p className="flex items-start gap-2 text-[13px] font-semibold text-rose-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{saveError}</span>
                      </p>
                    ) : saveSuccess ? (
                      <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>{saveSuccess}</span>
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    disabled={!canSave || isSaving}
                    className="yl-primary-action inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-[8px] px-5 text-[13px] font-bold transition disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none sm:w-[160px]"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "저장 중" : "변경사항 저장"}
                  </button>
                </div>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ProfileAppHeader({
  savedHandle,
  account,
  accountMenuOpen,
  onDashboard,
  onLogout,
  onToggleSettings,
  onCloseSettings,
  onManageProfile,
  onChangePassword,
}: {
  savedHandle?: string;
  account: { name: string; email?: string };
  accountMenuOpen: boolean;
  onDashboard: () => void;
  onLogout: () => void;
  onToggleSettings: () => void;
  onCloseSettings: () => void;
  onManageProfile: () => void;
  onChangePassword: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
        <button
          type="button"
          onClick={onDashboard}
          className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          aria-label={`${PRODUCT_NAME} 1:1 계약`}
        >
          <LogoMark />
          <span className="font-neo-heavy text-[18px] leading-none">
            {PRODUCT_NAME}
          </span>
        </button>

        <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
          {savedHandle ? (
            <Link
              to={getInfluencerPublicProfilePath(savedHandle)}
              target="_blank"
              rel="noreferrer"
              className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
              aria-label="공개 프로필 보기"
              title="공개 프로필 보기"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>공개 프로필</span>
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onDashboard}
            className="yl-header-action yl-header-action-secondary"
            aria-label="1:1 계약 대시보드"
            title="1:1 계약 대시보드"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">1:1 계약</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="yl-header-action yl-header-action-secondary"
            aria-label="로그아웃"
            title="로그아웃"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
          <InfluencerAccountSettingsMenu
            account={account}
            open={accountMenuOpen}
            onToggle={onToggleSettings}
            onClose={onCloseSettings}
            onManageProfile={onManageProfile}
            onChangePassword={onChangePassword}
          />
        </div>
      </div>
    </header>
  );
}

function ProfileField({
  label,
  htmlFor,
  fieldId,
  children,
}: {
  label: string;
  htmlFor?: string;
  fieldId?: string;
  children: ReactNode;
}) {
  const labelClassName = "pt-1 text-[13px] font-bold text-neutral-900";
  return (
    <div
      role={fieldId ? "group" : undefined}
      aria-labelledby={fieldId ? `${fieldId}-label` : undefined}
      className="grid gap-2 border-b border-neutral-100 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-5 sm:px-5"
    >
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClassName}>
          {label}
        </label>
      ) : (
        <span id={fieldId ? `${fieldId}-label` : undefined} className={labelClassName}>
          {label}
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function VerifiedPlatformRows({
  platforms,
}: {
  platforms: InfluencerDashboardResponse["verification"]["approved_platforms"];
}) {
  if (platforms.length === 0) {
    return (
      <div className="px-4 py-5 text-[13px] font-semibold text-neutral-500 sm:px-5">
        인증된 플랫폼 계정이 없습니다.
      </div>
    );
  }

  return (
    <div>
      {platforms.map((account, index) => (
        <div
          key={`${account.platform}-${account.handle}-${index}`}
          className="grid min-h-16 gap-2 border-b border-neutral-100 px-4 py-3 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:px-5"
        >
          <span className="text-[13px] font-bold text-neutral-900">
            {platformLabels[account.platform]}
          </span>
          <div className="flex min-w-0 items-center gap-2.5">
            <PlatformBrandMark platform={account.platform} />
            <span className="truncate text-[13px] font-semibold text-neutral-700">
              {account.handle}
            </span>
            <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700">
              인증
            </span>
          </div>
          {account.url ? (
            <a
              href={account.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-fit items-center gap-1.5 rounded-[8px] border border-neutral-200 bg-white px-3 text-[12px] font-bold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 sm:justify-self-end"
              aria-label={`${platformLabels[account.platform]} 인증 계정 보기`}
              title={`${platformLabels[account.platform]} 인증 계정 보기`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              계정 보기
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProfileLoadingView() {
  return (
    <section
      className="overflow-hidden rounded-[8px] border border-neutral-200 bg-white"
      aria-label="공개 프로필 불러오는 중"
    >
      <div className="h-12 border-b border-neutral-200 bg-[#fbfbf9]" />
      <div className="grid gap-4 p-5">
        {["name", "headline", "bio", "location", "audience"].map((item) => (
          <div
            key={item}
            className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-5"
          >
            <span className="h-4 w-20 rounded bg-neutral-200" />
            <span className="h-11 w-full rounded-[8px] bg-neutral-100" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfileErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="flex min-h-[360px] flex-col items-center justify-center rounded-[8px] border border-neutral-200 bg-white px-5 py-10 text-center">
      <AlertCircle className="h-6 w-6 text-rose-700" />
      <h1 className="mt-4 text-[20px] font-bold text-neutral-950">
        공개 프로필을 불러오지 못했습니다
      </h1>
      <p className="mt-2 max-w-md text-[13px] font-medium leading-6 text-neutral-600">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-10 items-center justify-center rounded-[8px] border border-neutral-200 bg-white px-4 text-[13px] font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50"
      >
        다시 시도
      </button>
    </section>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("이미지를 읽지 못했습니다."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}
