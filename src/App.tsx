import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
  Link,
} from "react-router-dom";
import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import { AdvertiserAuthGate } from "./pages/marketing/AdvertiserAuthGate";
import { getNextPath } from "./domain/navigation";
import { PRODUCT_NAME } from "./domain/brand";

const Dashboard = lazy(() =>
  import("./pages/marketing/Dashboard").then((module) => ({
    default: module.Dashboard,
  })),
);
const ContractBuilder = lazy(() =>
  import("./pages/marketing/ContractBuilder").then((module) => ({
    default: module.ContractBuilder,
  })),
);
const ContractAdminViewer = lazy(() =>
  import("./pages/marketing/ContractAdminViewer").then((module) => ({
    default: module.ContractAdminViewer,
  })),
);
const ContractViewer = lazy(() =>
  import("./pages/influencer/ContractViewer").then((module) => ({
    default: module.ContractViewer,
  })),
);
const LoginLanding = lazy(() =>
  import("./pages/auth/LoginLanding").then((module) => ({
    default: module.LoginLanding,
  })),
);
const SignupPage = lazy(() =>
  import("./pages/auth/SignupPage").then((module) => ({
    default: module.SignupPage,
  })),
);
const AdvertiserVerification = lazy(() =>
  import("./pages/marketing/AdvertiserVerification").then((module) => ({
    default: module.AdvertiserVerification,
  })),
);
const InfluencerVerification = lazy(() =>
  import("./pages/influencer/InfluencerVerification").then((module) => ({
    default: module.InfluencerVerification,
  })),
);
const InfluencerDashboard = lazy(() =>
  import("./pages/influencer/InfluencerDashboard").then((module) => ({
    default: module.InfluencerDashboard,
  })),
);
const InfluencerLoginPage = lazy(() =>
  import("./pages/influencer/InfluencerLoginPage").then((module) => ({
    default: module.InfluencerLoginPage,
  })),
);
const SystemAdminDashboard = lazy(() =>
  import("./pages/admin/SystemAdminDashboard").then((module) => ({
    default: module.SystemAdminDashboard,
  })),
);
const LegalDocumentPage = lazy(() =>
  import("./pages/legal/LegalDocumentPage").then((module) => ({
    default: module.LegalDocumentPage,
  })),
);

function AppLoading({ label = "계약 데이터를 불러오는 중입니다" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] font-sans text-neutral-500">
      <div className="border border-neutral-200 bg-white px-6 py-5 text-center shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
          {PRODUCT_NAME}
        </p>
        <p className="mt-2 text-sm font-medium text-neutral-900">{label}</p>
      </div>
    </div>
  );
}

type RouteErrorBoundaryProps = {
  children: ReactNode;
  key?: string;
};

class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  { hasError: boolean }
> {
  declare props: RouteErrorBoundaryProps;
  state = { hasError: false };

  constructor(props: RouteErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[${PRODUCT_NAME}] route render failed`, error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-5 py-10 font-sans text-neutral-950">
        <section className="w-full max-w-[440px] rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold text-neutral-500">{PRODUCT_NAME}</p>
          <h1 className="mt-3 text-[24px] font-semibold tracking-normal">
            화면을 다시 불러와야 합니다
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            일시적인 화면 오류가 발생했습니다. 새로고침하거나 로그인 화면으로 이동해 다시 시도해 주세요.
          </p>
          <div className="mt-6 grid gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex h-11 items-center justify-center rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              새로고침
            </button>
            <Link
              to="/login"
              className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
            >
              로그인으로 이동
            </Link>
          </div>
        </section>
      </main>
    );
  }
}

const privateRoutePrefixes = [
  "/admin",
  "/advertiser",
  "/contract",
  "/influencer",
  "/marketing",
];

function RouteRobotsMeta() {
  const location = useLocation();

  useEffect(() => {
    let robotsTag = window.document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );

    if (!robotsTag) {
      robotsTag = window.document.createElement("meta");
      robotsTag.name = "robots";
      window.document.head.appendChild(robotsTag);
    }

    const isPrivateRoute = privateRoutePrefixes.some(
      (prefix) =>
        location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
    );
    robotsTag.content = isPrivateRoute ? "noindex,nofollow" : "index,follow";
  }, [location.pathname]);

  return null;
}

function AdvertiserLoginRoute() {
  const location = useLocation();
  const nextPath = getNextPath(location.search, "/advertiser/dashboard", ["/advertiser"]);

  return (
    <AdvertiserAuthGate>
      <Navigate to={nextPath} replace />
    </AdvertiserAuthGate>
  );
}

function LegacyMarketingRedirect() {
  const location = useLocation();
  const params = useParams();
  const legacyPath = params["*"] ?? "";
  const advertiserPath = legacyPath
    ? `/advertiser/${legacyPath}`
    : "/advertiser/dashboard";

  return <Navigate to={`${advertiserPath}${location.search}`} replace />;
}

function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-5 py-10 font-sans text-neutral-950">
      <section className="w-full max-w-[420px] rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-semibold text-neutral-500">{PRODUCT_NAME}</p>
        <h1 className="mt-3 text-[24px] font-semibold tracking-normal">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          링크가 만료되었거나 접근 경로가 변경되었을 수 있습니다.
        </p>
        <div className="mt-6 grid gap-2">
          <Link
            to="/login"
            className="flex h-11 items-center justify-center rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            로그인으로 이동
          </Link>
          <Link
            to="/influencer/dashboard"
            className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
          >
            인플루언서 대시보드
          </Link>
          <Link
            to="/advertiser/dashboard"
            className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
          >
            광고주 대시보드
          </Link>
        </div>
      </section>
    </main>
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <>
      <RouteRobotsMeta />
      <RouteErrorBoundary key={location.key}>
      <Suspense fallback={<AppLoading label="화면을 불러오는 중입니다" />}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/login" replace />}
          />
          <Route path="/login" element={<LoginLanding />} />
          <Route path="/login/advertiser" element={<AdvertiserLoginRoute />} />
          <Route path="/login/influencer" element={<InfluencerLoginPage />} />
          <Route path="/signup/advertiser" element={<SignupPage role="advertiser" />} />
          <Route path="/signup/influencer" element={<SignupPage role="influencer" />} />
          <Route path="/privacy" element={<LegalDocumentPage documentType="privacy" />} />
          <Route path="/terms" element={<LegalDocumentPage documentType="terms" />} />
          <Route
            path="/legal/e-sign-consent"
            element={<LegalDocumentPage documentType="eSignConsent" />}
          />
          <Route path="/admin/login" element={<SystemAdminDashboard loginOnly />} />
          <Route path="/admin" element={<SystemAdminDashboard />} />
          <Route path="/marketing/*" element={<LegacyMarketingRedirect />} />
          <Route
            path="/advertiser/dashboard"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <Dashboard />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/builder"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <ContractBuilder />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/verification"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <AdvertiserVerification />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/contract/:id"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <ContractAdminViewer />
              </AdvertiserAuthGate>
            }
          />
          <Route path="/contract/:id" element={<ContractViewer />} />
          <Route
            path="/influencer/verification"
            element={<InfluencerVerification />}
          />
          <Route
            path="/influencer/dashboard"
            element={<InfluencerDashboard />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
