import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from '@reporter/ui';
import { useAuth } from './auth.js';
import { LoginPage } from './pages/LoginPage.js';
import { RecoveryLoginPage } from './pages/RecoveryLoginPage.js';
import { SetupPage } from './pages/SetupPage.js';
import { AppLayout } from './components/AppLayout.js';
import { EngagementLayout } from './components/EngagementLayout.js';
import { EngagementsPage } from './pages/EngagementsPage.js';
import { TimelinePage } from './pages/TimelinePage.js';
import { EvidenceDetailPage } from './pages/EvidenceDetailPage.js';
import { FindingsPage } from './pages/FindingsPage.js';
import { FindingDetailPage } from './pages/FindingDetailPage.js';
import { QueriesPage } from './pages/QueriesPage.js';
import { EngagementSettingsPage } from './pages/EngagementSettingsPage.js';
import { AccountPage } from './pages/AccountPage.js';
import { AdminPage } from './pages/AdminPage.js';

function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size={28} />
    </div>
  );
}

export function App() {
  const { user, flags, loading } = useAuth();

  if (loading) return <FullPageSpinner />;

  // Unauthenticated: only login/setup are reachable.
  if (!user) {
    return (
      <Routes>
        {flags?.needsSetup && <Route path="/setup" element={<SetupPage />} />}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/recovery/:code" element={<RecoveryLoginPage />} />
        <Route
          path="*"
          element={<Navigate to={flags?.needsSetup ? '/setup' : '/login'} replace />}
        />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/engagements" replace />} />
        <Route path="/engagements" element={<EngagementsPage />} />
        <Route path="/engagements/:slug" element={<EngagementLayout />}>
          <Route index element={<Navigate to="evidence" replace />} />
          <Route path="evidence" element={<TimelinePage />} />
          <Route path="evidence/:uuid" element={<EvidenceDetailPage />} />
          <Route path="findings" element={<FindingsPage />} />
          <Route path="findings/:uuid" element={<FindingDetailPage />} />
          <Route path="tags" element={<Navigate to="../settings" replace />} />
          <Route path="queries" element={<QueriesPage />} />
          <Route path="settings" element={<EngagementSettingsPage />} />
        </Route>
        <Route path="/account" element={<AccountPage />} />
        {user.admin && <Route path="/admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/engagements" replace />} />
      </Route>
    </Routes>
  );
}
