import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';

import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { LoginSimple } from './pages/LoginSimple';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { Patients } from './pages/Patients';
import { PatientDetails } from './pages/PatientDetails';
import { AddPatient } from './pages/AddPatient';
import { NewConsultation } from './pages/NewConsultation';
import { ConsultationHistory } from './pages/ConsultationHistory';
import { Subscription } from './pages/Subscription';
import { UserCheck } from './pages/UserCheck';
import { Medications } from './pages/Medications';
import { Orders } from './pages/Orders';
import { Privacy } from './pages/Privacy';
import { AdminTools } from './pages/AdminTools';
import { AuthProvider } from './contexts/AuthContext';
import { PrivacyBanner } from './components/PrivacyBanner';
import { SubscriptionDiagnostics } from './pages/SubscriptionDiagnostics';

function AppRoutes() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isRecovery = params.get('type') === 'recovery';

  // Controlla se esiste una sessione salvata in localStorage
  const token = localStorage.getItem('supabase.auth.token');
  const parsedToken = token ? JSON.parse(token) : null;
  const isLoggedIn = !!parsedToken?.currentSession;

  // Evita redirect se si sta reimpostando la password
  if (isLoggedIn && location.pathname === '/' && !isRecovery) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/login-diagnostico" element={<LoginSimple />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/check-users" element={<UserCheck />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetails />} />
        <Route path="new-patient" element={<AddPatient />} />
        <Route path="consultation/new" element={<Navigate to="/app/new-consultation" replace />} />
        <Route path="new-consultation" element={<NewConsultation />} />
        <Route path="history" element={<ConsultationHistory />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="medications" element={<Medications />} />
        <Route path="orders" element={<Orders />} />
        <Route path="admin" element={<AdminTools />} />
        <Route path="subscription-diagnostics" element={<SubscriptionDiagnostics />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
        <PrivacyBanner />
      </AuthProvider>
    </Router>
  );
}
