import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/marketing/Dashboard";
import { ContractBuilder } from "./pages/marketing/ContractBuilder";
import { ContractAdminViewer } from "./pages/marketing/ContractAdminViewer";
import { ContractViewer } from "./pages/influencer/ContractViewer";
import { SystemAdminDashboard } from "./pages/admin/SystemAdminDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/marketing/dashboard" replace />}
        />
        <Route path="/admin" element={<SystemAdminDashboard />} />
        <Route path="/marketing/dashboard" element={<Dashboard />} />
        <Route path="/marketing/builder" element={<ContractBuilder />} />
        <Route
          path="/marketing/contract/:id"
          element={<ContractAdminViewer />}
        />
        <Route path="/contract/:id" element={<ContractViewer />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
