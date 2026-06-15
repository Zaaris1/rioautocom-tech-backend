import React from "react";
import { useLocation } from "react-router-dom";
import { MonitoringEvent, MonitoringStatus, MonitoringStore, getMonitoringStore, listMonitoringHistory, listMonitoringOverview, listNetworks } from "../api";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth";
import FancySelect from "../components/FancySelect";

type ExtendedMonitoringStore = MonitoringStore & {
  backup_status?: string | null;
  backup_summary?: string | null;
  backup_message?: string | null;
  backup_task_name?: string | null;
  backup_source_name?: string | null;
  backup_last_event_at?: string | null;
  backup_last_seen_at?: string | null;
  backup_agent_version?: string | null;
  certificate_status?: string | null;
  certificate_summary?: string | null;
  certificate_message?: string | null;
  certificate_alert_days?: number | null;
  certificate_expires_at?: string | null;
  certificate_days_left?: number | null;
  certificate_last_seen_at?: string | null;
  certificate_agent_version?: string | null;
  certificate_items?: Array<{
    cn: string;
    thumbprint?: string | null;
    issuer?: string | null;
    store?: string | null;
    expires_at?: string | null;
    days_left?: number | null;
    status?: string | null;
  }>;
};

const STATUS_OPTIONS: Array<{ value: MonitoringStatus | ""; label: string }> = [
  { value: "", label: "Todos" },
  { value: "ONLINE", label: "Online" },
  { value: "PARCIAL", label: "Parcial" },
  { value: "OFFLINE", label: "Offline" },
  { value: "STALE", label: "Desatualizado" },
  { value: "SEM_DADOS", label: "Sem dados" },
];

function useIsMobile(breakpointPx = 960) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    if ((mq as any).addEventListener) (mq as any).addEventListener("change", onChange);
    else (mq as any).addListener(onChange);
    return () => {
      if ((mq as any).removeEventListener) (mq as any).removeEventListener("change", onChange);
      else (mq as any).removeListener(onChange);
    };
  }, [breakpointPx]);

  return isMobile;
}

function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

function fmtAge(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d ${h}h`;
}

function fmtDays(days?: number | null) {
  if (days == null || !Number.isFinite(days)) return "—";
  if (days < 0) return `${Math.abs(days)} dia(s) vencido`;
  if (days === 0) return "vence hoje";
  return `${days} dia(s)`;
}

function splitCn(cn?: string | null) {
  const raw = String(cn || "").trim();
  if (!raw) return { name: "—", doc: "" };
  const idx = raw.lastIndexOf(":");
  if (idx <= 0 || idx === raw.length - 1) return { name: raw, doc: "" };
  return {
    name: raw.slice(0, idx).trim(),
    doc: raw.slice(idx + 1).trim(),
  };
}

function renderSignature(signature?: string | null) {
  const raw = String(signature || "").trim();
  if (!raw) return "—";
  const lines = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ip, ok] = part.split("|");
      const state = ok === "1" ? "OK" : ok === "0" ? "FAIL" : "";
      return { name: name || "Caixa", ip: ip || "—", state };
    });

  if (!lines.length) return raw;

  return (
    <div className="monitor-signature-list">
      {lines.map((line, idx) => (
        <div className="monitor-signature-item" key={`${line.name}-${line.ip}-${idx}`}>
          <span className="monitor-signature-item__name">{line.name}</span>
          <span className="monitor-signature-item__ip">{line.ip}</span>
          {line.state ? <span className={`badge mini ${line.state === "OK" ? "ok" : "danger"}`}>{line.state}</span> : null}
        </div>
      ))}
    </div>
  );
}

function statusMeta(status: MonitoringStatus) {
  switch (status) {
    case "ONLINE":
      return { label: "Online", dot: "🟢", tone: "monitor-online" };
    case "PARCIAL":
      return { label: "Parcial", dot: "🟡", tone: "monitor-partial" };
    case "OFFLINE":
      return { label: "Offline", dot: "🔴", tone: "monitor-offline" };
    case "STALE":
      return { label: "Desatualizado", dot: "🟠", tone: "monitor-stale" };
    default:
      return { label: "Sem dados", dot: "⚪", tone: "monitor-empty" };
  }
}

function backupMeta(status?: string | null) {
  const raw = String(status || "").toUpperCase();
  if (!raw) return { label: "Sem dados", className: "accentB", short: "Sem dados" };
  if (raw === "OK") return { label: "OK", className: "ok", short: "OK" };
  if (raw === "PENDENTE_HOJE") return { label: "Pendente hoje", className: "accent", short: "Pendente" };
  if (raw === "ERRO") return { label: "Com erro", className: "danger", short: "Erro" };
  if (raw === "SEM_BACKUP_ONTEM") return { label: "Sem backup ontem", className: "danger", short: "Sem backup" };
  if (raw === "SEM_LOGS") return { label: "Sem logs", className: "danger", short: "Sem logs" };
  if (raw === "NAO_CONFIRMADO") return { label: "Não confirmado", className: "warn", short: "Não confirmado" };
  return { label: raw.replace(/_/g, " "), className: "accent", short: raw.replace(/_/g, " ") };
}

function certificateMeta(status?: string | null) {
  const raw = String(status || "").toUpperCase();
  if (!raw) return { label: "Sem dados", className: "accentB", short: "Sem dados" };
  if (raw === "OK") return { label: "OK", className: "ok", short: "OK" };
  if (raw === "VENCIDO") return { label: "Vencido", className: "danger", short: "Vencido" };
  if (raw === "NAO_ENCONTRADO") return { label: "Não encontrado", className: "warn", short: "Não encontrado" };
  if (raw.startsWith("ALERTA_")) return { label: raw.replace("ALERTA_", "Alerta "), className: "warn", short: "Alerta" };
  return { label: raw.replace(/_/g, " "), className: "accent", short: raw.replace(/_/g, " ") };
}

function isBackupAlert(status?: string | null) {
  const raw = String(status || "").toUpperCase();
  return ["ERRO", "SEM_BACKUP_ONTEM", "SEM_LOGS", "NAO_CONFIRMADO", "PENDENTE_HOJE"].includes(raw);
}

function isCertificateAlert(status?: string | null) {
  const raw = String(status || "").toUpperCase();
  return raw === "VENCIDO" || raw === "NAO_ENCONTRADO" || raw.startsWith("ALERTA_");
}

type MonitoringNoticeOption = "boxes" | "backup" | "certificate";

type NoticeSelection = Record<MonitoringNoticeOption, boolean>;

function fmtMessageDateTime(v?: string | null) {
  if (!v) return "não informado";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

function getNoticeStoreLabel(store?: Pick<ExtendedMonitoringStore, "network_name" | "store_name"> | null) {
  const networkName = String(store?.network_name || "").trim();
  const storeName = String(store?.store_name || "").trim();

  if (networkName && storeName) return `${networkName} - ${storeName}`;
  if (storeName) return storeName;
  if (networkName) return networkName;
  return "—";
}

function getDefaultNoticeSelection(store?: ExtendedMonitoringStore | null): NoticeSelection {
  const hasBoxAlert = !!store?.items?.some((item) => !item.ok) || (store?.down_count || 0) > 0;
  const hasBackup = isBackupAlert(store?.backup_status);
  const hasCertificate = isCertificateAlert(store?.certificate_status);
  const anyAlert = hasBoxAlert || hasBackup || hasCertificate;

  return {
    boxes: anyAlert ? hasBoxAlert : true,
    backup: hasBackup,
    certificate: hasCertificate,
  };
}

function getBackupNoticeHeadline(status?: string | null) {
  const raw = String(status || "").toUpperCase();

  switch (raw) {
    case "ERRO":
      return "🚨 *O backup está com erro.*";
    case "SEM_BACKUP_ONTEM":
      return "🚨 *Não houve confirmação de backup ontem.*";
    case "PENDENTE_HOJE":
      return "⚠️ *O backup ainda está pendente hoje.*";
    case "SEM_LOGS":
      return "⚠️ *Não há logs de backup na última leitura.*";
    case "NAO_CONFIRMADO":
      return "⚠️ *O backup ainda não foi confirmado.*";
    default:
      return `⚠️ *Status do backup:* ${backupMeta(status).label}.`;
  }
}

function getCertificateNoticeHeadline(status?: string | null, daysLeft?: number | null) {
  const raw = String(status || "").toUpperCase();

  if (raw === "VENCIDO" || (typeof daysLeft === "number" && Number.isFinite(daysLeft) && daysLeft < 0)) {
    return "🚨 *O certificado digital está vencido.*";
  }

  if (raw === "NAO_ENCONTRADO") {
    return "⚠️ *O certificado digital não foi encontrado na última leitura.*";
  }

  if (typeof daysLeft === "number" && Number.isFinite(daysLeft)) {
    if (daysLeft === 0) return "⚠️ *O certificado digital vence hoje.*";
    if (daysLeft > 0) return "⏳ *O certificado digital está próximo do vencimento.*";
  }

  return `⚠️ *Status do certificado:* ${certificateMeta(status).label}.`;
}

function describeCertificateAlertItem(item: {
  cn: string;
  days_left?: number | null;
  status?: string | null;
}) {
  const parts = splitCn(item.cn);
  const label = parts.doc ? `${parts.name} (${parts.doc})` : parts.name;

  if (typeof item.days_left === "number" && Number.isFinite(item.days_left)) {
    if (item.days_left < 0) return `• *${label}* — vencido há ${Math.abs(item.days_left)} dia(s)`;
    if (item.days_left === 0) return `• *${label}* — vence hoje`;
    return `• *${label}* — vence em ${item.days_left} dia(s)`;
  }

  return `• *${label}* — ${certificateMeta(item.status).label.toLowerCase()}`;
}

function buildMonitoringNotice(store: ExtendedMonitoringStore, selection: NoticeSelection) {
  const lines: string[] = [
    "📡 *RioAutocom Monitoramento*",
    "",
    `🏪 *Cliente:* ${getNoticeStoreLabel(store)}`,
    `🧾 *CNPJ:* ${store.cnpj || "—"}`,
  ];

  const selectedKeys = (Object.entries(selection) as Array<[MonitoringNoticeOption, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  if (!selectedKeys.length) {
    lines.push("");
    lines.push("⚠️ *Nenhum aviso foi selecionado.*");
    return lines.join("\n");
  }

  const failedItems = (store.items || []).filter((item) => !item.ok);
  const totalBoxes = Number(store.total_count || failedItems.length || 0);
  const failedCount = failedItems.length || Number(store.down_count || 0);
  const allBoxesDown = totalBoxes > 0 && failedCount >= totalBoxes;
  const lastSeenAt = fmtMessageDateTime(store.last_seen_at || store.last_check_at);
  const ageLabel = fmtAge(store.age_seconds);

  const certAlertItems = (store.certificate_items || [])
    .filter((item) => isCertificateAlert(item.status))
    .sort((a, b) => {
      const aDays = typeof a.days_left === "number" && Number.isFinite(a.days_left) ? a.days_left : 999999;
      const bDays = typeof b.days_left === "number" && Number.isFinite(b.days_left) ? b.days_left : 999999;
      return aDays - bDays;
    });

  lines.push("");
  lines.push(selectedKeys.length > 1 ? "⚠️ *Pontos que precisam de atenção:*" : "⚠️ *Ponto que precisa de atenção:*");

  if (selection.boxes) {
    lines.push("");
    lines.push("🖥️ *Comunicação dos caixas*");

    if (allBoxesDown) {
      lines.push(`🚨 *Todos os ${totalBoxes} caixa(s) da loja estão sem comunicação.*`);
      lines.push(`⏱️ Última atualização recebida: *${lastSeenAt}*${ageLabel !== "—" ? ` (há *${ageLabel}*)` : ""}`);
    } else if (failedCount > 0) {
      const totalLabel = totalBoxes > 0 ? totalBoxes : failedCount;
      lines.push(`⚠️ *${failedCount} de ${totalLabel}* caixa(s) estão com falha de comunicação.`);
    } else {
      lines.push("⚠️ Foi identificado problema de comunicação, mas sem detalhamento dos caixas na leitura atual.");
    }

    if (failedItems.length) {
      lines.push("Caixas afetados:");
      for (const item of failedItems) {
        const detail = item.detail ? ` — ${item.detail}` : "";
        lines.push(`• *${item.name || "Caixa"}* — ${item.ip || "IP não informado"}${detail}`);
      }
    }
  }

  if (selection.backup) {
    const lastBackup = fmtMessageDateTime(store.backup_last_event_at || store.backup_last_seen_at);

    lines.push("");
    lines.push("💾 *Backup*");
    lines.push(getBackupNoticeHeadline(store.backup_status));
    lines.push(`🕒 Último evento registrado: *${lastBackup}*`);

    if (store.backup_task_name) {
      lines.push(`📁 Tarefa: *${store.backup_task_name}*`);
    }

    if (store.backup_source_name) {
      lines.push(`📂 Origem: *${store.backup_source_name}*`);
    }
  }

  if (selection.certificate) {
    const expiresAt = fmtMessageDateTime(store.certificate_expires_at);
    const daysLeft = store.certificate_days_left;

    lines.push("");
    lines.push("🔐 *Certificado digital*");
    lines.push(getCertificateNoticeHeadline(store.certificate_status, daysLeft));

    if (typeof daysLeft === "number" && Number.isFinite(daysLeft)) {
      if (daysLeft < 0) {
        lines.push(`📅 Vencimento: *${expiresAt}* (${Math.abs(daysLeft)} dia(s) em atraso)`);
      } else if (daysLeft === 0) {
        lines.push(`📅 Vencimento: *${expiresAt}*`);
      } else {
        lines.push(`📅 Vencimento: *${expiresAt}* (faltam *${daysLeft}* dia(s))`);
      }
    } else {
      lines.push(`📅 Vencimento: *${expiresAt}*`);
    }

    if (certAlertItems.length) {
      lines.push("Certificados em atenção:");
      for (const item of certAlertItems.slice(0, 5)) {
        lines.push(describeCertificateAlertItem(item));
      }

      if (certAlertItems.length > 5) {
        lines.push(`• ... e mais *${certAlertItems.length - 5}* certificado(s) em atenção`);
      }
    }
  }

  lines.push("");
  lines.push("🙏 Por favor, verifique para evitar impacto na operação.");

  return lines.join("\n");
}

function OverviewTile({ title, value, hint, tone }: { title: string; value: string; hint: string; tone: string }) {
  return (
    <div className={`monitor-tile ${tone}`}>
      <div className="monitor-tile__title">{title}</div>
      <div className="monitor-tile__value">{value}</div>
      <div className="monitor-tile__hint">{hint}</div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className={`monitor-metric-card ${tone || ""}`.trim()}>
      <div className="monitor-metric-card__label">{label}</div>
      <div className="monitor-metric-card__value">{value || "—"}</div>
    </div>
  );
}

function KeyValueList({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="monitor-kv-list">
      {items.map((item, idx) => (
        <div className="monitor-kv-list__row" key={`${item.label}-${idx}`}>
          <span>{item.label}</span>
          <strong>{item.value || "—"}</strong>
        </div>
      ))}
    </div>
  );
}


function historyCategoryLabel(value?: string | null) {
  const raw = String(value || "SYSTEM").toUpperCase();
  if (raw === "CONNECTIVITY") return "Conectividade";
  if (raw === "BACKUP") return "Backup";
  if (raw === "CERTIFICATE") return "Certificado";
  return "Sistema";
}

function historySeverityMeta(value?: string | null) {
  const raw = String(value || "INFO").toUpperCase();
  if (raw === "CRITICAL") return { label: "Crítico", className: "danger" };
  if (raw === "WARNING") return { label: "Atenção", className: "warn" };
  if (raw === "OK") return { label: "Resolvido", className: "ok" };
  return { label: "Informação", className: "accentB" };
}

function exportMonitoringHistoryCsv(events: MonitoringEvent[]) {
  const sep = ";";
  const rows = [
    ["Data", "Criticidade", "Categoria", "Rede", "Loja", "CNPJ", "Evento", "Mensagem", "De", "Para"],
    ...events.map((event) => [
      fmtDateTime(event.occurred_at),
      historySeverityMeta(event.severity).label,
      historyCategoryLabel(event.category),
      event.network_name || "",
      event.store_name || "",
      event.cnpj || "",
      event.title || "",
      event.message || "",
      event.status_from || "",
      event.status_to || "",
    ]),
  ];

  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(sep)).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historico-monitoramento-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function MonitoringHistoryPanel({
  events,
  summary,
  loading,
  days,
  category,
  scope,
  selectedLabel,
  hasSelected,
  onDaysChange,
  onCategoryChange,
  onScopeChange,
  onReload,
  onExport,
}: {
  events: MonitoringEvent[];
  summary: { total: number; critical: number; warning: number; ok: number; connectivity: number; backup: number; certificate: number } | null;
  loading: boolean;
  days: number;
  category: string;
  scope: "all" | "selected";
  selectedLabel: string;
  hasSelected: boolean;
  onDaysChange: (value: number) => void;
  onCategoryChange: (value: string) => void;
  onScopeChange: (value: "all" | "selected") => void;
  onReload: () => void;
  onExport: () => void;
}) {
  const safeSummary = summary || { total: 0, critical: 0, warning: 0, ok: 0, connectivity: 0, backup: 0, certificate: 0 };

  return (
    <section className="card monitor-history-panel">
      <div className="monitor-history-head">
        <div>
          <div className="h2">Histórico de monitoramento</div>
          <div className="monitor-hero__sub">Eventos de queda, recuperação, backup e certificados registrados automaticamente.</div>
        </div>
        <div className="monitor-history-actions">
          <button className="btn" onClick={onReload} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
          <button className="btn accent" onClick={onExport} disabled={!events.length}>Exportar CSV</button>
        </div>
      </div>

      <div className="monitor-history-kpis">
        <OverviewTile title="Eventos" value={String(safeSummary.total)} hint="No período selecionado." tone="monitor-empty" />
        <OverviewTile title="Críticos" value={String(safeSummary.critical)} hint="Exigem atenção rápida." tone="monitor-offline" />
        <OverviewTile title="Atenção" value={String(safeSummary.warning)} hint="Ocorrências em observação." tone="monitor-partial" />
        <OverviewTile title="Recuperações" value={String(safeSummary.ok)} hint="Status normalizado." tone="monitor-online" />
      </div>

      <div className="monitor-history-filters">
        <div>
          <label>Período</label>
          <FancySelect
            value={String(days)}
            onChange={(value) => onDaysChange(Number(value || 30))}
            className="monitor-fancy-select"
            placeholder="30 dias"
            options={[
              { value: "7", label: "Últimos 7 dias" },
              { value: "15", label: "Últimos 15 dias" },
              { value: "30", label: "Últimos 30 dias" },
              { value: "90", label: "Últimos 90 dias" },
            ]}
          />
        </div>
        <div>
          <label>Tipo de evento</label>
          <FancySelect
            value={category}
            onChange={onCategoryChange}
            className="monitor-fancy-select"
            placeholder="Todos"
            options={[
              { value: "", label: "Todos" },
              { value: "CONNECTIVITY", label: "Conectividade" },
              { value: "BACKUP", label: "Backup" },
              { value: "CERTIFICATE", label: "Certificado" },
            ]}
          />
        </div>
        <div>
          <label>Escopo</label>
          <FancySelect
            value={scope}
            onChange={(value) => onScopeChange(value === "selected" ? "selected" : "all")}
            className="monitor-fancy-select"
            placeholder="Todas as lojas"
            options={[
              { value: "all", label: "Todas as lojas" },
              { value: "selected", label: hasSelected ? `Loja selecionada: ${selectedLabel}` : "Loja selecionada" },
            ]}
          />
        </div>
      </div>

      <div className="monitor-history-list">
        {events.map((event) => {
          const sev = historySeverityMeta(event.severity);
          return (
            <div className={`monitor-history-event monitor-history-event--${String(event.severity || "info").toLowerCase()}`} key={event.id}>
              <div className="monitor-history-event__main">
                <div className="monitor-history-event__title-row">
                  <strong>{event.title}</strong>
                  <span className={`badge ${sev.className}`}>{sev.label}</span>
                  <span className="badge accentB">{historyCategoryLabel(event.category)}</span>
                </div>
                <div className="monitor-history-event__meta">
                  {event.network_name ? `${event.network_name} • ` : ""}{event.store_name || "Loja"}{event.cnpj ? ` • CNPJ ${event.cnpj}` : ""}
                </div>
                {event.message ? <div className="monitor-history-event__message">{event.message}</div> : null}
              </div>
              <div className="monitor-history-event__time">{fmtDateTime(event.occurred_at)}</div>
            </div>
          );
        })}
        {!loading && !events.length ? (
          <div className="monitor-history-empty">Nenhum evento registrado para os filtros atuais. Os próximos heartbeats dos monitores começarão a alimentar este histórico.</div>
        ) : null}
      </div>
    </section>
  );
}

function SectionToggle({ title, subtitle, badge, defaultOpen = false, children }: { title: string; subtitle?: React.ReactNode; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="monitor-accordion-v2" open={defaultOpen}>
      <summary className="monitor-accordion-v2__summary">
        <div className="monitor-accordion-v2__head">
          <div className="monitor-accordion-v2__title">{title}</div>
          {subtitle ? <div className="monitor-accordion-v2__subtitle">{subtitle}</div> : null}
        </div>
        <div className="monitor-accordion-v2__side">
          {badge ? <div className="monitor-accordion-v2__badge">{badge}</div> : null}
          <span className="monitor-accordion-v2__icon" aria-hidden="true">⌄</span>
        </div>
      </summary>
      <div className="monitor-accordion-v2__content">{children}</div>
    </details>
  );
}

function CertificateCell({ cn }: { cn?: string | null }) {
  const parts = splitCn(cn);
  return (
    <div className="monitor-cert-cell-v2">
      <div className="monitor-cert-cell-v2__name">{parts.name}</div>
      {parts.doc ? <div className="monitor-cert-cell-v2__doc">{parts.doc}</div> : null}
    </div>
  );
}

function StoreCard({ item, active, onClick }: { item: ExtendedMonitoringStore; active: boolean; onClick: () => void }) {
  const status = statusMeta(item.status);
  const backup = backupMeta(item.backup_status);
  const cert = certificateMeta(item.certificate_status);

  return (
    <button type="button" className={`monitor-store-card-v2 ${active ? "is-active" : ""}`} onClick={onClick}>
      <div className="monitor-store-card-v2__top">
        <div className="monitor-store-card-v2__titleblock">
          <div className="monitor-store-card-v2__name">{item.store_name}</div>
          <div className="monitor-store-card-v2__sub">{item.network_name || "Sem rede"} • CNPJ {item.cnpj}</div>
        </div>
        <span className={`monitor-status-pill ${status.tone}`}>
          <span>{status.dot}</span>
          <span>{status.label}</span>
        </span>
      </div>

      <div className="monitor-card-stats-v2">
        <div className="monitor-card-stat-v2">
          <span>Caixas</span>
          <strong>{item.up_count}/{item.total_count} OK</strong>
        </div>
        <div className="monitor-card-stat-v2">
          <span>Falhas</span>
          <strong>{item.down_count}</strong>
        </div>
        <div className="monitor-card-stat-v2">
          <span>Backup</span>
          <strong><span className={`badge mini ${backup.className}`}>{backup.short}</span></strong>
        </div>
        <div className="monitor-card-stat-v2">
          <span>Certificado</span>
          <strong><span className={`badge mini ${cert.className}`}>{cert.short}</span></strong>
        </div>
      </div>

      <div className="monitor-kpis monitor-kpis--compact monitor-kpis--tightline">
        <span className="monitor-kpi">Atualizado há {fmtAge(item.age_seconds)}</span>
        {item.methods ? <span className="monitor-kpi">{item.methods}</span> : null}
      </div>

      <div className="monitor-summary-inline">{item.summary || `${item.up_count}/${item.total_count} caixas OK`}</div>
      <div className="monitor-store-card-v2__action">Abrir detalhes</div>
    </button>
  );
}

function DesktopConnectivitySummary({ selected }: { selected: ExtendedMonitoringStore }) {
  return (
    <div className="monitor-surface-card monitor-surface-card--summary">
      <div className="monitor-surface-card__head">
        <div>
          <div className="monitor-surface-card__title">Resumo da conectividade</div>
          <div className="monitor-surface-card__subtitle">Visão rápida da última leitura do agente, sem repetir a lista de caixas.</div>
        </div>
        {selected.agent_version ? <span className="badge">{selected.agent_version}</span> : null}
      </div>
      <div className="monitor-connectivity-grid monitor-connectivity-grid--desktop-5">
        <MetricCard label="Resumo" value={selected.summary || `${selected.up_count}/${selected.total_count} caixas OK`} />
        <MetricCard label="Última checagem" value={fmtDateTime(selected.last_check_at)} />
        <MetricCard label="Atualização recebida" value={fmtDateTime(selected.last_seen_at)} />
        <MetricCard label="Métodos" value={selected.methods || "—"} />
        <MetricCard label="Agente" value={selected.agent_version || "—"} />
      </div>
    </div>
  );
}

function DetailPanel({ selected, detailLoading, onClose, isMobile, canGenerateNotice, onGenerateNotice }: { selected: ExtendedMonitoringStore | null; detailLoading: boolean; onClose?: () => void; isMobile: boolean; canGenerateNotice?: boolean; onGenerateNotice?: (store: ExtendedMonitoringStore) => void }) {
  if (!selected) return <div className="small">Selecione uma loja para ver os detalhes.</div>;

  const status = statusMeta(selected.status || "SEM_DADOS");
  const backup = backupMeta(selected.backup_status);
  const cert = certificateMeta(selected.certificate_status);
  const certificateCount = selected.certificate_items?.length || 0;

  return (
    <>
      <div className="monitor-detail-head monitor-detail-head--v2">
        <div>
          <div className="monitor-detail-title">{selected.store_name}</div>
          <div className="monitor-detail-sub">{selected.network_name || "Sem rede"} • CNPJ {selected.cnpj}</div>
        </div>
        <div className="monitor-detail-head__actions">
          <span className={`monitor-status-pill ${status.tone}`}>
            <span>{status.dot}</span>
            <span>{status.label}</span>
          </span>
          {canGenerateNotice && onGenerateNotice ? <button type="button" className="btn accent monitor-notice-btn" onClick={() => onGenerateNotice(selected)}>Gerar aviso</button> : null}
          {onClose ? <button type="button" className="btn monitor-close-btn" onClick={onClose}>Fechar</button> : null}
        </div>
      </div>

      <div className="monitor-detail-stats-v2">
        <MetricCard label="Caixas OK" value={`${selected.up_count}/${selected.total_count}`} />
        <MetricCard label="Falhas" value={selected.down_count} tone={selected.down_count > 0 ? "is-warn" : ""} />
        <MetricCard label="Backup" value={<span className={`badge mini ${backup.className}`}>{backup.label}</span>} />
        <MetricCard label="Certificado" value={<span className={`badge mini ${cert.className}`}>{cert.label}</span>} />
      </div>

      <section className="monitor-primary-card monitor-primary-card--tablefirst">
        <div className="monitor-section-head monitor-section-head--tight">
          <div className="h2">Caixas / IPs</div>
          <div className="small">{detailLoading ? "Atualizando detalhes..." : `${selected.items?.length || 0} item(ns)`}</div>
        </div>

        {selected.items?.length ? (
          isMobile ? (
            <div className="monitor-mobile-items">
              {selected.items.map((item, idx) => (
                <div className="monitor-mobile-item-card" key={`${item.ip}-${idx}`}>
                  <div className="monitor-mobile-item-card__top">
                    <span className={`badge mini ${item.ok ? "ok" : "danger"}`}>{item.ok ? "OK" : "FAIL"}</span>
                    <div className="monitor-mobile-item-card__title">{item.name}</div>
                  </div>
                  <div className="monitor-mobile-item-card__meta">
                    <div><span>IP</span><b>{item.ip}</b></div>
                    <div><span>Detalhe</span><b>{item.detail || "—"}</b></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="monitor-table-wrap monitor-table-wrap--primary">
              <table className="table monitor-table monitor-table--tight">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Caixa</th>
                    <th>IP</th>
                    <th>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item, idx) => (
                    <tr key={`${item.ip}-${idx}`}>
                      <td><span className={`badge mini ${item.ok ? "ok" : "danger"}`}>{item.ok ? "OK" : "FAIL"}</span></td>
                      <td>{item.name}</td>
                      <td className="monitor-table__mono">{item.ip}</td>
                      <td className="wrap-anywhere">{item.detail || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="small">O agente ainda não enviou a lista detalhada dos caixas.</div>
        )}
      </section>

      {!isMobile ? (
        <div className="monitor-detail-stack-v3">
          <DesktopConnectivitySummary selected={selected} />

          <div className="monitor-detail-secondary-grid">
            <SectionToggle
              title="Backup"
              subtitle={selected.backup_message || selected.backup_summary || "Sem detalhes enviados."}
              badge={<span className={`badge mini ${backup.className}`}>{backup.label}</span>}
              defaultOpen={isBackupAlert(selected.backup_status)}
            >
              <KeyValueList
                items={[
                  { label: "Último evento", value: fmtDateTime(selected.backup_last_event_at) },
                  { label: "Última leitura", value: fmtDateTime(selected.backup_last_seen_at) },
                  { label: "Tarefa", value: selected.backup_task_name || "—" },
                  { label: "Origem", value: selected.backup_source_name || "—" },
                ]}
              />
            </SectionToggle>

            <SectionToggle
              title="Certificado digital"
              subtitle={selected.certificate_message || selected.certificate_summary || "Sem detalhes enviados."}
              badge={<span className={`badge mini ${cert.className}`}>{cert.label}</span>}
              defaultOpen={isCertificateAlert(selected.certificate_status)}
            >
              <KeyValueList
                items={[
                  { label: "Vencimento", value: fmtDateTime(selected.certificate_expires_at) },
                  { label: "Dias restantes", value: fmtDays(selected.certificate_days_left) },
                  { label: "Janela de alerta", value: selected.certificate_alert_days != null ? `${selected.certificate_alert_days} dia(s)` : "—" },
                  { label: "Última leitura", value: fmtDateTime(selected.certificate_last_seen_at) },
                ]}
              />
            </SectionToggle>
          </div>
        </div>
      ) : (
        <>
          <SectionToggle title="Conectividade" subtitle={selected.summary || `${selected.up_count}/${selected.total_count} caixas OK`} defaultOpen>
            <div className="monitor-overview-grid monitor-overview-grid--mobile-stack">
              <MetricCard label="Resumo" value={selected.summary || "Sem resumo enviado."} />
              <MetricCard label="Última checagem" value={fmtDateTime(selected.last_check_at)} />
              <MetricCard label="Atualização recebida" value={fmtDateTime(selected.last_seen_at)} />
              <MetricCard label="Métodos" value={selected.methods || "—"} />
            </div>
          </SectionToggle>

          <SectionToggle title="Backup" subtitle={selected.backup_message || selected.backup_summary || "Sem detalhes enviados."} badge={<span className={`badge mini ${backup.className}`}>{backup.label}</span>} defaultOpen={isBackupAlert(selected.backup_status)}>
            <div className="monitor-info-grid monitor-info-grid--mobile-stack">
              <MetricCard label="Último evento" value={fmtDateTime(selected.backup_last_event_at)} />
              <MetricCard label="Última leitura" value={fmtDateTime(selected.backup_last_seen_at)} />
              <MetricCard label="Tarefa" value={selected.backup_task_name || "—"} />
              <MetricCard label="Origem" value={selected.backup_source_name || "—"} />
            </div>
          </SectionToggle>

          <SectionToggle title="Certificado digital" subtitle={selected.certificate_message || selected.certificate_summary || "Sem detalhes enviados."} badge={<span className={`badge mini ${cert.className}`}>{cert.label}</span>} defaultOpen={isCertificateAlert(selected.certificate_status)}>
            <div className="monitor-info-grid monitor-info-grid--mobile-stack">
              <MetricCard label="Vencimento" value={fmtDateTime(selected.certificate_expires_at)} />
              <MetricCard label="Dias restantes" value={fmtDays(selected.certificate_days_left)} />
              <MetricCard label="Janela de alerta" value={selected.certificate_alert_days != null ? `${selected.certificate_alert_days} dia(s)` : "—"} />
              <MetricCard label="Última leitura" value={fmtDateTime(selected.certificate_last_seen_at)} />
            </div>
          </SectionToggle>
        </>
      )}

      <SectionToggle title="Certificados monitorados" subtitle={`${certificateCount} certificado(s)`} defaultOpen={false}>
        {selected.certificate_items?.length ? (
          isMobile ? (
            <div className="monitor-mobile-items">
              {selected.certificate_items.map((item, idx) => {
                const itemMeta = certificateMeta(item.status);
                return (
                  <div className="monitor-mobile-item-card" key={`${item.thumbprint || item.cn}-${idx}`}>
                    <div className="monitor-mobile-item-card__top">
                      <span className={`badge mini ${itemMeta.className}`}>{itemMeta.label}</span>
                      <CertificateCell cn={item.cn} />
                    </div>
                    <div className="monitor-mobile-item-card__meta">
                      <div><span>Vencimento</span><b>{fmtDateTime(item.expires_at)}</b></div>
                      <div><span>Dias</span><b>{fmtDays(item.days_left)}</b></div>
                      <div><span>Store</span><b>{item.store || "—"}</b></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="monitor-table-wrap">
              <table className="table monitor-table monitor-table--tight">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>CN</th>
                    <th>Vencimento</th>
                    <th>Dias</th>
                    <th>Store</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.certificate_items.map((item, idx) => {
                    const itemMeta = certificateMeta(item.status);
                    return (
                      <tr key={`${item.thumbprint || item.cn}-${idx}`}>
                        <td><span className={`badge mini ${itemMeta.className}`}>{itemMeta.label}</span></td>
                        <td><CertificateCell cn={item.cn} /></td>
                        <td>{fmtDateTime(item.expires_at)}</td>
                        <td>{fmtDays(item.days_left)}</td>
                        <td>{item.store || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="small">Nenhum certificado detalhado foi enviado pelo agente.</div>
        )}
      </SectionToggle>
    </>
  );
}

function NoticeModal({
  open,
  store,
  selection,
  onToggle,
  message,
  onChangeMessage,
  onClose,
  onCopy,
}: {
  open: boolean;
  store: ExtendedMonitoringStore | null;
  selection: NoticeSelection;
  onToggle: (key: MonitoringNoticeOption) => void;
  message: string;
  onChangeMessage: (value: string) => void;
  onClose: () => void;
  onCopy: () => void;
}) {
  if (!open || !store) return null;
  const selectedCount = Object.values(selection).filter(Boolean).length;

  return (
    <div className="monitor-notice-modal" role="dialog" aria-modal="true">
      <div className="monitor-notice-modal__backdrop" onClick={onClose} />
      <div className="monitor-notice-modal__panel card">
        <div className="monitor-notice-modal__head">
          <div>
            <div className="h2" style={{ marginBottom: 6 }}>Gerar aviso</div>
            <div className="small">Escolha os pontos que devem entrar na mensagem.</div>
          </div>
          <button type="button" className="btn" onClick={onClose}>Fechar</button>
        </div>

        <div className="monitor-notice-modal__store">
          <div><span>Cliente</span><strong>{getNoticeStoreLabel(store)}</strong></div>
          <div><span>CNPJ</span><strong>{store.cnpj || "—"}</strong></div>
        </div>

        <div className="monitor-notice-modal__options">
          <label className={`monitor-notice-check ${selection.boxes ? "is-on" : ""}`}>
            <input type="checkbox" checked={selection.boxes} onChange={() => onToggle("boxes")} />
            <span>Comunicação dos caixas</span>
          </label>
          <label className={`monitor-notice-check ${selection.backup ? "is-on" : ""}`}>
            <input type="checkbox" checked={selection.backup} onChange={() => onToggle("backup")} />
            <span>Backup</span>
          </label>
          <label className={`monitor-notice-check ${selection.certificate ? "is-on" : ""}`}>
            <input type="checkbox" checked={selection.certificate} onChange={() => onToggle("certificate")} />
            <span>Certificado</span>
          </label>
        </div>

        <div className="monitor-notice-modal__editor">
          <label>Mensagem gerada</label>
          <textarea
            className="input monitor-notice-modal__textarea"
            value={message}
            onChange={(e) => onChangeMessage(e.target.value)}
            rows={selectedCount > 1 ? 12 : 9}
          />
        </div>

        <div className="monitor-notice-modal__actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" onClick={onCopy} disabled={!message.trim()}>
            Copiar mensagem
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const { role } = useAuth();
  const { show, Toast } = useToast();
  const location = useLocation();
  const initialParamsRef = React.useRef(new URLSearchParams(location.search));
  const deepLinkStoreIdRef = React.useRef(initialParamsRef.current.get("store") || "");
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [items, setItems] = React.useState<ExtendedMonitoringStore[]>([]);
  const [selectedId, setSelectedId] = React.useState(() => deepLinkStoreIdRef.current);
  const [selected, setSelected] = React.useState<ExtendedMonitoringStore | null>(null);
  const [q, setQ] = React.useState(() => initialParamsRef.current.get("q") || "");
  const [status, setStatus] = React.useState<MonitoringStatus | "">("");
  const [networkId, setNetworkId] = React.useState("");
  const [lastRefreshAt, setLastRefreshAt] = React.useState<Date | null>(null);
  const [networks, setNetworks] = React.useState<Array<{ id: string; name: string }>>([]);
  const [mobileDetailOpen, setMobileDetailOpen] = React.useState(false);
  const [onlyConfigured, setOnlyConfigured] = React.useState(true);
  const [noticeModalOpen, setNoticeModalOpen] = React.useState(false);
  const [noticeSelection, setNoticeSelection] = React.useState<NoticeSelection>({ boxes: true, backup: false, certificate: false });
  const [noticeMessage, setNoticeMessage] = React.useState("");
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyItems, setHistoryItems] = React.useState<MonitoringEvent[]>([]);
  const [historySummary, setHistorySummary] = React.useState<any>(null);
  const [historyDays, setHistoryDays] = React.useState(30);
  const [historyCategory, setHistoryCategory] = React.useState("");
  const [historyScope, setHistoryScope] = React.useState<"all" | "selected">("all");
  const [monitorView, setMonitorView] = React.useState<"status" | "history">("status");
  const isMobile = useIsMobile(960);

  const load = React.useCallback(async (preserveSelection = true, overrides?: { q?: string; status?: MonitoringStatus | ""; networkId?: string }) => {
    setLoading(true);
    try {
      const qValue = overrides?.q !== undefined ? overrides.q : q;
      const statusValue = overrides?.status !== undefined ? overrides.status : status;
      const networkValue = overrides?.networkId !== undefined ? overrides.networkId : networkId;

      const [overview, networksResp] = await Promise.all([
        listMonitoringOverview({ q: qValue.trim() || undefined, status: statusValue, network_id: networkValue || undefined }),
        listNetworks().catch(() => [] as Array<{ id: string; name: string }>),
      ]);

      const list = ((overview?.items || []) as ExtendedMonitoringStore[]);
      setItems(list);
      setLastRefreshAt(new Date());
      setNetworks(networksResp || []);

      const deepLinkStoreId = deepLinkStoreIdRef.current;
      const currentSelectedId = deepLinkStoreId || (preserveSelection ? selectedId : "");
      const fallbackId = currentSelectedId && list.some((x) => x.store_id === currentSelectedId) ? currentSelectedId : list[0]?.store_id || "";
      setSelectedId(fallbackId);
      if (deepLinkStoreId) deepLinkStoreIdRef.current = "";
    } catch (err: any) {
      show(err?.message || "Erro ao carregar monitoramento", "error");
    } finally {
      setLoading(false);
    }
  }, [networkId, q, selectedId, show, status]);



  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await listMonitoringHistory({
        days: historyDays,
        category: historyCategory || undefined,
        store_id: historyScope === "selected" && selectedId ? selectedId : undefined,
        limit: 120,
      });
      setHistoryItems(response?.items || []);
      setHistorySummary(response?.summary || null);
    } catch (err: any) {
      show(err?.message || "Erro ao carregar histórico de monitoramento", "error");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyCategory, historyDays, historyScope, selectedId, show]);

  React.useEffect(() => { load(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const t = window.setInterval(() => { load(true); }, 60000);
    return () => window.clearInterval(t);
  }, [load]);

  React.useEffect(() => {
    if (!selectedId) { setSelected(null); return; }
    let alive = true;
    setDetailLoading(true);
    getMonitoringStore(selectedId)
      .then((data) => { if (alive) setSelected(data as ExtendedMonitoringStore); })
      .catch((err: any) => { if (alive) show(err?.message || "Erro ao carregar detalhes da loja", "error"); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [lastRefreshAt, selectedId, show]);

  React.useEffect(() => { loadHistory(); }, [loadHistory]);

  const filteredItems = React.useMemo(() => items.filter((item: any) => item?.active !== false && (!onlyConfigured || item?.configured)), [items, onlyConfigured]);

  const counts = React.useMemo(() => {
    const base = { ONLINE: 0, PARCIAL: 0, OFFLINE: 0, STALE: 0, SEM_DADOS: 0 } as Record<MonitoringStatus, number>;
    for (const item of filteredItems) base[item.status] += 1;
    return base;
  }, [filteredItems]);

  const backupAlertCount = React.useMemo(() => filteredItems.filter((item) => isBackupAlert(item.backup_status)).length, [filteredItems]);
  const certificateAlertCount = React.useMemo(() => filteredItems.filter((item) => isCertificateAlert(item.certificate_status)).length, [filteredItems]);

  React.useEffect(() => {
    if (!selectedId) return;
    if (!filteredItems.some((x) => x.store_id === selectedId)) {
      const nextId = filteredItems[0]?.store_id || "";
      setSelectedId(nextId);
      if (!nextId) {
        setSelected(null);
        setMobileDetailOpen(false);
      }
    }
  }, [filteredItems, selectedId]);

  const networkOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const net of networks) if (net?.id) map.set(String(net.id), String(net.name || "Sem nome"));
    for (const item of items) if (item.network_id && item.network_name) map.set(String(item.network_id), String(item.network_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, networks]);

  const openNoticeModal = (store: ExtendedMonitoringStore) => {
    const defaults = getDefaultNoticeSelection(store);
    setNoticeSelection(defaults);
    setNoticeMessage(buildMonitoringNotice(store, defaults));
    setNoticeModalOpen(true);
  };

  const toggleNoticeOption = (key: MonitoringNoticeOption) => {
    setNoticeSelection((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (selected) setNoticeMessage(buildMonitoringNotice(selected, next));
      return next;
    });
  };

  const handleCopyNotice = async () => {
    try {
      await navigator.clipboard.writeText(noticeMessage);
      show("Mensagem copiada.", "success");
    } catch {
      show("Não foi possível copiar a mensagem.", "error");
    }
  };

  const openDetails = (storeId: string) => {
    setSelectedId(storeId);
    if (isMobile) setMobileDetailOpen(true);
  };

  React.useEffect(() => {
    if (!noticeModalOpen || !selected) return;
    setNoticeMessage(buildMonitoringNotice(selected, noticeSelection));
  }, [noticeModalOpen, noticeSelection, selected]);

  const selectedHistoryLabel = selected?.store_name || filteredItems.find((item) => item.store_id === selectedId)?.store_name || "loja selecionada";
  const handleHistoryExport = () => exportMonitoringHistoryCsv(historyItems);

  return (
    <>
      <div className="monitor-shell">
        <section className="monitor-hero card">
          <div className="monitor-hero__head">
            <div>
              <div className="h1">Monitoramento</div>
              <div className="monitor-hero__sub">Status das lojas, conectividade, backups e certificados.</div>
            </div>
            <div className="monitor-hero__actions">
              <span className="badge accentB">Tela atualizada: {lastRefreshAt ? lastRefreshAt.toLocaleTimeString("pt-BR") : "—"}</span>
              <button className="btn primary" onClick={() => load(true)} disabled={loading}>{loading ? "Atualizando..." : "Atualizar agora"}</button>
            </div>
          </div>

          <div className="monitor-tiles monitor-tiles--five">
            <OverviewTile title="Lojas online" value={String(counts.ONLINE)} hint="Operação normal." tone="monitor-online" />
            <OverviewTile title="Em alerta" value={String(counts.PARCIAL + counts.OFFLINE)} hint="Parcial ou offline." tone="monitor-partial" />
            <OverviewTile title="Sem atualização" value={String(counts.STALE + counts.SEM_DADOS)} hint="Sem registro recente." tone="monitor-empty" />
            <OverviewTile title="Backup em alerta" value={String(backupAlertCount)} hint="Sem logs, erro ou pendência." tone="monitor-offline" />
            <OverviewTile title="Certificados em alerta" value={String(certificateAlertCount)} hint="Vencidos ou em alerta." tone="monitor-partial" />
          </div>
        </section>

        <section className="monitor-view-tabs card" aria-label="Alternar visão do monitoramento">
          <button
            type="button"
            className={`monitor-view-tab ${monitorView === "status" ? "is-active" : ""}`}
            onClick={() => setMonitorView("status")}
          >
            <span>Status atual</span>
            <small>Lojas, caixas, backup e certificados</small>
          </button>
          <button
            type="button"
            className={`monitor-view-tab ${monitorView === "history" ? "is-active" : ""}`}
            onClick={() => { setMonitorView("history"); loadHistory(); }}
          >
            <span>Histórico</span>
            <small>Quedas, recuperações e mudanças de status</small>
          </button>
        </section>

        {monitorView === "status" ? (
          <>
        <section className="monitor-filter card">
          <div className="monitor-filter__grid">
            <div>
              <label>Buscar loja</label>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CNPJ ou rede" />
            </div>
            <div>
              <label>Status</label>
              <FancySelect
                value={status}
                onChange={(value) => setStatus(value as MonitoringStatus | "")}
                className="monitor-fancy-select"
                placeholder="Todos"
                options={STATUS_OPTIONS.map((opt) => ({ value: String(opt.value || ""), label: opt.label }))}
              />
            </div>
            <div>
              <label>Rede</label>
              <FancySelect
                value={networkId}
                onChange={setNetworkId}
                className="monitor-fancy-select"
                placeholder="Todas"
                options={networkOptions.map((opt) => ({ value: opt.id, label: opt.name }))}
              />
            </div>
          </div>

          <div className="monitor-toggle-row">
            <label className={`monitor-toggle ${onlyConfigured ? "is-on" : ""}`}>
              <input type="checkbox" checked={onlyConfigured} onChange={(e) => setOnlyConfigured(e.target.checked)} />
              <span className="monitor-toggle__track"><span className="monitor-toggle__thumb" /></span>
              <span className="monitor-toggle__label">Mostrar somente lojas configuradas</span>
            </label>
            <div className="small">Exibindo apenas lojas configuradas.</div>
          </div>

          <div className="actions" style={{ marginTop: 12, justifyContent: "flex-start" }}>
            <button className="btn accent" onClick={() => load(false)} disabled={loading}>Aplicar filtros</button>
            <button
              className="btn"
              onClick={() => {
                setQ("");
                setStatus("");
                setNetworkId("");
                setOnlyConfigured(true);
                setSelectedId("");
                setSelected(null);
                setMobileDetailOpen(false);
                load(false, { q: "", status: "", networkId: "" });
              }}
              disabled={loading}
            >
              Limpar
            </button>
          </div>
        </section>

        <div className="grid monitor-layout-grid">
          <div className="col-5 monitor-list-col">
            <section className="card monitor-list-panel">
              <div className="monitor-section-head">
                <div className="h2">Lojas</div>
                <div className="small">{filteredItems.length} resultado(s)</div>
              </div>

              <div className="monitor-store-list">
                {filteredItems.map((item) => (
                  <StoreCard key={item.store_id} item={item} active={selectedId === item.store_id} onClick={() => openDetails(item.store_id)} />
                ))}
                {!loading && !filteredItems.length ? <div className="small">Nenhuma loja encontrada com os filtros atuais.</div> : null}
              </div>
            </section>
          </div>

          <div className="col-7 monitor-detail-col monitor-desktop-detail">
            <section className="card monitor-detail-panel">
              <DetailPanel selected={selected} detailLoading={detailLoading} isMobile={false} canGenerateNotice={role === "ADMIN"} onGenerateNotice={openNoticeModal} />
            </section>
          </div>
        </div>

          </>
        ) : (
          <MonitoringHistoryPanel
            events={historyItems}
            summary={historySummary}
            loading={historyLoading}
            days={historyDays}
            category={historyCategory}
            scope={historyScope}
            selectedLabel={selectedHistoryLabel}
            hasSelected={!!selectedId}
            onDaysChange={setHistoryDays}
            onCategoryChange={setHistoryCategory}
            onScopeChange={setHistoryScope}
            onReload={loadHistory}
            onExport={handleHistoryExport}
          />
        )}
      </div>

      <div className={`monitor-mobile-sheet ${mobileDetailOpen ? "is-open" : ""}`} aria-hidden={!mobileDetailOpen}>
        <div className="monitor-mobile-sheet__backdrop" onClick={() => setMobileDetailOpen(false)} />
        <div className="monitor-mobile-sheet__panel card">
          <DetailPanel selected={selected} detailLoading={detailLoading} onClose={() => setMobileDetailOpen(false)} isMobile={isMobile} canGenerateNotice={role === "ADMIN"} onGenerateNotice={openNoticeModal} />
        </div>
      </div>
      <NoticeModal
        open={noticeModalOpen}
        store={selected}
        selection={noticeSelection}
        onToggle={toggleNoticeOption}
        message={noticeMessage}
        onChangeMessage={setNoticeMessage}
        onClose={() => setNoticeModalOpen(false)}
        onCopy={handleCopyNotice}
      />
      <Toast />
    </>
  );
}
