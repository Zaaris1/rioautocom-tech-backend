import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth";
import RequireAuth from "./components/RequireAuth";
import Shell from "./components/Shell";
import LoginPage from "./pages/Login";
import TicketsPage from "./pages/Tickets";
import TicketDetailPage from "./pages/TicketDetail";
import AdminPage from "./pages/Admin";
import MePage from "./pages/Me";
import ReportsPage from "./pages/Reports";
import AccessesPage from "./pages/Accesses";
import MonitoringPage from "./pages/Monitoring";
import DashboardPage from "./pages/Dashboard";
import AlertsPage from "./pages/Alerts";
import HomePage from "./pages/Home";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/*"
          element={
            <RequireAuth>
              <Shell>
                <Routes>
                  <Route path="/" element={<Navigate to="/inicio" replace />} />
                  <Route path="/inicio" element={<HomePage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/alerts" element={<AlertsPage />} />
                  <Route path="/tickets" element={<TicketsPage />} />
                  <Route path="/tickets/:id" element={<TicketDetailPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/monitoring" element={<MonitoringPage />} />
                  <Route path="/accesses" element={<AccessesPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/me" element={<MePage />} />
                  <Route path="*" element={<div className="card">Página não encontrada.</div>} />
                </Routes>
              </Shell>
            </RequireAuth>
          }
        />
      </Routes>

      <div className="app-signature" aria-label="Desenvolvido por Juan Gabriel">
        <span className="app-signature__prefix">Desenvolvido por</span>
        <span className="app-signature__name">Juan Gabriel</span>
      </div>
    </AuthProvider>
  );
}
