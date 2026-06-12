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
                  <Route path="/" element={<Navigate to="/tickets" replace />} />
                  <Route path="/tickets" element={<TicketsPage />} />
                  <Route path="/tickets/:id" element={<TicketDetailPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/me" element={<MePage />} />
                  <Route path="*" element={<div className="card">Página não encontrada.</div>} />
                </Routes>
              </Shell>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
