import React from "react";
import { Link } from "react-router-dom";
import { listMonitoringOverview, listTickets, MonitoringStore, Ticket } from "../api";
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

const OPEN_STATUSES = new Set(["ABERTO", "ATRIBUIDO", "EM_ATENDIMENTO", "PENDENTE"]);

function normalize(v: any) {
  return String(v || "").trim().toUpperCase();
}

function isClosedTicket(t: any) {
  const status = normalize(t?.status);
  return status === "CONCLUIDO" || status === "CANCELADO";
}

function isOpenTicket(t: any) {
  const status = normalize(t?.status);
  return OPEN_STATUSES.has(status) && !isClosedTicket(t);
}

function statusLabel(status: any) {
  const s = normalize(status);
  if (s === "ABERTO") return "Aberto";
  if (s === "ATRIBUIDO") return "Em análise";
  if (s === "EM_ATENDIMENTO") return "Em atendimento";
  if (s === "PENDENTE") return "Pendente";
  if (s === "CONCLUIDO") return "Concluído";
  if (s === "CANCELADO") return "Cancelado";
  return s || "Status";
}

function priorityLabel(priority: any) {
  return normalize(priority) === "URGENTE" ? "Urgente" : "Normal";
}

function monitoringStatusLabel(status: any) {
  const s = normalize(status);
  if (s === "ONLINE") return "Online";
  if (s === "PARCIAL") return "Parcial";
  if (s === "OFFLINE") return "Offline";
  if (s === "STALE") return "Sem atualização";
  if (s === "SEM_DADOS") return "Sem dados";
  return s || "Sem dados";
}

function monitoringTone(status: any) {
  const s = normalize(status);
  if (s === "ONLINE") return "ok";
  if (s === "PARCIAL") return "warn";
  if (s === "OFFLINE") return "danger";
  if (s === "STALE") return "accentB";
  return "";
}

function ticketTone(ticket: any) {
  const status = normalize(ticket?.status);
  if (normalize(ticket?.priority) === "URGENTE" && !isClosedTicket(ticket)) return "danger";
  if (status === "PENDENTE") return "warn";
  if (status === "EM_ATENDIMENTO") return "accentB";
  if (status === "CONCLUIDO") return "ok";
  if (status === "CANCELADO") return "";
  return "accent";
}

function isBackupAlert(status?: string | null) {
  const s = normalize(status);
  return ["ERRO", "SEM_BACKUP_ONTEM", "SEM_LOGS", "NAO_CONFIRMADO", "PENDENTE_HOJE"].includes(s);
}

function isCertificateAlert(status?: string | null) {
  const s = normalize(status);
  return s === "VENCIDO" || s === "NAO_ENCONTRADO" || s.startsWith("ALERTA_");
}

function storeLabel(store: Pick<ExtendedMonitoringStore, "network_name" | "store_name">) {
  const network = String(store.network_name || "").trim();
  const name = String(store.store_name || "").trim();
  if (network && name) return `${network} - ${name}`;
  return name || network || "Loja";
}

function ticketStoreLabel(ticket: any) {
  const network = String(ticket?.store_network_name || ticket?.network_name || ticket?.rede_name || "").trim();
  const store = String(ticket?.store_name || ticket?.store?.name || ticket?.storeName || "").trim();
  if (network && store) return `${network} - ${store}`;
  return store || network || "Loja";
}

function formatDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseDate(v?: string | null) {
  if (!v) return 0;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : 0;
}

function monitoringHref(store: Pick<ExtendedMonitoringStore, "store_id" | "store_name" | "cnpj" | "network_name">) {
  const params = new URLSearchParams();
  if (store.store_id) params.set("store", String(store.store_id));

  const searchTerm = String(store.cnpj || store.store_name || store.network_name || "").trim();
  if (searchTerm) params.set("q", searchTerm);

  const qs = params.toString();
  return qs ? `/monitoring?${qs}` : "/monitoring";
}

function storeHasAttention(store: ExtendedMonitoringStore) {
  return normalize(store.status) !== "ONLINE" || isBackupAlert(store.backup_status) || isCertificateAlert(store.certificate_status);
}

export default function ClientPortalPage() {
  const { auth } = useAuth();
  const { show, Toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [stores, setStores] = React.useState<ExtendedMonitoringStore[]>([]);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [ticketsResp, monitoringResp] = await Promise.all([
        listTickets().catch(() => [] as Ticket[]),
        listMonitoringOverview().catch(() => ({ items: [] as ExtendedMonitoringStore[] })),
      ]);

      setTickets(ticketsResp || []);
      setStores(((monitoringResp as any)?.items || []) as ExtendedMonitoringStore[]);
      setLastRefresh(new Date());
    } catch (err: any) {
      show(err?.message || "Não foi possível carregar o portal do cliente.", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  React.useEffect(() => {
    load();
  }, [load]);

  const summary = React.useMemo(() => {
    const open = tickets.filter(isOpenTicket).length;
    const pending = tickets.filter((t) => normalize((t as any).status) === "PENDENTE").length;
    const inProgress = tickets.filter((t) => normalize((t as any).status) === "EM_ATENDIMENTO").length;
    const urgent = tickets.filter((t) => normalize((t as any).priority) === "URGENTE" && isOpenTicket(t)).length;
    const concluded = tickets.filter((t) => normalize((t as any).status) === "CONCLUIDO").length;

    const online = stores.filter((s) => normalize(s.status) === "ONLINE").length;
    const attention = stores.filter(storeHasAttention).length;
    const backupAlerts = stores.filter((s) => isBackupAlert(s.backup_status)).length;
    const certificateAlerts = stores.filter((s) => isCertificateAlert(s.certificate_status)).length;

    return {
      open,
      pending,
      inProgress,
      urgent,
      concluded,
      totalTickets: tickets.length,
      online,
      attention,
      backupAlerts,
      certificateAlerts,
      totalStores: stores.length,
    };
  }, [tickets, stores]);

  const latestTickets = React.useMemo(() => {
    return [...tickets]
      .sort((a: any, b: any) => {
        const da = parseDate(a.updated_at) || parseDate(a.opened_at);
        const db = parseDate(b.updated_at) || parseDate(b.opened_at);
        return db - da;
      })
      .slice(0, 6);
  }, [tickets]);

  const storesToShow = React.useMemo(() => {
    return [...stores]
      .sort((a, b) => {
        const score = (item: ExtendedMonitoringStore) => {
          let n = 0;
          if (normalize(item.status) === "OFFLINE") n += 50;
          if (normalize(item.status) === "PARCIAL") n += 35;
          if (normalize(item.status) === "STALE") n += 20;
          if (isBackupAlert(item.backup_status)) n += 15;
          if (isCertificateAlert(item.certificate_status)) n += 15;
          return n;
        };
        return score(b) - score(a);
      })
      .slice(0, 6);
  }, [stores]);

  const operationText = React.useMemo(() => {
    if (loading) return "Carregando informações autorizadas para seu acesso.";
    if (!summary.totalStores && !summary.totalTickets) {
      return "Nenhuma loja ou chamado foi encontrado para este acesso.";
    }
    if (summary.attention > 0 || summary.urgent > 0 || summary.pending > 0) {
      return "Existem pontos que merecem acompanhamento. Veja as lojas e chamados em destaque abaixo.";
    }
    if (summary.open > 0 || summary.inProgress > 0) {
      return "Há chamados em acompanhamento, mas sem destaque crítico no momento.";
    }
    return "Tudo certo no momento. Use os atalhos para consultar histórico, lojas e relatórios.";
  }, [loading, summary]);

  return (
    <div className="page-shell client-portal-shell">
      <div className="card page-hero client-portal-hero">
        <div className="page-hero__head">
          <div>
            <div className="client-portal-kicker">Portal do Cliente</div>
            <h1 className="page-hero__title">Olá, {auth?.username || "cliente"}</h1>
            <div className="page-hero__sub">
              Acompanhe seus chamados, lojas monitoradas e principais informações do suporte RioAutocom.
            </div>
          </div>

          <div className="page-hero__actions">
            <span className="badge accent">Acesso cliente</span>
            <span className="badge">Atualizado {lastRefresh ? lastRefresh.toLocaleTimeString("pt-BR") : "—"}</span>
            <button className="btn" onClick={load} disabled={loading} type="button">
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        <div className="client-portal-hero-grid">
          <div className="client-portal-status-card">
            <div className="client-portal-status-card__label">Situação geral</div>
            <div className="client-portal-status-card__title">
              {summary.attention > 0 || summary.urgent > 0 ? "Atenção recomendada" : "Acompanhamento normal"}
            </div>
            <p>{operationText}</p>
            <div className="client-portal-actions">
              <Link className="btn primary" to="/tickets">
                Ver chamados
              </Link>
              <Link className="btn" to="/monitoring">
                Ver minhas lojas
              </Link>
            </div>
          </div>

          <div className="client-portal-mini-panel">
            <div className="client-portal-mini-panel__row">
              <span>Chamados em aberto</span>
              <strong>{summary.open}</strong>
            </div>
            <div className="client-portal-mini-panel__row">
              <span>Lojas monitoradas</span>
              <strong>{summary.totalStores}</strong>
            </div>
            <div className="client-portal-mini-panel__row">
              <span>Lojas online</span>
              <strong>{summary.online}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="client-portal-kpis">
        <div className="page-kpi client-portal-kpi">
          <div className="page-kpi__label">Chamados abertos</div>
          <div className="page-kpi__value">{summary.open}</div>
          <div className="page-kpi__hint">Solicitações em acompanhamento.</div>
        </div>
        <div className="page-kpi client-portal-kpi">
          <div className="page-kpi__label">Em atendimento</div>
          <div className="page-kpi__value">{summary.inProgress}</div>
          <div className="page-kpi__hint">Chamados já em execução.</div>
        </div>
        <div className="page-kpi client-portal-kpi">
          <div className="page-kpi__label">Lojas em atenção</div>
          <div className="page-kpi__value">{summary.attention}</div>
          <div className="page-kpi__hint">Conectividade, backup ou certificado.</div>
        </div>
        <div className="page-kpi client-portal-kpi">
          <div className="page-kpi__label">Concluídos</div>
          <div className="page-kpi__value">{summary.concluded}</div>
          <div className="page-kpi__hint">Atendimentos finalizados no período.</div>
        </div>
      </div>

      <div className="client-portal-grid">
        <section className="card page-section-card client-portal-main-card">
          <div className="page-section-head">
            <div>
              <h2 className="page-section-title">Chamados recentes</h2>
              <div className="page-section-sub">Últimas solicitações liberadas para sua consulta.</div>
            </div>
            <Link className="btn" to="/tickets">
              Ver todos
            </Link>
          </div>

          <div className="client-portal-list">
            {latestTickets.length ? (
              latestTickets.map((ticket) => (
                <Link className="client-portal-ticket" to={`/tickets/${ticket.id}`} key={ticket.id}>
                  <div className="client-portal-ticket__main">
                    <div className="client-portal-ticket__title">{ticketStoreLabel(ticket)}</div>
                    <div className="client-portal-ticket__meta">
                      {ticket.local || "Local não informado"} • Atualizado em {formatDate((ticket as any).updated_at || (ticket as any).opened_at)}
                    </div>
                    <div className="client-portal-ticket__problem">{ticket.problem || "Sem descrição informada."}</div>
                  </div>
                  <div className="client-portal-ticket__side">
                    <span className={`badge ${ticketTone(ticket)}`}>{statusLabel((ticket as any).status)}</span>
                    <span className={`badge ${normalize((ticket as any).priority) === "URGENTE" ? "danger" : ""}`}>
                      {priorityLabel((ticket as any).priority)}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="page-inline-note">Nenhum chamado encontrado para este acesso.</div>
            )}
          </div>
        </section>

        <aside className="client-portal-side">
          <section className="card page-section-card">
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Minhas lojas</h2>
                <div className="page-section-sub">Resumo das lojas liberadas para seu usuário.</div>
              </div>
              <Link className="btn" to="/monitoring">
                Abrir
              </Link>
            </div>

            <div className="client-portal-store-list">
              {storesToShow.length ? (
                storesToShow.map((store) => (
                  <Link className="client-portal-store" to={monitoringHref(store)} key={store.store_id}>
                    <div>
                      <div className="client-portal-store__title">{storeLabel(store)}</div>
                      <div className="small client-portal-store__sub">{store.cnpj || "CNPJ não informado"}</div>
                    </div>
                    <div className="client-portal-store__badges">
                      <span className={`badge ${monitoringTone(store.status)}`}>{monitoringStatusLabel(store.status)}</span>
                      {isBackupAlert(store.backup_status) ? <span className="badge warn">Backup</span> : null}
                      {isCertificateAlert(store.certificate_status) ? <span className="badge danger">Certificado</span> : null}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="page-inline-note">Nenhuma loja monitorada encontrada para este acesso.</div>
              )}
            </div>
          </section>

          <section className="card page-section-card client-portal-help-card">
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Acesso rápido</h2>
                <div className="page-section-sub">Atalhos úteis para consulta.</div>
              </div>
            </div>

            <div className="client-portal-shortcuts">
              <Link className="client-portal-shortcut" to="/tickets">
                <span>🎫</span>
                <div>
                  <strong>Histórico de chamados</strong>
                  <small>Veja andamento, pareceres e anexos.</small>
                </div>
              </Link>
              <Link className="client-portal-shortcut" to="/monitoring">
                <span>📡</span>
                <div>
                  <strong>Status das lojas</strong>
                  <small>Consulte caixas, backup e certificado.</small>
                </div>
              </Link>
              <Link className="client-portal-shortcut" to="/reports">
                <span>📊</span>
                <div>
                  <strong>Relatórios</strong>
                  <small>Analise volumes e chamados concluídos.</small>
                </div>
              </Link>
            </div>
          </section>
        </aside>
      </div>

      <Toast />
    </div>
  );
}
