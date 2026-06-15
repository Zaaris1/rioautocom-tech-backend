import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { Role } from "../api";
import { useAuth } from "../auth";

type ShellNavItem = {
  to: string;
  label: string;
  mobileLabel?: string;
  icon: string;
  hint?: string;
  adminOnly?: boolean;
};

type ShellNavSection = {
  title: string;
  items: ShellNavItem[];
};

const ADMIN_SECTIONS: ShellNavSection[] = [
  {
    title: "Operação",
    items: [
      { to: "/inicio", label: "Início", mobileLabel: "Início", icon: "✨", hint: "Central de atalhos" },
      { to: "/dashboard", label: "Painel", icon: "🏠", hint: "Resumo operacional" },
      { to: "/alerts", label: "Alertas", icon: "🚨", hint: "Eventos críticos" },
      { to: "/tickets", label: "Chamados", icon: "🎫", hint: "Atendimentos" },
      { to: "/monitoring", label: "Monitoramento", mobileLabel: "Monitor", icon: "📡", hint: "Lojas e agentes" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { to: "/reports", label: "Relatórios", mobileLabel: "Dados", icon: "📊", hint: "Indicadores" },
      { to: "/accesses", label: "Acessos", icon: "🔐", hint: "Cofre remoto", adminOnly: true },
      { to: "/billing", label: "Planos", icon: "💳", hint: "Mensalidades", adminOnly: true },
      { to: "/admin", label: "Administração", mobileLabel: "Admin", icon: "⚙️", hint: "Cadastros", adminOnly: true },
    ],
  },
  {
    title: "Conta",
    items: [{ to: "/me", label: "Minha conta", mobileLabel: "Conta", icon: "👤", hint: "Segurança" }],
  },
];

const CLIENT_SECTIONS: ShellNavSection[] = [
  {
    title: "Portal",
    items: [
      { to: "/inicio", label: "Início", mobileLabel: "Início", icon: "✨", hint: "Central de atalhos" },
      { to: "/cliente", label: "Portal do Cliente", mobileLabel: "Portal", icon: "🏢", hint: "Visão geral" },
      { to: "/tickets", label: "Meus chamados", mobileLabel: "Chamados", icon: "🎫", hint: "Atendimentos" },
      { to: "/monitoring", label: "Minhas lojas", mobileLabel: "Lojas", icon: "📡", hint: "Monitoramento" },
      { to: "/reports", label: "Relatórios", mobileLabel: "Dados", icon: "📊", hint: "Indicadores" },
    ],
  },
  {
    title: "Conta",
    items: [{ to: "/me", label: "Minha conta", mobileLabel: "Conta", icon: "👤", hint: "Senha e acesso" }],
  },
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Painel operacional", subtitle: "Prioridades, chamados e lojas em uma visão única." },
  "/cliente": { title: "Portal do Cliente", subtitle: "Acompanhamento simples dos atendimentos e lojas liberadas." },
  "/alerts": { title: "Central de alertas", subtitle: "Eventos relevantes para agir com rapidez." },
  "/tickets": { title: "Chamados", subtitle: "Backlog, atendimento e histórico operacional." },
  "/monitoring": { title: "Monitoramento", subtitle: "Conectividade, backup, certificados e agentes." },
  "/reports": { title: "Relatórios", subtitle: "Dados para leitura gerencial e operação diária." },
  "/accesses": { title: "Cofre de acessos", subtitle: "Acessos remotos organizados por loja e rede." },
  "/billing": { title: "Planos e mensalidades", subtitle: "Status comercial e bloqueios de cliente." },
  "/admin": { title: "Administração", subtitle: "Usuários, lojas, redes e permissões." },
  "/me": { title: "Minha conta", subtitle: "Segurança e preferências de acesso." },
};

function roleLabel(role?: Role | null) {
  if (role === "ADMIN") return "Administrador";
  if (role === "TECH") return "Técnico";
  if (role === "CLIENT") return "Cliente";
  return "Operação";
}

function getNavSections(role: Role | null, hasAdmin: boolean): ShellNavSection[] {
  const source = role === "CLIENT" ? CLIENT_SECTIONS : ADMIN_SECTIONS;
  return source
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.adminOnly || hasAdmin),
    }))
    .filter((section) => section.items.length > 0);
}

function flattenSections(sections: ShellNavSection[]) {
  return sections.flatMap((section) => section.items);
}

function currentMeta(pathname: string) {
  const basePath = `/${pathname.split("/").filter(Boolean)[0] || "inicio"}`;
  return PAGE_META[basePath] || { title: "RioAutocom Tech", subtitle: "Suporte, monitoramento e gestão operacional." };
}

function NavItem({ to, label, icon, hint }: ShellNavItem) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
      <span className="nav-item__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-item__body">
        <span className="nav-item__label">{label}</span>
        {hint && <span className="nav-item__hint">{hint}</span>}
      </span>
      <span className="nav-item__arrow" aria-hidden="true">
        ›
      </span>
    </NavLink>
  );
}

function MobileBottomNav({ items }: { items: ShellNavItem[] }) {
  const preferredOrder = ["/inicio", "/dashboard", "/cliente", "/tickets", "/monitoring", "/reports", "/me"];
  const mobileItems = preferredOrder
    .map((path) => items.find((item) => item.to === path))
    .filter(Boolean)
    .slice(0, 5) as ShellNavItem[];

  return (
    <nav className="mobile-bottom-nav" aria-label="Menu principal">
      {mobileItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? "active" : ""}`}
        >
          <span className="mobile-bottom-nav__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.mobileLabel || item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { auth, logout, role, hasRole } = useAuth();
  const location = useLocation();
  const navSections = React.useMemo(() => getNavSections(role, hasRole("ADMIN")), [hasRole, role]);
  const navItems = React.useMemo(() => flattenSections(navSections), [navSections]);
  const meta = currentMeta(location.pathname);

  if (location.pathname === "/inicio") {
    return <>{children}</>;
  }

  return (
    <div className="container">
      <div className="app-shell">
        <aside className="sidebar">
          <Link className="brand" to="/inicio" aria-label="Ir para o início">
            <div className="logo" aria-hidden="true">
              <img src="/logo.png" alt="" />
            </div>
            <div>
              <h1>RioAutocom Tech</h1>
              <p>{roleLabel(role)}</p>
            </div>
          </Link>

          <nav className="nav" aria-label="Menu lateral">
            {navSections.map((section) => (
              <div className="nav-section" key={section.title}>
                <div className="nav-section__title">{section.title}</div>
                <div className="nav-section__items">
                  {section.items.map((item) => (
                    <NavItem key={item.to} {...item} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="sidebar-account">
            <div>
              <span>{auth?.username || "usuário"}</span>
              <small>{roleLabel(role)}</small>
            </div>
            <button className="btn danger sidebar-logout" type="button" onClick={logout}>
              Sair
            </button>
          </div>
        </aside>

        <main className="content">
          <div className="topbar">
            <div className="topbar-copy">
              <div className="topbar-eyebrow">RioAutocom Tech</div>
              <div className="topbar-title">{meta.title}</div>
              <div className="small">{meta.subtitle}</div>
            </div>

            <div className="topbar-actions">
              <span className="badge accentB">{auth?.username || "usuário"}</span>
              <span className="badge">{new Date().toLocaleDateString("pt-BR")}</span>
            </div>
          </div>

          {children}
        </main>
      </div>

      <MobileBottomNav items={navItems} />
    </div>
  );
}
