import React from "react";
import { Link } from "react-router-dom";
import { listMonitoringOverview, listTickets, MonitoringStore, Ticket } from "../api";
import { useToast } from "../components/Toast";
import FancySelect from "../components/FancySelect";

type ExtendedMonitoringStore = MonitoringStore & {
  backup_status?: string | null;
  backup_summary?: string | null;
  backup_message?: string | null;
  backup_last_event_at?: string | null;
  backup_last_seen_at?: string | null;
  certificate_status?: string | null;
  certificate_summary?: string | null;
  certificate_message?: string | null;
  certificate_expires_at?: string | null;
  certificate_days_left?: number | null;
  certificate_last_seen_at?: string | null;
};

type AlertLevel = "critical" | "warn" | "info";
type AlertCategory = "ticket" | "monitoring" | "backup" | "certificate";

type OperationalAlert = {
  id: string;
  level: AlertLevel;
  category: AlertCategory;
  title: string;
  subtitle: string;
  detail: string;
  badge: string;
  href: string;
  actionLabel: string;
  sortScore: number;
  sortTimeMs: number;
};

const OPEN_STATUSES = new Set(["ABERTO", "ATRIBUIDO", "EM_ATENDIMENTO", "PENDENTE"]);

function safeStatus(v: any) {
  return String(v || "").trim().toUpperCase() || "ABERTO";
}

function safePriority(v: any) {
  return String(v || "").trim().toUpperCase() || "NORMAL";
}

function parseDateMs(v?: string | null) {
  if (!v) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
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

function formatDurationMs(ms: number) {
  const a = Math.abs(ms);
  const totalMin = Math.floor(a / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  if (d > 0) return `${d}d ${hh}h`;
  if (h <= 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function ticketOpenedMs(t: any) {
  return parseDateMs(t?.opened_at) ?? parseDateMs(t?.created_at) ?? parseDateMs(t?.updated_at);
}

function isTicketClosed(t: any) {
  const status = safeStatus(t?.status);
  return status === "CONCLUIDO" || status === "CANCELADO";
}

function ticketSla(t: any, nowMs: number) {
  if (isTicketClosed(t)) return null;
  const opened = ticketOpenedMs(t);
  if (opened == null) return null;

  const urgent = safePriority(t?.priority) === "URGENTE";
  const hours = urgent ? 8 : 24;
  const totalMs = hours * 60 * 60 * 1000;
  const dueMs = opened + totalMs;
  const remainingMs = dueMs - nowMs;
  const overdue = remainingMs <= 0;
  const dueSoon = !overdue && remainingMs / totalMs <= 0.2;

  return { hours, dueMs, remainingMs, overdue, dueSoon };
}

function ticketStoreLabel(t: any) {
  const network = String(t?.network_name || t?.store_network_name || t?.rede_name || "").trim();
  const store = String(t?.store_name || t?.store?.name || t?.storeName || "").trim();
  if (network && store) return `${network} - ${store}`;
  return store || network || "Loja";
}

function storeLabel(store: Pick<ExtendedMonitoringStore, "network_name" | "store_name">) {
  const network = String(store.network_name || "").trim();
  const name = String(store.store_name || "").trim();
  if (network && name) return `${network} - ${name}`;
  return name || network || "Loja";
}

function monitoringHref(store: Pick<ExtendedMonitoringStore, "store_id" | "store_name" | "cnpj" | "network_name">) {
  const params = new URLSearchParams();
  if (store.store_id) params.set("store", String(store.store_id));

  const searchTerm = String(store.cnpj || store.store_name || store.network_name || "").trim();
  if (searchTerm) params.set("q", searchTerm);

  const qs = params.toString();
  return qs ? `/monitoring?${qs}` : "/monitoring";
}

function statusLabel(status: any) {
  const s = safeStatus(status);
  if (s === "ABERTO") return "Aberto";
  if (s === "ATRIBUIDO") return "Atribuído";
  if (s === "EM_ATENDIMENTO") return "Em atendimento";
  if (s === "PENDENTE") return "Pendente";
  if (s === "CONCLUIDO") return "Concluído";
  if (s === "CANCELADO") return "Cancelado";
  return s;
}

function monitoringStatusLabel(status: any) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "ONLINE") return "Online";
  if (s === "PARCIAL") return "Parcial";
  if (s === "OFFLINE") return "Offline";
  if (s === "STALE") return "Sem atualização";
  if (s === "SEM_DADOS") return "Sem dados";
  return s || "Sem dados";
}

function backupLabel(status?: string | null) {
  const s = String(status || "").trim().toUpperCase();
  if (!s) return "Sem dados";
  if (s === "OK") return "OK";
  if (s === "ERRO") return "Erro no backup";
  if (s === "SEM_BACKUP_ONTEM") return "Sem backup ontem";
  if (s === "SEM_LOGS") return "Sem logs";
  if (s === "NAO_CONFIRMADO") return "Não confirmado";
  if (s === "PENDENTE_HOJE") return "Pendente hoje";
  return s.replace(/_/g, " ");
}

function certificateLabel(status?: string | null) {
  const s = String(status || "").trim().toUpperCase();
  if (!s) return "Sem dados";
  if (s === "OK") return "OK";
  if (s === "VENCIDO") return "Vencido";
  if (s === "NAO_ENCONTRADO") return "Não encontrado";
  if (s.startsWith("ALERTA_")) return s.replace("ALERTA_", "Alerta ");
  return s.replace(/_/g, " ");
}

function isBackupAlert(status?: string | null) {
  const s = String(status || "").toUpperCase();
  return ["ERRO", "SEM_BACKUP_ONTEM", "SEM_LOGS", "NAO_CONFIRMADO", "PENDENTE_HOJE"].includes(s);
}

function isCertificateAlert(status?: string | null) {
  const s = String(status || "").toUpperCase();
  return s === "VENCIDO" || s === "NAO_ENCONTRADO" || s.startsWith("ALERTA_");
}

function levelLabel(level: AlertLevel) {
  if (level === "critical") return "Crítico";
  if (level === "warn") return "Atenção";
  return "Informativo";
}

function levelBadgeClass(level: AlertLevel) {
  if (level === "critical") return "danger";
  if (level === "warn") return "warn";
  return "accentB";
}

function categoryLabel(category: AlertCategory) {
  if (category === "ticket") return "Chamado";
  if (category === "monitoring") return "Conectividade";
  if (category === "backup") return "Backup";
  return "Certificado";
}

function buildTicketAlerts(tickets: Ticket[], nowMs: number): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  tickets.forEach((ticket) => {
    const status = safeStatus((ticket as any).status);
    if (!OPEN_STATUSES.has(status) || isTicketClosed(ticket)) return;

    const sla = ticketSla(ticket, nowMs);
    const store = ticketStoreLabel(ticket);
    const opened = formatDateTimeShort((ticket as any).opened_at || (ticket as any).created_at || (ticket as any).updated_at);
    const href = `/tickets/${ticket.id}`;
    const problem = String((ticket as any).problem || "Chamado sem descrição").trim();

    if (sla?.overdue) {
      alerts.push({
        id: `ticket-overdue-${ticket.id}`,
        level: "critical",
        category: "ticket",
        title: `SLA vencido — ${store}`,
        subtitle: `${statusLabel(status)} • aberto em ${opened}`,
        detail: `${problem} • vencido há ${formatDurationMs(sla.remainingMs)}`,
        badge: `SLA ${sla.hours}h`,
        href,
        actionLabel: "Abrir chamado",
        sortScore: 100,
        sortTimeMs: sla.dueMs,
      });
    } else if (sla?.dueSoon) {
      alerts.push({
        id: `ticket-due-soon-${ticket.id}`,
        level: "warn",
        category: "ticket",
        title: `SLA próximo do vencimento — ${store}`,
        subtitle: `${statusLabel(status)} • aberto em ${opened}`,
        detail: `${problem} • vence em ${formatDurationMs(sla.remainingMs)}`,
        badge: `SLA ${sla.hours}h`,
        href,
        actionLabel: "Abrir chamado",
        sortScore: 70,
        sortTimeMs: sla.dueMs,
      });
    }

    if (safePriority((ticket as any).priority) === "URGENTE") {
      alerts.push({
        id: `ticket-urgent-${ticket.id}`,
        level: "critical",
        category: "ticket",
        title: `Chamado urgente — ${store}`,
        subtitle: `${statusLabel(status)} • aberto em ${opened}`,
        detail: problem,
        badge: "Urgente",
        href,
        actionLabel: "Abrir chamado",
        sortScore: 80,
        sortTimeMs: ticketOpenedMs(ticket) || 0,
      });
    }

    if (status === "PENDENTE") {
      alerts.push({
        id: `ticket-pending-${ticket.id}`,
        level: "warn",
        category: "ticket",
        title: `Chamado pendente — ${store}`,
        subtitle: `Aberto em ${opened}`,
        detail: problem,
        badge: "Pendente",
        href,
        actionLabel: "Abrir chamado",
        sortScore: 55,
        sortTimeMs: parseDateMs((ticket as any).updated_at) || ticketOpenedMs(ticket) || 0,
      });
    }
  });

  return alerts;
}

function buildMonitoringAlerts(stores: ExtendedMonitoringStore[]): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  stores.forEach((store) => {
    const titleLabel = storeLabel(store);
    const lastSeen = formatDateTimeShort(store.last_seen_at || store.last_check_at);
    const href = monitoringHref(store);

    if (store.status && store.status !== "ONLINE") {
      const critical = store.status === "OFFLINE";
      alerts.push({
        id: `store-status-${store.store_id}`,
        level: critical ? "critical" : "warn",
        category: "monitoring",
        title: `${monitoringStatusLabel(store.status)} — ${titleLabel}`,
        subtitle: `CNPJ ${store.cnpj || "—"} • última atualização ${lastSeen}`,
        detail: store.summary || `${store.down_count || 0}/${store.total_count || 0} caixa(s) sem comunicação.`,
        badge: monitoringStatusLabel(store.status),
        href,
        actionLabel: "Ver monitoramento",
        sortScore: critical ? 95 : 65,
        sortTimeMs: parseDateMs(store.last_seen_at || store.last_check_at) || 0,
      });
    }

    if (isBackupAlert(store.backup_status)) {
      const label = backupLabel(store.backup_status);
      const critical = ["ERRO", "SEM_BACKUP_ONTEM", "SEM_LOGS"].includes(String(store.backup_status || "").toUpperCase());
      alerts.push({
        id: `backup-${store.store_id}`,
        level: critical ? "critical" : "warn",
        category: "backup",
        title: `Backup em alerta — ${titleLabel}`,
        subtitle: `Status: ${label} • última leitura ${formatDateTimeShort(store.backup_last_seen_at || store.backup_last_event_at)}`,
        detail: store.backup_message || store.backup_summary || "Verifique a rotina de backup desta loja.",
        badge: label,
        href,
        actionLabel: "Ver monitoramento",
        sortScore: critical ? 90 : 58,
        sortTimeMs: parseDateMs(store.backup_last_seen_at || store.backup_last_event_at) || 0,
      });
    }

    if (isCertificateAlert(store.certificate_status)) {
      const label = certificateLabel(store.certificate_status);
      const days = typeof store.certificate_days_left === "number" && Number.isFinite(store.certificate_days_left)
        ? store.certificate_days_left
        : null;
      const critical = String(store.certificate_status || "").toUpperCase() === "VENCIDO" || (days != null && days < 0);
      const daysText = days == null ? "" : days < 0 ? ` • vencido há ${Math.abs(days)} dia(s)` : days === 0 ? " • vence hoje" : ` • vence em ${days} dia(s)`;

      alerts.push({
        id: `certificate-${store.store_id}`,
        level: critical ? "critical" : "warn",
        category: "certificate",
        title: `Certificado em alerta — ${titleLabel}`,
        subtitle: `Status: ${label}${daysText}`,
        detail: store.certificate_message || store.certificate_summary || `Vencimento: ${formatDateTimeShort(store.certificate_expires_at)}`,
        badge: label,
        href,
        actionLabel: "Ver monitoramento",
        sortScore: critical ? 88 : 60,
        sortTimeMs: parseDateMs(store.certificate_expires_at || store.certificate_last_seen_at) || 0,
      });
    }
  });

  return alerts;
}

export default function AlertsPage() {
  const { show, Toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [monitoring, setMonitoring] = React.useState<ExtendedMonitoringStore[]>([]);
  const [category, setCategory] = React.useState<"all" | AlertCategory>("all");
  const [level, setLevel] = React.useState<"all" | AlertLevel>("all");
  const [query, setQuery] = React.useState("");
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000);
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
      setTickets(ticketsResp || []);
      setLastRefresh(new Date());
      setNowMs(Date.now());
    } catch (err: any) {
      show(err?.message || "Não foi possível carregar os alertas.", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  React.useEffect(() => {
    load();
  }, [load]);

  const alerts = React.useMemo(() => {
    const rows = [
      ...buildTicketAlerts(tickets, nowMs),
      ...buildMonitoringAlerts(monitoring),
    ];

    rows.sort((a, b) => {
      if (a.sortScore !== b.sortScore) return b.sortScore - a.sortScore;
      return (a.sortTimeMs || 0) - (b.sortTimeMs || 0);
    });

    return rows;
  }, [tickets, monitoring, nowMs]);

  const filteredAlerts = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts.filter((alert) => {
      if (category !== "all" && alert.category !== category) return false;
      if (level !== "all" && alert.level !== level) return false;
      if (!q) return true;
      return `${alert.title} ${alert.subtitle} ${alert.detail} ${alert.badge}`.toLowerCase().includes(q);
    });
  }, [alerts, category, level, query]);

  const summary = React.useMemo(() => {
    const critical = alerts.filter((item) => item.level === "critical").length;
    const warn = alerts.filter((item) => item.level === "warn").length;
    const ticket = alerts.filter((item) => item.category === "ticket").length;
    const operation = alerts.length - ticket;
    return { total: alerts.length, critical, warn, ticket, operation };
  }, [alerts]);

  return (
    <div className="page-shell alerts-page alerts-page--refined">
      <Toast />

      <section className="alerts-hero-v2">
        <div className="alerts-hero-v2__content">
          <div className="alerts-hero-v2__eyebrow">Central operacional</div>
          <div className="alerts-hero-v2__head">
            <div>
              <h1>Central de alertas</h1>
              <p>
                Priorize o que exige ação: conectividade, backup, certificado e chamados com urgência ou SLA em atenção.
              </p>
            </div>
            <div className="alerts-hero-v2__actions">
              {lastRefresh ? <span className="alerts-refresh-pill">Atualizado {lastRefresh.toLocaleTimeString("pt-BR")}</span> : null}
              <button className="btn primary alerts-refresh-btn" onClick={load} disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </div>

        <div className="alerts-kpi-grid-v2">
          <div className="alerts-kpi-v2">
            <span className="alerts-kpi-v2__icon">📌</span>
            <div>
              <span>Fila atual</span>
              <strong>{summary.total}</strong>
              <small>Total de alertas ativos</small>
            </div>
          </div>
          <div className="alerts-kpi-v2 alerts-kpi-v2--danger">
            <span className="alerts-kpi-v2__icon">🔥</span>
            <div>
              <span>Críticos</span>
              <strong>{summary.critical}</strong>
              <small>Ação imediata</small>
            </div>
          </div>
          <div className="alerts-kpi-v2">
            <span className="alerts-kpi-v2__icon">🎫</span>
            <div>
              <span>Chamados</span>
              <strong>{summary.ticket}</strong>
              <small>SLA, urgência ou pendência</small>
            </div>
          </div>
          <div className="alerts-kpi-v2 alerts-kpi-v2--operation">
            <span className="alerts-kpi-v2__icon">🛰️</span>
            <div>
              <span>Operação</span>
              <strong>{summary.operation}</strong>
              <small>Monitoramento e rotinas</small>
            </div>
          </div>
        </div>
      </section>

      <section className="alerts-filters-v2">
        <div className="alerts-filter-field alerts-filter-field--search">
          <label>Buscar</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Loja, CNPJ, chamado, backup, certificado..."
          />
        </div>
        <div className="alerts-filter-field">
          <label>Categoria</label>
          <FancySelect
            value={category}
            onChange={(value) => setCategory(value as any)}
            options={[
              { value: "all", label: "Todas" },
              { value: "ticket", label: "Chamados" },
              { value: "monitoring", label: "Conectividade" },
              { value: "backup", label: "Backup" },
              { value: "certificate", label: "Certificados" },
            ]}
          />
        </div>
        <div className="alerts-filter-field">
          <label>Criticidade</label>
          <FancySelect
            value={level}
            onChange={(value) => setLevel(value as any)}
            options={[
              { value: "all", label: "Todas" },
              { value: "critical", label: "Crítico" },
              { value: "warn", label: "Atenção" },
              { value: "info", label: "Informativo" },
            ]}
          />
        </div>
        <button className="btn alerts-clear-btn" onClick={() => { setQuery(""); setCategory("all"); setLevel("all"); }}>
          Limpar
        </button>
      </section>

      <section className="alerts-board-v2">
        <div className="alerts-board-v2__head">
          <div>
            <h2>Fila de atenção</h2>
            <p>
              {filteredAlerts.length} de {alerts.length} alerta(s) exibido(s). Críticos aparecem primeiro.
            </p>
          </div>
          <div className="alerts-board-v2__legend">
            <span><i className="dot dot--critical" /> Crítico</span>
            <span><i className="dot dot--warn" /> Atenção</span>
          </div>
        </div>

        {loading ? (
          <div className="alerts-empty-v2">Carregando alertas...</div>
        ) : filteredAlerts.length ? (
          <div className="alerts-list-v2">
            {filteredAlerts.map((alert) => (
              <article className={`alerts-item-v2 alerts-item-v2--${alert.level}`} key={alert.id}>
                <div className="alerts-item-v2__marker" aria-hidden="true">
                  {alert.level === "critical" ? "!" : alert.level === "warn" ? "•" : "i"}
                </div>

                <div className="alerts-item-v2__content">
                  <div className="alerts-item-v2__title-row">
                    <h3>{alert.title}</h3>
                    <span className={`badge ${levelBadgeClass(alert.level)}`}>{levelLabel(alert.level)}</span>
                  </div>
                  <div className="alerts-item-v2__subtitle">{alert.subtitle}</div>
                  <div className="alerts-item-v2__detail">{alert.detail}</div>
                </div>

                <div className="alerts-item-v2__side">
                  <div className="alerts-item-v2__chips">
                    <span className="badge accentB">{categoryLabel(alert.category)}</span>
                    <span className="badge">{alert.badge}</span>
                  </div>
                  <Link className="btn small alerts-item-v2__action" to={alert.href}>{alert.actionLabel}</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="alerts-empty-v2">
            Nenhum alerta encontrado com os filtros atuais.
          </div>
        )}
      </section>
    </div>
  );
}
