import { ArrowRight, CheckCircle2, FileSignature } from "lucide-react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { PRODUCT_NAME } from "../../domain/brand";

export type GlobalCreatorLocale = "en" | "ja" | "zh";

type GlobalCreatorLandingCopy = {
  path: string;
  navLogin: string;
  eyebrow: string;
  title: string[];
  subtitle: string;
  primaryCta: string;
  trustLine: string;
  audienceLabel: string;
  audienceItems: string[];
  painEyebrow: string;
  painTitle: string;
  painItems: string[];
  flowTitle: string;
  flowItems: Array<{ title: string; description: string }>;
  proofTitle: string;
  proofItems: string[];
  boundary: string;
  campaignPreview: {
    title: string;
    tabs: string[];
    brand: string;
    campaign: string;
    rewardLabel: string;
    reward: string;
    deadlineLabel: string;
    deadline: string;
    apply: string;
  };
  contractPreview: {
    title: string;
    verified: string;
    rows: Array<{ label: string; value: string }>;
  };
  screenshotAlt: string;
};

const mobileCampaignScreenshot = new URL(
  "../../../docs/sales/assets/yeollock-intro-campaigns-mobile.png",
  import.meta.url,
).href;

const globalCreatorLandingCopies: Record<
  GlobalCreatorLocale,
  GlobalCreatorLandingCopy
> = {
  en: {
    path: "/en/creators",
    navLogin: "Log in",
    eyebrow: "For creators working with Korea",
    title: ["K-brand deals,", "clear contracts."],
    subtitle:
      "Yeollock helps global creators review Korean brand campaigns, confirm content terms, sign digitally, and keep proof in one place.",
    primaryCta: "Join as creator",
    trustLine:
      "Built for K-beauty, K-fashion, travel, food, and lifestyle collaborations.",
    audienceLabel: "Good fit for",
    audienceItems: [
      "K-beauty reviewers",
      "K-fashion creators",
      "Korea travel creators",
      "K-lifestyle channels",
    ],
    painEyebrow: "Contract first",
    painTitle: "Korean collaborations should not stay buried in DMs.",
    painItems: [
      "Campaign terms can be unclear across languages.",
      "Deadlines, content rights, and revision requests need written proof.",
      "Your signed PDF should be easy to find after the campaign.",
    ],
    flowTitle: "What Yeollock keeps clear",
    flowItems: [
      {
        title: "Campaign terms",
        description:
          "Brand, platform, content type, reward, and deadline are shown before you apply or sign.",
      },
      {
        title: "Contract review",
        description:
          "Open the contract link, check the PDF, and request clear changes before signing.",
      },
      {
        title: "Proof archive",
        description:
          "Keep signed PDFs and key contract evidence in one service account.",
      },
    ],
    proofTitle: "Made for Korean brand operations",
    proofItems: [
      "Digital contract link",
      "Verified creator channels",
      "Content and deadline records",
      "Signed PDF evidence",
    ],
    boundary:
      "Yeollock organizes contracts, e-signatures, and evidence. Ad fees, payouts, taxes, refunds, and escrow remain between the brand and creator.",
    campaignPreview: {
      title: "Korean campaign board",
      tabs: ["Beauty", "Fashion", "Travel"],
      brand: "Seoul skincare brand",
      campaign: "Reels + Story review",
      rewardLabel: "Reward",
      reward: "KRW 1.8M",
      deadlineLabel: "Deadline",
      deadline: "D-7",
      apply: "Apply with profile",
    },
    contractPreview: {
      title: "Contract summary",
      verified: "Business verified",
      rows: [
        { label: "Platform", value: "Instagram" },
        { label: "Content", value: "Reels, Story" },
        { label: "Revision", value: "1 request" },
      ],
    },
    screenshotAlt: "Yeollock Korean campaign screen",
  },
  ja: {
    path: "/ja/creators",
    navLogin: "ログイン",
    eyebrow: "韓国が好きなクリエイターへ",
    title: ["韓国ブランド案件を", "契約まで明確に。"],
    subtitle:
      "Yeollockなら、韓国ブランドの募集内容、制作条件、電子署名、PDF証拠を一つの場所で確認できます。",
    primaryCta: "クリエイター登録",
    trustLine:
      "K-beauty、K-fashion、旅行、グルメ、ライフスタイル案件に対応。",
    audienceLabel: "対象",
    audienceItems: [
      "K-beautyレビュー",
      "韓国旅行クリエイター",
      "K-fashion発信",
      "ライフスタイル投稿",
    ],
    painEyebrow: "契約を先に",
    painTitle: "韓国ブランドとのやり取りを、DMだけで終わらせない。",
    painItems: [
      "言語が違うと、募集条件の認識がずれやすい。",
      "締切、使用範囲、修正依頼は書面で残す必要があります。",
      "署名済みPDFを案件後もすぐ確認できます。",
    ],
    flowTitle: "Yeollockで確認できること",
    flowItems: [
      {
        title: "募集条件",
        description:
          "ブランド、掲載先、制作内容、報酬、締切を応募前・署名前に確認できます。",
      },
      {
        title: "契約レビュー",
        description:
          "契約リンクからPDFを開き、署名前に必要な修正を明確に依頼できます。",
      },
      {
        title: "証拠保管",
        description:
          "署名済みPDFと主要な契約記録を一つのアカウントに残せます。",
      },
    ],
    proofTitle: "韓国ブランド案件の記録を一か所に",
    proofItems: [
      "電子契約リンク",
      "認証済みチャンネル",
      "制作条件と締切",
      "署名済みPDF",
    ],
    boundary:
      "Yeollockは契約書作成、電子署名、証拠保管を整理します。広告費の支払い、税金、返金、エスクローはブランドとクリエイター間で行います。",
    campaignPreview: {
      title: "韓国キャンペーン",
      tabs: ["美容", "ファッション", "旅行"],
      brand: "ソウルのスキンケアブランド",
      campaign: "Reels + Storyレビュー",
      rewardLabel: "報酬",
      reward: "KRW 1.8M",
      deadlineLabel: "締切",
      deadline: "D-7",
      apply: "プロフィールで応募",
    },
    contractPreview: {
      title: "契約サマリー",
      verified: "事業者認証済み",
      rows: [
        { label: "掲載先", value: "Instagram" },
        { label: "内容", value: "Reels, Story" },
        { label: "修正", value: "1回" },
      ],
    },
    screenshotAlt: "Yeollockの韓国キャンペーン画面",
  },
  zh: {
    path: "/zh/creators",
    navLogin: "登录",
    eyebrow: "面向关注韩国的创作者",
    title: ["韩国品牌合作，", "签约前说清楚。"],
    subtitle:
      "Yeollock 帮助海外创作者查看韩国品牌活动、确认内容条件、在线签署，并统一保存 PDF 证据。",
    primaryCta: "注册创作者",
    trustLine: "适用于 K-beauty、K-fashion、旅行、美食和生活方式合作。",
    audienceLabel: "适合",
    audienceItems: [
      "K-beauty 测评",
      "韩国旅行创作者",
      "K-fashion 内容",
      "生活方式频道",
    ],
    painEyebrow: "先看合同",
    painTitle: "韩国品牌合作，不只停留在私信里。",
    painItems: [
      "跨语言沟通时，活动条件容易理解不一致。",
      "截止日、内容使用权和修改要求都需要书面记录。",
      "签署后的 PDF 应该在活动结束后也能随时找到。",
    ],
    flowTitle: "Yeollock 帮你确认",
    flowItems: [
      {
        title: "活动条件",
        description:
          "在申请或签约前，确认品牌、平台、内容形式、报酬和截止日。",
      },
      {
        title: "合同确认",
        description:
          "打开合同链接，查看 PDF，并在签署前清楚提出需要修改的内容。",
      },
      {
        title: "证据保存",
        description:
          "将签署后的 PDF 和关键合同记录保存在同一个服务账号中。",
      },
    ],
    proofTitle: "为韩国品牌合作保留记录",
    proofItems: [
      "电子合同链接",
      "已认证创作者频道",
      "内容与截止日记录",
      "签署 PDF 证据",
    ],
    boundary:
      "Yeollock 负责整理合同、电子签名和证据保存。广告费用、结算、税务、退款和托管由品牌与创作者自行处理。",
    campaignPreview: {
      title: "韩国活动看板",
      tabs: ["美妆", "时尚", "旅行"],
      brand: "首尔护肤品牌",
      campaign: "Reels + Story 测评",
      rewardLabel: "报酬",
      reward: "KRW 1.8M",
      deadlineLabel: "截止日",
      deadline: "D-7",
      apply: "用资料申请",
    },
    contractPreview: {
      title: "合同摘要",
      verified: "企业认证完成",
      rows: [
        { label: "平台", value: "Instagram" },
        { label: "内容", value: "Reels, Story" },
        { label: "修改", value: "1次" },
      ],
    },
    screenshotAlt: "Yeollock 韩国品牌活动页面",
  },
};

const globalCreatorLanguageOrder: GlobalCreatorLocale[] = ["en", "ja", "zh"];

const getPageLang = (locale: GlobalCreatorLocale) =>
  locale === "ja" ? "ja" : locale === "zh" ? "zh-CN" : "en";

const getLocalizedAuthHref = (
  path: "/login/influencer" | "/signup/influencer",
  locale: GlobalCreatorLocale,
) => `${path}?locale=${locale}&source=global-creators`;

export function GlobalCreatorLandingPage({
  locale,
}: {
  locale: GlobalCreatorLocale;
}) {
  const copy = globalCreatorLandingCopies[locale];
  const heroTitleSizeClass =
    locale === "en" ? "sm:text-[64px] lg:text-[72px]" : "sm:text-[58px] lg:text-[64px]";

  return (
    <main
      lang={getPageLang(locale)}
      data-global-creator-page={locale}
      className="min-h-screen overflow-x-hidden bg-[#f4f5f2] font-sans text-neutral-950"
    >
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-[60px] max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="yl-brand-action -ml-1 flex min-w-0 items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            aria-label={`${PRODUCT_NAME} home`}
          >
            <BrandLogo />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <LanguageSwitcher locale={locale} className="flex" />
            <Link
              to={getLocalizedAuthHref("/login/influencer", locale)}
              className="yl-secondary-action inline-flex h-9 shrink-0 items-center justify-center rounded-[8px] border px-3 text-[12px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              {copy.navLogin}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-neutral-200/70 bg-[#eef1ec]">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-[#e3e7df]"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid w-full max-w-[1500px] px-4 pb-7 pt-8 sm:px-6 sm:pb-10 sm:pt-10 lg:min-h-[calc(100svh-60px)] lg:grid-cols-[minmax(0,0.92fr)_minmax(560px,1.08fr)] lg:items-center lg:gap-8 lg:py-10">
          <div className="relative z-10 max-w-[720px] pt-2 lg:pt-0">
            <p className="text-[12px] font-extrabold uppercase leading-none tracking-normal text-blue-700">
              {copy.eyebrow}
            </p>
            <h1
              className={`font-neo-heavy mt-4 text-[37px] leading-[1.06] tracking-normal text-neutral-950 ${heroTitleSizeClass}`}
            >
              {copy.title.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-5 max-w-[620px] text-[16px] font-bold leading-7 text-neutral-600 sm:text-[18px] sm:leading-8">
              {copy.subtitle}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to={getLocalizedAuthHref("/signup/influencer", locale)}
                className="inline-flex h-12 items-center justify-center rounded-[9px] bg-blue-600 px-5 text-[14px] font-extrabold text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)] ring-1 ring-blue-500/20 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
              >
                {copy.primaryCta}
                <ArrowRight className="ml-2 h-4 w-4" strokeWidth={2.3} />
              </Link>
              <span className="hidden text-[12px] font-extrabold leading-5 text-neutral-500 sm:inline">
                {copy.trustLine}
              </span>
            </div>
            <div className="mt-8 hidden max-w-[620px] gap-2 sm:grid sm:grid-cols-[auto_1fr] sm:items-start sm:gap-4">
              <p className="text-[12px] font-extrabold uppercase leading-8 tracking-normal text-neutral-400">
                {copy.audienceLabel}
              </p>
              <div className="flex flex-wrap gap-2">
                {copy.audienceItems.map((item) => (
                  <span
                    key={item}
                    className="inline-flex min-h-8 items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-[12px] font-extrabold leading-5 text-neutral-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <GlobalCreatorHeroVisual copy={copy} />

          <div className="relative z-10 grid max-w-[620px] gap-2 sm:hidden">
            <p className="text-[12px] font-extrabold uppercase leading-8 tracking-normal text-neutral-400">
              {copy.audienceLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              {copy.audienceItems.map((item) => (
                <span
                  key={item}
                  className="inline-flex min-h-8 items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-[12px] font-extrabold leading-5 text-neutral-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1500px] gap-5 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-8 lg:py-16">
        <div className="max-w-[620px]">
          <p className="text-[12px] font-extrabold uppercase tracking-normal text-blue-700">
            {copy.painEyebrow}
          </p>
          <h2 className="font-neo-heavy mt-3 text-[30px] leading-tight tracking-normal text-neutral-950 sm:text-[42px]">
            {copy.painTitle}
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {copy.painItems.map((item, index) => (
            <article
              key={item}
              className="yl-card grid min-h-[128px] content-between border p-4 sm:min-h-[164px]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-neutral-950 text-[12px] font-black text-white">
                {index + 1}
              </span>
              <p className="mt-5 text-[15px] font-extrabold leading-6 text-neutral-800">
                {item}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-neutral-200/70 bg-white">
        <div className="mx-auto grid w-full max-w-[1500px] gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.6fr)] lg:items-start lg:gap-8">
          <div>
            <h2 className="font-neo-heavy text-[30px] leading-tight tracking-normal text-neutral-950 sm:text-[40px]">
              {copy.flowTitle}
            </h2>
            <div className="mt-6 grid gap-3">
              {copy.flowItems.map((item) => (
                <article
                  key={item.title}
                  className="grid gap-2 border-t border-neutral-200 py-5 sm:grid-cols-[190px_1fr] sm:gap-6"
                >
                  <h3 className="text-[17px] font-black text-neutral-950">
                    {item.title}
                  </h3>
                  <p className="text-[14px] font-bold leading-6 text-neutral-600">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
          <aside className="yl-panel border p-5">
            <h2 className="text-[20px] font-black leading-tight text-neutral-950">
              {copy.proofTitle}
            </h2>
            <div className="mt-5 grid gap-2.5">
              {copy.proofItems.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-[8px] border border-neutral-200 bg-white px-3 py-2.5"
                >
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-blue-600"
                    strokeWidth={2.3}
                  />
                  <span className="text-[13px] font-extrabold text-neutral-800">
                    {item}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-5 border-t border-neutral-200 pt-4 text-[12px] font-bold leading-5 text-neutral-500">
              {copy.boundary}
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}

function LanguageSwitcher({
  locale,
  className,
}: {
  locale: GlobalCreatorLocale;
  className: string;
}) {
  return (
    <nav
      aria-label="Creator page languages"
      className={`${className} w-fit items-center rounded-[10px] border border-neutral-200 bg-white p-1`}
    >
      {globalCreatorLanguageOrder.map((language) => {
        const languageCopy = globalCreatorLandingCopies[language];
        const isActive = language === locale;
        return (
          <Link
            key={language}
            to={languageCopy.path}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex h-8 min-w-10 items-center justify-center rounded-[7px] px-2.5 text-[12px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
              isActive
                ? "bg-neutral-950 text-white"
                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950"
            }`}
          >
            {language.toUpperCase()}
          </Link>
        );
      })}
    </nav>
  );
}

function GlobalCreatorHeroVisual({
  copy,
}: {
  copy: GlobalCreatorLandingCopy;
}) {
  return (
    <div
      data-global-hero-visual
      className="relative z-0 mt-7 min-h-[370px] w-full sm:min-h-[470px] lg:mt-0 lg:min-h-[560px]"
    >
      <div
        className="absolute left-1/2 top-4 h-[350px] w-[min(92vw,650px)] -translate-x-1/2 rounded-[24px] border border-white/80 bg-white/78 shadow-[0_28px_80px_rgba(15,23,42,0.13)] backdrop-blur sm:h-[520px] lg:left-auto lg:right-0 lg:top-1/2 lg:h-[520px] lg:w-[650px] lg:translate-x-0 lg:-translate-y-1/2"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid w-full max-w-[680px] grid-cols-[minmax(0,1fr)_124px] gap-3 pt-7 sm:grid-cols-[minmax(0,1fr)_190px] sm:gap-4 sm:pt-12 lg:pt-14">
        <section className="overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-[0_20px_58px_rgba(15,23,42,0.13)]">
          <div className="flex h-11 items-center justify-between border-b border-neutral-200 bg-[#f7f8f4] px-3 sm:h-12 sm:px-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
            </div>
            <span className="text-[11px] font-black text-neutral-400">
              yeollock.me
            </span>
          </div>
          <div className="p-3 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-extrabold text-neutral-400 sm:text-[12px]">
                  {copy.campaignPreview.title}
                </p>
                <h2 className="mt-1 text-[18px] font-black leading-tight text-neutral-950 sm:text-[28px]">
                  {copy.campaignPreview.brand}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <PlatformBrandMark platform="instagram" size="sm" />
                <PlatformBrandMark platform="tiktok" size="sm" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
              {copy.campaignPreview.tabs.map((tab, index) => (
                <span
                  key={tab}
                  className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-[10px] font-black leading-4 sm:h-8 sm:px-3 sm:text-[11px] ${
                    index === 0
                      ? "bg-neutral-950 text-white"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {tab}
                </span>
              ))}
            </div>
            <div className="mt-4 grid gap-3 rounded-[14px] border border-neutral-200 bg-[#fbfbf8] p-3 sm:mt-5 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-black text-neutral-950 sm:text-[13px]">
                  {copy.campaignPreview.campaign}
                </span>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                  {copy.campaignPreview.deadline}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-neutral-200 pt-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-neutral-400">
                    {copy.campaignPreview.rewardLabel}
                  </p>
                  <p className="mt-1 truncate text-[13px] font-black text-neutral-950 sm:text-[15px]">
                    {copy.campaignPreview.reward}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-neutral-400">
                    {copy.campaignPreview.deadlineLabel}
                  </p>
                  <p className="mt-1 text-[13px] font-black text-neutral-950 sm:text-[15px]">
                    {copy.campaignPreview.deadline}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="mt-1 inline-flex min-h-10 items-center justify-center rounded-[8px] bg-blue-600 px-2 py-2 text-[12px] font-black leading-4 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)]"
              >
                {copy.campaignPreview.apply}
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[22px] border border-neutral-200 bg-neutral-950 p-2 shadow-[0_18px_52px_rgba(15,23,42,0.18)]">
          <div className="overflow-hidden rounded-[16px] bg-white">
            <img
              src={mobileCampaignScreenshot}
              alt={copy.screenshotAlt}
              className="h-[258px] w-full object-cover object-top sm:h-[390px]"
              loading="eager"
            />
          </div>
        </section>

        <section className="col-span-2 -mt-1 ml-auto w-[min(94%,460px)] rounded-[16px] border border-neutral-200 bg-white p-3 shadow-[0_18px_52px_rgba(15,23,42,0.12)] sm:-mt-12 sm:mr-8 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileSignature
                className="h-4 w-4 shrink-0 text-blue-700"
                strokeWidth={2.4}
              />
              <h2 className="truncate text-[14px] font-black text-neutral-950">
                {copy.contractPreview.title}
              </h2>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
              {copy.contractPreview.verified}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {copy.contractPreview.rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[82px_1fr] items-center gap-3 border-t border-neutral-200 pt-2 first:border-t-0 first:pt-0 sm:grid-cols-[92px_1fr]"
              >
                <span className="text-[11px] font-extrabold text-neutral-400">
                  {row.label}
                </span>
                <span className="min-w-0 text-[13px] font-black text-neutral-950">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
