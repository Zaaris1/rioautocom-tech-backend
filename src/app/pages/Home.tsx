import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";

function roleLabel(role?: string | null) {
  if (role === "ADMIN") return "Administrador";
  if (role === "TECH") return "Técnico";
  if (role === "CLIENT") return "Cliente";
  return "Usuário";
}

type MenuItem = {
  to: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
  adminOnly?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  {
    to: "/tickets",
    title: "Chamados",
    description: "Abra, acompanhe e atualize solicitações de atendimento.",
    icon: "🎫",
    badge: "Atendimento",
  },
  {
    to: "/monitoring",
    title: "Monitoramento",
    description: "Acompanhe conectividade, certificados e backups das lojas.",
    icon: "📡",
    badge: "Operação",
  },
  {
    to: "/reports",
    title: "Relatórios",
    description: "Consulte indicadores, volumes e dados gerenciais.",
    icon: "📊",
    badge: "Gestão",
  },
  {
    to: "/dashboard",
    title: "Dashboard",
    description: "Veja alertas, prioridades e resumo operacional.",
    icon: "🏠",
    badge: "Painel",
  },
  {
    to: "/me",
    title: "Minha conta",
    description: "Gerencie dados de acesso, perfil e segurança.",
    icon: "👤",
    badge: "Perfil",
  },
  {
    to: "/accesses",
    title: "Acessos",
    description: "Vincule clientes às redes e lojas autorizadas.",
    icon: "🔐",
    badge: "Admin",
    adminOnly: true,
  },
  {
    to: "/admin",
    title: "Administração",
    description: "Acesse configurações e recursos administrativos.",
    icon: "⚙️",
    badge: "Admin",
    adminOnly: true,
  },
];

export default function HomePage() {
  const { auth, logout, role, hasRole } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const username = auth?.username || "usuário";

  const allowedItems = React.useMemo(
    () => MENU_ITEMS.filter((item) => !item.adminOnly || hasRole("ADMIN")),
    [hasRole]
  );

  return (
    <div className="home-shell">
      <div className="home-bg home-bg--one" />
      <div className="home-bg home-bg--two" />

      <header className="home-header">
        <div className="home-brand">
          <div className="home-logo" aria-hidden="true">
            <img src="/logo.png" alt="" />
          </div>
          <div>
            <div className="home-brand__title">RioAutocom Tech</div>
            <div className="home-brand__sub">Suporte, monitoramento e gestão operacional.</div>
          </div>
        </div>

        <div className="home-header__actions">
          <span className="home-profile-pill">
            <span>
              <b>{username}</b>
              <small>{roleLabel(role)}</small>
            </span>
          </span>
          <button className="btn home-logout" onClick={logout} type="button">
            Sair
          </button>
        </div>
      </header>

      <main className="home-main">
        <section className="home-hero-card">
          <div className="home-hero-card__content">
            <div className="home-kicker">Tela inicial</div>
            <h1>Bem-vindo ao App RioAutocom</h1>
            <p>
              Exclusivamente desenvolvido.
              Gerencie chamados, monitoramento e relatórios em uma plataforma integrada.
            </p>

            <div className="home-actions">
              <button className="btn primary home-main-button" onClick={() => setMenuOpen((v) => !v)} type="button">
                {menuOpen ? "Fechar menu" : "Abrir menu"}
              </button>
              <Link className="btn home-secondary-button" to="/tickets">
                Ir para chamados
              </Link>
            </div>
          </div>

          <div className="home-status-card" aria-label="Resumo do acesso">
            <div className="home-status-card__top">
              <span className="badge accent">Acesso ativo</span>
              <span className="home-status-dot" />
            </div>

            <div className="home-status-card__title">{roleLabel(role)}</div>
            <div className="home-status-card__text">
              Sessão ativa. Os recursos exibidos seguem o perfil de acesso autorizado.
            </div>
          </div>
        </section>

        <section className={`home-menu-panel ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
          <div className="home-menu-panel__head">
            <div>
              <h2>Menu principal</h2>
              <p>Selecione a área que deseja acessar.</p>
            </div>
            <button className="btn home-menu-close" type="button" onClick={() => setMenuOpen(false)}>
              Fechar
            </button>
          </div>

          <div className="home-menu-grid">
            {allowedItems.map((item) => (
              <Link className="home-menu-card" to={item.to} key={item.to}>
                <div className="home-menu-card__icon" aria-hidden="true">
                  {item.icon}
                </div>
                <div className="home-menu-card__body">
                  <div className="home-menu-card__top">
                    <h3>{item.title}</h3>
                    {item.badge && <span className="badge mini accent">{item.badge}</span>}
                  </div>
                  <p>{item.description}</p>
                </div>
                <span className="home-menu-card__arrow" aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
