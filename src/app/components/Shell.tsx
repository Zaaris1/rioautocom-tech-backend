import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

function NavItem({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: string;
}) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
      <span className="nav-item__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-item__label">{label}</span>
      <span className="nav-item__arrow" aria-hidden="true">
        ›
      </span>
    </NavLink>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { auth, logout } = useAuth();
  const role = auth?.role;
  const location = useLocation();

  if (location.pathname === "/inicio") {
    return <>{children}</>;
  }

  return (
    <div className="container">
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="logo" aria-hidden="true">
              <img src="/logo.png" alt="" />
            </div>
            <div>
              <h1>RioAutocom Tech</h1>
              <p>{role ? `Perfil ${role}` : "Operação"}</p>
            </div>
          </div>

          <nav className="nav">
            <NavItem to="/inicio" label="Início" icon="✨" />
            <NavItem to="/dashboard" label="Dashboard" icon="🏠" />
            <NavItem to="/alerts" label="Alertas" icon="🚨" />
            <NavItem to="/tickets" label="Tickets" icon="🎫" />
            <NavItem to="/monitoring" label="Monitoramento" icon="📡" />
            <NavItem to="/reports" label="Relatórios" icon="📊" />
            {role === "ADMIN" && <NavItem to="/accesses" label="Acessos" icon="🔐" />}
            {role === "ADMIN" && <NavItem to="/admin" label="Admin" icon="⚙️" />}
            <NavItem to="/me" label="Minha conta" icon="👤" />
          </nav>

          <div className="sep" />

          <button className="btn danger sidebar-logout" onClick={logout}>
            Sair
          </button>

          <p className="small sidebar-tip" style={{ marginTop: 12 }}>
            Operação, suporte e monitoramento em tempo real.
          </p>
        </aside>

        <main className="content">
          <div className="topbar">
            <div>
              <div style={{ fontWeight: 800 }}>Olá, {auth?.username || "usuário"}</div>
              <div className="small">Painel operacional RioAutocom</div>
            </div>

            <div className="badge accentB">{new Date().toLocaleString("pt-BR")}</div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
