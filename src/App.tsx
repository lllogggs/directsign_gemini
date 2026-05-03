import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import { AdvertiserAuthGate } from "./pages/marketing/AdvertiserAuthGate";
import { getNextPath } from "./domain/navigation";

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
  import("./pages/influencer/InfluencerDashboard").then((module) => ({
    default: module.InfluencerLoginPage,
  })),
);
const SystemAdminDashboard = lazy(() =>
  import("./pages/admin/SystemAdminDashboard").then((module) => ({
    default: module.SystemAdminDashboard,
  })),
);

function AppLoading({ label = "계약 데이터를 불러오는 중입니다" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] font-sans text-neutral-500">
      <div className="border border-neutral-200 bg-white px-6 py-5 text-center shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
          DirectSign
        </p>
        <p className="mt-2 text-sm font-medium text-neutral-900">{label}</p>
      </div>
    </div>
  );
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

function App() {
  return (
    <BrowserRouter>
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
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
