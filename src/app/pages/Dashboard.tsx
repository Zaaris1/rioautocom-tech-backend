import React from "react";
import { Link } from "react-router-dom";
import { listMonitoringOverview, listTickets, MonitoringStatus, MonitoringStore, Ticket } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";

type ExtendedMonitoringStore = MonitoringStore & {
  backup_status?: string | null;
  backup_last_event_at?: string | null;
  backup_last_seen_at?: string | null;
  certificate_status?: string | null;
  certificate_expires_at?: string | null;
  certificate_days_left?: number | null;
};

const OPEN_FAMILY = new Set(["ABERTO", "ATRIBUIDO", "EM_ATENDIMENTO", "PENDENTE"]);

function safeStatus(v: any) {
  return String(v || "").trim().toUpperCase() || "ABERTO";
}

function safePriority(v: any) {
  return String(v || "").trim().toUpperCase() || "NORMAL";
}

function isBackupAlert(status?: string | null) {
  const raw = String(status || "").toUpperCase();
  return ["ERRO", "SEM_BACKUP_ONTEM", "SEM_LOGS", "NAO_CONFIRMADO", "PENDENTE_HOJE"].includes(raw);
}

function isCertificateAlert(status?: string | null) {
  const raw = String(status || "").toUpperCase();
  return raw === "VENCIDO" || raw === "NAO_ENCONTRADO" || raw.startsWith("ALERTA_");
}

function formatDateTimeShort(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseDateMs(v?: string | null) {
  if (!v) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

function isClosedTicketStatus(status: any) {
  const st = safeStatus(status);
  return st === "CONCLUIDO" || st === "CANCELADO";
}

function ticketOpenedMs(t: any) {
  return parseDateMs(t?.opened_at) ?? parseDateMs(t?.created_at) ?? parseDateMs(t?.updated_at);
}

function formatDurationMs(ms: number) {
  const a = Math.abs(ms);
  const totalMin = Math.floor(a / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function getTicketSlaInfo(t: any, nowMs: number) {
  const status = safeStatus(t?.status);
  if (isClosedTicketStatus(status)) return null;

  const opened = ticketOpenedMs(t);
  if (opened == null) return null;

  const urgent = safePriority(t?.priority) === "URGENTE";
  const maxHours = urgent ? 8 : 24;
  const totalMs = maxHours * 60 * 60 * 1000;
  const dueMs = opened + totalMs;
  const remainingMs = dueMs - nowMs;
  const overdue = remainingMs <= 0;
  const dueSoon = !overdue && remainingMs / totalMs <= 0.2;

  return {
    urgent,
    maxHours,
    openedMs: opened,
    dueMs,
    remainingMs,
    overdue,
    dueSoon,
  };
}

function getStoreLabel(store: Pick<ExtendedMonitoringStore, "network_name" | "store_name">) {
  const network = String(store.network_name || "").trim();
  const name = String(store.store_name || "").trim();
  if (network && name) return `${network} - ${name}`;
  return name || network || "Loja";
}

function getTicketStoreLabel(t: any) {
  const network = String(t?.store_network_name || t?.network_name || t?.rede_name || "").trim();
  const name = String(t?.store_name || t?.store?.name || t?.storeName || "").trim();
  if (network && name) return `${network} - ${name}`;
  return name || network || "Loja";
}

function monitoringStatusLabel(status: any) {
  const st = String(status || "").trim().toUpperCase();

  if (st === "ONLINE") return "Online";
  if (st === "PARCIAL") return "Parcial";
  if (st === "OFFLINE") return "Offline";
  if (st === "STALE") return "Sem atualização";

  return st || "Status";
}

function ticketStatusLabel(status: any) {
  const st = safeStatus(status);

  if (st === "ABERTO") return "Aberto";
  if (st === "ATRIBUIDO") return "Atribuído";
  if (st === "EM_ATENDIMENTO") return "Em atendimento";
  if (st === "PENDENTE") return "Pendente";
  if (st === "CONCLUIDO") return "Concluído";
  if (st === "CANCELADO") return "Cancelado";

  return st;
}

function monitorTone(status: MonitoringStatus) {
  if (status === "ONLINE") return "ok";
  if (status === "PARCIAL") return "warn";
  if (status === "OFFLINE") return "danger";
  return "accentB";
}

function ticketTone(t: Ticket, nowMs: number) {
  const status = safeStatus((t as any).status);
  const sla = getTicketSlaInfo(t as any, nowMs);

  if (sla?.overdue) return "danger";
  if (safePriority((t as any).priority) === "URGENTE") return "danger";
  if (status === "PENDENTE") return "warn";
  if (sla?.dueSoon) return "warn";
  if (status === "EM_ATENDIMENTO") return "accentB";
  return "accent";
}

export default function DashboardPage() {
  const { auth, role } = useAuth();
  const { show, Toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [monitoring, setMonitoring] = React.useState<ExtendedMonitoringStore[]>([]);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [monitoringResp, ticketsResp] = await Promise.all([
        listMonitoringOverview().catch(() => ({ items: [] as ExtendedMonitoringStore[] })),
        listTickets().catch(() => [] as Ticket[]),
      ]);

      setMonitoring((monitoringResp?.items || []) as ExtendedMonitoringStore[]);
      setTickets((ticketsResp || []) as Ticket[]);
      setNowMs(Date.now());
      setLastRefresh(new Date());
    } catch (err: any) {
      show(err?.message || "Não foi possível carregar o dashboard.", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  React.useEffect(() => {
    load();
  }, [load]);

  const monitorSummary = React.useMemo(() => {
    const online = monitoring.filter((item) => item.status === "ONLINE").length;
    const partial = monitoring.filter((item) => item.status === "PARCIAL").length;
    const offline = monitoring.filter((item) => item.status === "OFFLINE").length;
    const stale = monitoring.filter((item) => item.status === "STALE").length;
    const backupAlert = monitoring.filter((item) => isBackupAlert(item.backup_status)).length;
    const certificateAlert = monitoring.filter((item) => isCertificateAlert(item.certificate_status)).length;
    const attention = monitoring.filter(
      (item) => item.status !== "ONLINE" || isBackupAlert(item.backup_status) || isCertificateAlert(item.certificate_status)
    ).length;
    return { online, partial, offline, stale, backupAlert, certificateAlert, attention };
  }, [monitoring]);

  const ticketSummary = React.useMemo(() => {
    const openTickets = tickets.filter((t) => OPEN_FAMILY.has(safeStatus((t as any).status)) && !isClosedTicketStatus((t as any).status));
    const open = openTickets.length;
    const pending = openTickets.filter((t) => safeStatus((t as any).status) === "PENDENTE").length;
    const urgent = openTickets.filter((t) => safePriority((t as any).priority) === "URGENTE").length;
    const inProgress = openTickets.filter((t) => safeStatus((t as any).status) === "EM_ATENDIMENTO").length;
    const overdue = openTickets.filter((t) => getTicketSlaInfo(t as any, nowMs)?.overdue).length;
    const dueSoon = openTickets.filter((t) => {
      const sla = getTicketSlaInfo(t as any, nowMs);
      return !!sla?.dueSoon && !sla.overdue;
    }).length;
    const concluded = tickets.filter((t) => safeStatus((t as any).status) === "CONCLUIDO").length;

    return { open, pending, urgent, inProgress, overdue, dueSoon, concluded, total: tickets.length };
  }, [tickets, nowMs]);

  const storeAttentionList = React.useMemo(() => {
    const ordered = [...monitoring].sort((a, b) => {
      const score = (item: ExtendedMonitoringStore) => {
        let s = 0;
        if (item.status === "OFFLINE") s += 5;
        else if (item.status === "PARCIAL") s += 4;
        else if (item.status === "STALE") s += 3;
        if (isBackupAlert(item.backup_status)) s += 2;
        if (isCertificateAlert(item.certificate_status)) s += 2;
        return s;
      };
      return score(b) - score(a);
    });
    return ordered.filter((item) => item.status !== "ONLINE" || isBackupAlert(item.backup_status) || isCertificateAlert(item.certificate_status)).slice(0, 6);
  }, [monitoring]);

  const ticketAttentionList = React.useMemo(() => {
    const list = [...tickets].filter((t) => {
      const status = safeStatus((t as any).status);
      if (!OPEN_FAMILY.has(status) || isClosedTicketStatus(status)) return false;

      const sla = getTicketSlaInfo(t as any, nowMs);
      return (
        status === "PENDENTE" ||
        safePriority((t as any).priority) === "URGENTE" ||
        !!sla?.overdue ||
        !!sla?.dueSoon
      );
    });

    list.sort((a, b) => {
      const score = (t: Ticket) => {
        const status = safeStatus((t as any).status);
        const sla = getTicketSlaInfo(t as any, nowMs);
        let s = 0;

        if (sla?.overdue) s += 100;
        if (safePriority((t as any).priority) === "URGENTE") s += 30;
        if (status === "PENDENTE") s += 20;
        if (sla?.dueSoon) s += 10;

        return s;
      };

      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sb - sa;

      const slaA = getTicketSlaInfo(a as any, nowMs);
      const slaB = getTicketSlaInfo(b as any, nowMs);

      if (slaA?.overdue && slaB?.overdue) {
        return slaA.remainingMs - slaB.remainingMs;
      }

      const da = slaA?.dueMs || parseDateMs((a as any).updated_at) || parseDateMs((a as any).opened_at) || 0;
      const db = slaB?.dueMs || parseDateMs((b as any).updated_at) || parseDateMs((b as any).opened_at) || 0;
      return da - db;
    });

    return list.slice(0, 8);
  }, [tickets, nowMs]);

  const quickActions = React.useMemo(() => {
    const base = [
      { to: "/tickets", label: "Tickets", hint: "Abrir backlog e chamados em andamento.", icon: "🎫" },
      { to: "/monitoring", label: "Monitoramento", hint: "Ver lojas, backup e certificados.", icon: "📡" },
      { to: "/reports", label: "Relatórios", hint: "Consultar indicadores e tempos médios.", icon: "📊" },
      { to: "/me", label: "Minha conta", hint: "Ajustar senha e preferências de acesso.", icon: "👤" },
    ];

    if (role === "ADMIN") {
      base.splice(3, 0,
        { to: "/accesses", label: "Acessos", hint: "Gerenciar AnyDesk e acessos por loja.", icon: "🔐" },
        { to: "/admin", label: "Admin", hint: "Gerenciar usuários, lojas, redes e permissões.", icon: "⚙️" },
      );
    }

    return base;
  }, [role]);

  const roleLabel = role === "ADMIN" ? "Admin" : role === "TECH" ? "Técnico" : role === "CLIENT" ? "Cliente" : "Usuário";

  return (
    <div className="page-shell dashboard-shell">
      <div className="card page-hero dashboard-hero">
        <div className="page-hero__head">
          <div>
            <h1 className="page-hero__title">Painel operacional</h1>
            <div className="page-hero__sub">
              Visão consolidada de lojas, chamados e alertas operacionais.
            </div>
          </div>

          <div className="page-hero__actions">
            <span className="badge accent">{roleLabel}</span>
            <span className="badge accentB">{auth?.username || "—"}</span>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        <div className="page-kpis dashboard-kpis">
          <div className="page-kpi dashboard-kpi-card">
            <div className="page-kpi__label">Lojas online</div>
            <div className="page-kpi__value">{monitorSummary.online}</div>
            <div className="page-kpi__hint">Operação normal.</div>
          </div>
          <div className="page-kpi dashboard-kpi-card">
            <div className="page-kpi__label">Lojas em alerta</div>
            <div className="page-kpi__value">{monitorSummary.attention}</div>
            <div className="page-kpi__hint">Conectividade, backup ou certificado.</div>
          </div>
          <div className="page-kpi dashboard-kpi-card">
            <div className="page-kpi__label">Chamados abertos</div>
            <div className="page-kpi__value">{ticketSummary.open}</div>
            <div className="page-kpi__hint">Backlog operacional.</div>
          </div>
          <div className="page-kpi dashboard-kpi-card">
            <div className="page-kpi__label">Prazos vencidos</div>
            <div className="page-kpi__value">{ticketSummary.overdue}</div>
            <div className="page-kpi__hint">Atendimentos fora do prazo.</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <div className="card page-section-card">
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Resumo executivo</h2>
                <div className="page-section-sub">Indicadores principais da operação.</div>
              </div>
              <span className="badge">Atualizado {lastRefresh ? lastRefresh.toLocaleTimeString("pt-BR") : "—"}</span>
            </div>

            <div className="dashboard-summary-grid">
              <div className="page-soft-card dashboard-summary-card">
                <div className="page-label">Monitoramento</div>
                <div className="dashboard-mini-stats">
                  <span className="badge ok">Online {monitorSummary.online}</span>
                  <span className="badge warn">Parcial {monitorSummary.partial}</span>
                  <span className="badge danger">Offline {monitorSummary.offline}</span>
                  <span className="badge accentB">Sem atualização {monitorSummary.stale}</span>
                </div>
                <div className="small dashboard-summary-copy">Status atual das lojas visíveis para seu perfil.</div>
              </div>

              <div className="page-soft-card dashboard-summary-card">
                <div className="page-label">Chamados</div>
                <div className="dashboard-mini-stats">
                  <span className="badge">Abertos {ticketSummary.open}</span>
                  <span className="badge danger">Vencidos {ticketSummary.overdue}</span>
                  <span className="badge warn">Vencendo {ticketSummary.dueSoon}</span>
                  <span className="badge danger">Urgentes {ticketSummary.urgent}</span>
                  <span className="badge accentB">Em atendimento {ticketSummary.inProgress}</span>
                </div>
                <div className="small dashboard-summary-copy">Chamados atuais por prioridade e andamento.</div>
              </div>

              <div className="page-soft-card dashboard-summary-card">
                <div className="page-label">Alertas automáticos</div>
                <div className="dashboard-mini-stats">
                  <span className="badge warn">Backup {monitorSummary.backupAlert}</span>
                  <span className="badge danger">Certificado {monitorSummary.certificateAlert}</span>
                </div>
                <div className="small dashboard-summary-copy">Alertas que exigem validação no monitoramento.</div>
              </div>
            </div>
          </div>

          <div className="card page-section-card">
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Lojas que precisam de atenção</h2>
                <div className="page-section-sub">Lojas com impacto operacional no momento.</div>
              </div>
              <Link className="btn" to="/monitoring">Abrir monitoramento</Link>
            </div>

            <div className="dashboard-alert-list">
              {storeAttentionList.length ? (
                storeAttentionList.map((store) => (
                  <div className="dashboard-alert-row" key={store.store_id}>
                    <div>
                      <div className="dashboard-alert-row__title">{getStoreLabel(store)}</div>
                      <div className="small dashboard-alert-row__sub">CNPJ {store.cnpj || "—"}</div>
                    </div>
                    <div className="dashboard-alert-row__chips">
                      <span className={`badge ${monitorTone(store.status as MonitoringStatus)}`}>{monitoringStatusLabel(store.status)}</span>
                      {isBackupAlert(store.backup_status) ? <span className="badge warn">Backup</span> : null}
                      {isCertificateAlert(store.certificate_status) ? <span className="badge danger">Certificado</span> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="page-inline-note">Nenhuma loja em alerta no momento.</div>
              )}
            </div>
          </div>

          <div className="card page-section-card">
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Tickets que pedem ação</h2>
                <div className="page-section-sub">Chamados com prazo vencido, próximos do vencimento ou marcados como urgentes.</div>
              </div>
              <Link className="btn" to="/tickets">Abrir tickets</Link>
            </div>

            <div className="dashboard-alert-list">
              {ticketAttentionList.length ? (
                ticketAttentionList.map((ticket) => {
                  const sla = getTicketSlaInfo(ticket as any, nowMs);

                  return (
                    <div className="dashboard-alert-row" key={ticket.id}>
                      <div>
                        <div className="dashboard-alert-row__title">{getTicketStoreLabel(ticket)}</div>
                        <div className="small dashboard-alert-row__sub">
                          {ticket.local || "Sem local informado"}
                          {sla ? ` • aberto em ${formatDateTimeShort((ticket as any).opened_at || (ticket as any).created_at || (ticket as any).updated_at)}` : ""}
                        </div>
                        <div className="small dashboard-alert-row__problem">{ticket.problem || "—"}</div>
                      </div>
                      <div className="dashboard-alert-row__chips">
                        <span className={`badge ${ticketTone(ticket, nowMs)}`}>{ticketStatusLabel((ticket as any).status)}</span>
                        {sla?.overdue ? <span className="badge danger">Vencido há {formatDurationMs(sla.remainingMs)}</span> : null}
                        {!sla?.overdue && sla?.dueSoon ? <span className="badge warn">Vence em {formatDurationMs(sla.remainingMs)}</span> : null}
                        {safePriority((ticket as any).priority) === "URGENTE" ? <span className="badge danger">Urgente</span> : null}
                        <Link className="btn primary dashboard-inline-btn" to={`/tickets/${ticket.id}`}>Abrir</Link>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="page-inline-note">Nenhum chamado vencido, próximo do prazo, urgente ou pendente agora.</div>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-side">
          <div className="card page-section-card dashboard-quick-card">
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Atalhos rápidos</h2>
                <div className="page-section-sub">Acesse as principais áreas do sistema.</div>
              </div>
            </div>

            <div className="dashboard-quick-grid">
              {quickActions.map((action) => (
                <Link className="dashboard-quick-item" key={action.to} to={action.to}>
                  <div className="dashboard-quick-item__icon">{action.icon}</div>
                  <div>
                    <div className="dashboard-quick-item__title">{action.label}</div>
                    <div className="small dashboard-quick-item__hint">{action.hint}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card page-section-card dashboard-insight-card">
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Leitura rápida</h2>
                <div className="page-section-sub">Leitura executiva da operação.</div>
              </div>
            </div>

            <div className="dashboard-insight-stack">
              <div className="page-soft-card">
                <div className="page-label">Ambiente</div>
                <div className="page-value-strong">{monitorSummary.online} lojas online</div>
                <div className="small">{monitorSummary.attention} loja(s) precisam de atenção no monitoramento.</div>
              </div>
              <div className="page-soft-card">
                <div className="page-label">Chamados</div>
                <div className="page-value-strong">{ticketSummary.open} chamados em aberto</div>
                <div className="small">{ticketSummary.pending} pendente(s), {ticketSummary.urgent} urgente(s) e {ticketSummary.concluded} concluído(s).</div>
              </div>
              <div className="page-soft-card">
                <div className="page-label">Próximo passo sugerido</div>
                <div className="small">
                  {monitorSummary.attention > 0
                    ? "Priorize Monitoramento para tratar alertas de loja, backup ou certificado."
                    : ticketSummary.overdue > 0 || ticketSummary.dueSoon > 0 || ticketSummary.urgent > 0 || ticketSummary.pending > 0
                    ? "Priorize Chamados para tratar prazos vencidos, próximos do vencimento, urgentes ou pendentes."
                    : "Ambiente estável. Use os atalhos para seguir para a próxima rotina."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Toast />
    </div>
  );
}
