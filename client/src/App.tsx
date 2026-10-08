import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n';
import LandingPage from './pages/LandingPage';
import UploadPage from './pages/customer/UploadPage';
import StatusPage from './pages/customer/StatusPage';
import LoginPage from './pages/admin/LoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import RequestsPage from './pages/admin/RequestsPage';
import RequestDetailPage from './pages/admin/RequestDetailPage';
import QueuePage from './pages/admin/QueuePage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import PrintersPage from './pages/admin/PrintersPage';
import QrPage from './pages/admin/QrPage';
import SettingsPage from './pages/admin/SettingsPage';

export default function App() {
  return (
    <I18nProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/upload/:terminalCode" element={<UploadPage />} />
        <Route path="/status/:requestId" element={<StatusPage />} />

        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="requests/:id" element={<RequestDetailPage />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="printers" element={<PrintersPage />} />
          <Route path="qr" element={<QrPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<RedirectHome />} />
      </Routes>
    </I18nProvider>
  );
}

function RedirectHome() {
  const location = useLocation();
  if (location.pathname.startsWith('/admin')) return <Navigate to="/admin/login" replace />;
  return <Navigate to="/" replace />;
}
