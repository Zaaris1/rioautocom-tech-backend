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
  group: string;
  badge?: string;
  adminOnly?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  {
    to: "/dashboard",
    title: "Painel",
    description: "Prioridades, pendências e resumo operacional.",
    icon: "🏠",
    group: "Operação",
    badge: "Painel",
  },
  {
    to: "/alerts",
    title: "Alertas",
    description: "Eventos críticos, avisos e recuperações.",
    icon: "🚨",
    group: "Operação",
    badge: "Tempo real",
  },
  {
    to: "/tickets",
    title: "Chamados",
    description: "Atendimento, backlog e histórico.",
    icon: "🎫",
    group: "Operação",
    badge: "Atendimento",
  },
  {
    to: "/monitoring",
    title: "Monitoramento",
    description: "Conectividade, backup e certificados.",
    icon: "📡",
    group: "Operação",
    badge: "Lojas",
  },
  {
    to: "/reports",
    title: "Relatórios",
    description: "Indicadores e dados gerenciais.",
    icon: "📊",
    group: "Gestão",
    badge: "Dados",
  },
  {
    to: "/accesses",
    title: "Acessos",
    description: "AnyDesk e vínculos por loja.",
    icon: "🔐",
    group: "Administração",
    badge: "Admin",
    adminOnly: true,
  },
  {
    to: "/billing",
    title: "Planos",
    description: "Mensalidades, limites e bloqueios.",
    icon: "💳",
    group: "Administração",
    badge: "Admin",
    adminOnly: true,
  },
  {
    to: "/admin",
    title: "Administração",
    description: "Usuários, lojas, redes e permissões.",
    icon: "⚙️",
    group: "Administração",
    badge: "Admin",
    adminOnly: true,
  },
  {
    to: "/me",
    title: "Minha conta",
    description: "Senha, perfil e segurança.",
    icon: "👤",
    group: "Conta",
    badge: "Perfil",
  },
];

const CLIENT_MENU_ITEMS: MenuItem[] = [
  {
    to: "/cliente",
    title: "Portal do Cliente",
    description: "Resumo dos atendimentos e lojas liberadas.",
    icon: "🏢",
    group: "Portal",
    badge: "Resumo",
  },
  {
    to: "/tickets",
    title: "Meus chamados",
    description: "Andamento, histórico, pareceres e anexos.",
    icon: "🎫",
    group: "Portal",
    badge: "Atendimento",
  },
  {
    to: "/monitoring",
    title: "Minhas lojas",
    description: "Conectividade, backup e certificados.",
    icon: "📡",
    group: "Portal",
    badge: "Lojas",
  },
  {
    to: "/reports",
    title: "Relatórios",
    description: "Indicadores e informações do período.",
    icon: "📊",
    group: "Gestão",
    badge: "Consulta",
  },
  {
    to: "/me",
    title: "Minha conta",
    description: "Senha e dados de acesso.",
    icon: "👤",
    group: "Conta",
    badge: "Perfil",
  },
];

export default function HomePage() {
  const { auth, logout, role, hasRole } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(true);
  const username = auth?.username || "usuário";

  const allowedItems = React.useMemo(
    () => (role === "CLIENT" ? CLIENT_MENU_ITEMS : MENU_ITEMS.filter((item) => !item.adminOnly || hasRole("ADMIN"))),
    [hasRole, role]
  );

  const groupedItems = React.useMemo(() => {
    const order = role === "CLIENT" ? ["Portal", "Gestão", "Conta"] : ["Operação", "Gestão", "Administração", "Conta"];
    return order
      .map((group) => ({
        group,
        items: allowedItems.filter((item) => item.group === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [allowedItems, role]);

  return (
    <div className="home-shell">
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
            <div className="home-kicker">Central operacional</div>
            <h1>{role === "CLIENT" ? "Seu portal RioAutocom" : "Operação RioAutocom"}</h1>
            <p>
              {role === "CLIENT"
                ? "Acompanhe chamados, lojas e relatórios em uma área simples e organizada."
                : "Acesse as áreas críticas da operação com menos cliques e uma leitura mais clara do trabalho do dia."}
            </p>

            <div className="home-actions">
              <button
                className="btn primary home-main-button"
                onClick={() => setMenuOpen((v) => !v)}
                type="button"
                aria-controls="home-menu-panel"
                aria-expanded={menuOpen}
              >
                {menuOpen ? "Ocultar menu" : "Mostrar menu"}
              </button>
              <Link className="btn home-secondary-button" to={role === "CLIENT" ? "/cliente" : "/dashboard"}>
                {role === "CLIENT" ? "Abrir portal" : "Abrir painel"}
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
              {role === "CLIENT"
                ? "Recursos liberados conforme o contrato e as lojas autorizadas."
                : "Perfil com acesso às áreas de suporte, monitoramento e gestão."}
            </div>
          </div>
        </section>

        <section id="home-menu-panel" className={`home-menu-panel ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
          <div className="home-menu-panel__head">
            <div>
              <h2>Menu principal</h2>
              <p>Áreas agrupadas por rotina.</p>
            </div>
            <button className="btn home-menu-close" type="button" onClick={() => setMenuOpen(false)}>
              Fechar
            </button>
          </div>

          <div className="home-menu-sections">
            {groupedItems.map((section) => (
              <section className="home-menu-section" key={section.group}>
                <div className="home-menu-section__title">{section.group}</div>
                <div className="home-menu-grid">
                  {section.items.map((item) => (
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
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
