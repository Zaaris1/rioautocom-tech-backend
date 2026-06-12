import React from "react";
import { useParams } from "react-router-dom";
import {
  assignTicket,
  closeTicket,
  closeTicketWithAttachments,
  commentTicket,
  editTicket,
  editTicketClosure,
  getTicket,
  pendTicket,
  reopenTicket,
  startTicket,
  Ticket,
  TicketPriority,
  TicketType,
  TicketUpdate,
  TicketAttachment,
  adminListStores,
  listStores,
  listNetworks,
} from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";
import FancySelect from "../components/FancySelect";

type StoreItem = {
  id: string;
  name: string;
  cnpj?: string;
  active?: boolean;
  network_id?: string;
  network_name?: string;
  rede_id?: string;
  rede_name?: string;
};

function safeStr(v: any) {
  return (v == null ? "" : String(v)).trim();
}

function getNetworkNameFromTicket(t: any): string {
  return t?.store_network_name ?? t?.network_name ?? t?.rede_name ?? t?.chain_name ?? t?.group_name ?? "";
}

function getStoreNameFromTicket(t: any): string {
  return t?.store_name ?? t?.store?.name ?? t?.storeName ?? "";
}

function getNetworkNameFromStore(s?: StoreItem | null): string {
  return (s?.network_name ?? s?.rede_name ?? "") || "";
}

function mapStoreItem(raw: any, networkNameById: Map<string, string>): StoreItem {
  const network_id =
    raw?.network_id != null
      ? String(raw.network_id)
      : raw?.rede_id != null
      ? String(raw.rede_id)
      : raw?.network?.id != null
      ? String(raw.network.id)
      : raw?.rede?.id != null
      ? String(raw.rede.id)
      : undefined;

  const network_name_raw =
    raw?.network_name != null
      ? String(raw.network_name)
      : raw?.rede_name != null
      ? String(raw.rede_name)
      : raw?.network?.name != null
      ? String(raw.network.name)
      : raw?.rede?.name != null
      ? String(raw.rede.name)
      : undefined;

  const network_name =
    (network_name_raw && network_name_raw.trim()) ||
    (network_id && networkNameById.get(network_id)) ||
    undefined;

  return {
    id: String(raw?.id),
    name: String(raw?.name ?? raw?.store_name ?? ""),
    cnpj: raw?.cnpj ? String(raw.cnpj) : undefined,
    active: raw?.active === false ? false : true,
    network_id,
    network_name,
    rede_id: raw?.rede_id != null ? String(raw.rede_id) : undefined,
    rede_name: raw?.rede_name != null ? String(raw.rede_name) : undefined,
  };
}

function resolveStoreDisplayFromTicket(t: any, storeById: Map<string, StoreItem>): string {
  const ticketNet = safeStr(getNetworkNameFromTicket(t));
  const ticketStore = safeStr(getStoreNameFromTicket(t));
  const storeId = String(t?.store_id ?? "");
  const store = storeById.get(storeId);

  const fallbackNet = ticketNet || getNetworkNameFromStore(store);
  const fallbackStore = ticketStore || safeStr(store?.name) || storeId;

  if (fallbackNet && fallbackStore) return `${fallbackNet} - ${fallbackStore}`;
  return fallbackStore || fallbackNet || "—";
}

function isDone(status?: string): boolean {
  return status === "CONCLUIDO";
}

function formatPTBR(dt?: string | null) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("pt-BR");
  } catch {
    return String(dt);
  }
}

function formatFileSize(size?: number | null) {
  const n = Number(size || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function attachmentIcon(mime?: string | null) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("video/")) return "🎥";
  if (m.startsWith("image/")) return "🖼️";
  return "📎";
}

function AttachmentsPanel({ title, attachments }: { title: string; attachments: TicketAttachment[] }) {
  return (
    <div className="ticket-detail-block">
      <div className="h2">{title}</div>
      {attachments.length === 0 ? (
        <div className="small">Nenhum anexo registrado.</div>
      ) : (
        <div className="ticket-attachment-grid">
          {attachments.map((a) => {
            const href = a.drive_view_link || a.drive_download_link || "";
            return (
              <a
                className="ticket-attachment-card"
                href={href || undefined}
                target="_blank"
                rel="noreferrer"
                key={a.id}
                title={a.original_filename}
              >
                <div className="ticket-attachment-card__icon">{attachmentIcon(a.mime_type)}</div>
                <div className="ticket-attachment-card__body">
                  <div className="ticket-attachment-card__name wrap-anywhere">{a.original_filename}</div>
                  <div className="small">{formatFileSize(a.size_bytes)} • {a.mime_type}</div>
                </div>
                <div className="ticket-attachment-card__open">Abrir</div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function shortId(v: string) {
  const s = String(v || "");
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function looksLikeUuid(s: string) {
  const v = String(s || "").trim();
  if (!v) return false;
  return v.length >= 18 && v.includes("-") && /^[0-9a-fA-F-]+$/.test(v.replace(/-/g, ""));
}

function looksLikeIdish(s: string) {
  const v = String(s || "").trim();
  if (!v) return false;
  if (v.includes("…")) return true;
  if (looksLikeUuid(v)) return true;
  if (/^[0-9]{6,}$/.test(v)) return true;
  return false;
}

function safeJsonParse(input: any): any | null {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function getUpdatePayload(u: any): any | null {
  return safeJsonParse(u?.payload_json ?? u?.payloadJson ?? u?.payload);
}

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function resolvePersonLabel(obj: any): string {
  const payload = getUpdatePayload(obj);

  const candidates = [
    obj?.actor_name,
    obj?.actor_username,
    obj?.created_by_username,
    obj?.created_by_name,
    obj?.user_name,
    obj?.username,
    obj?.author_name,
    obj?.author_username,
    obj?.performed_by_name,
    obj?.performed_by_username,

    obj?.actor?.name,
    obj?.actor?.username,
    obj?.user?.name,
    obj?.user?.username,
    obj?.created_by?.name,
    obj?.created_by?.username,
    obj?.createdBy?.name,
    obj?.createdBy?.username,

    obj?.assigned_to_name,
    obj?.assigned_to_username,
    obj?.assigned_to,
    obj?.assigned_tech_name,
    obj?.assigned_tech_username,

    payload?.actor_name,
    payload?.actor_username,
    payload?.created_by_username,
    payload?.created_by_name,
    payload?.user_name,
    payload?.username,
    payload?.author_name,
    payload?.author_username,
    payload?.performed_by_name,
    payload?.performed_by_username,

    payload?.actor?.name,
    payload?.actor?.username,
    payload?.user?.name,
    payload?.user?.username,
    payload?.created_by?.name,
    payload?.created_by?.username,

    payload?.assigned_to_name,
    payload?.assigned_to_username,
    payload?.assigned_tech_name,
    payload?.assigned_tech_username,
  ]
    .map((x: any) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);

  if (!candidates.length) return "—";

  const first = candidates[0];
  if (looksLikeUuid(first)) return shortId(first);

  return first;
}

function resolveAssignedFromUpdates(updates: any[]): string | null {
  if (!Array.isArray(updates) || updates.length === 0) return null;

  const assigns = updates
    .filter((u) => (u?.event_type || u?.action || u?.type) === "ASSIGN")
    .slice()
    .sort((a, b) => {
      const da = String(a?.created_at || a?.createdAt || "");
      const db = String(b?.created_at || b?.createdAt || "");
      if (da < db) return -1;
      if (da > db) return 1;
      return 0;
    });

  const last = assigns[assigns.length - 1];
  const payload = getUpdatePayload(last);
  const username = payload?.username;

  return isNonEmptyString(username) ? username.trim() : null;
}

function resolveUpdateActorLabel(u: any, ticket: any, derivedAssignedName: string | null): string {
  const direct = resolvePersonLabel(u);
  if (direct && direct !== "—" && !looksLikeIdish(direct)) return direct;

  const createdById = String(u?.created_by_user_id || u?.created_by_id || u?.actor_id || "").trim();
  const assignedTechId = String(ticket?.assigned_tech_id || "").trim();

  if (createdById && assignedTechId && createdById === assignedTechId && derivedAssignedName) {
    return derivedAssignedName;
  }

  const payload = getUpdatePayload(u);
  if (isNonEmptyString(payload?.username)) return payload.username.trim();

  return "—";
}

function normalizeKind(u: any): string {
  return String(u?.event_type || u?.action || u?.type || "UPDATE").toUpperCase();
}

function prettyStatus(s: any) {
  const v = String(s || "").toUpperCase();
  if (v === "ABERTO") return "Aberto";
  if (v === "ATRIBUIDO") return "Atribuído";
  if (v === "EM_ATENDIMENTO") return "Em atendimento";
  if (v === "PENDENTE") return "Pendente";
  if (v === "CONCLUIDO") return "Concluído";
  return v || "—";
}

function prettyPriority(p: any) {
  return String(p || "").toUpperCase() === "URGENTE" ? "Urgente" : "Normal";
}

function prettyType(t: any) {
  const v = String(t || "").toUpperCase();
  if (v === "MANUTENCAO") return "Manutenção";
  if (v === "SUPORTE") return "Suporte";
  if (v === "VISITA") return "Visita";
  if (v === "REPARO") return "Reparo";
  if (v === "INSTALACAO") return "Instalação";
  if (v === "SERVICO") return "Serviço";
  if (v === "VISITA_TECNICA") return "Visita técnica";
  return v || "—";
}

function prettyKind(kind: string) {
  const k = String(kind || "").toUpperCase();
  if (k === "CREATE") return "ABERTURA";
  if (k === "ASSIGN") return "ATRIBUIÇÃO";
  if (k === "START") return "INÍCIO";
  if (k === "PEND") return "PENDÊNCIA";
  if (k === "COMMENT") return "COMENTÁRIO";
  if (k === "EDIT") return "EDIÇÃO";
  if (k === "CLOSE") return "CONCLUSÃO";
  if (k === "STATUS_CHANGE") return "STATUS";
  return k.replace(/_/g, " ");
}

function kindChipStyle(kind: string): React.CSSProperties {
  const k = String(kind || "").toUpperCase();

  if (k === "CREATE")
    return { background: "rgba(194,128,51,0.15)", borderColor: "rgba(194,128,51,0.32)", fontWeight: 900 };
  if (k === "ASSIGN" || k === "START")
    return { background: "rgba(255,138,0,0.12)", borderColor: "rgba(255,138,0,0.28)", fontWeight: 900 };
  if (k === "COMMENT" || k === "EDIT")
    return { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)", fontWeight: 850 };
  if (k === "PEND")
    return { background: "rgba(241,196,15,0.10)", borderColor: "rgba(241,196,15,0.24)", fontWeight: 900 };
  if (k === "CLOSE")
    return { background: "rgba(46,204,113,0.10)", borderColor: "rgba(46,204,113,0.24)", fontWeight: 900 };
  if (k === "STATUS_CHANGE")
    return { background: "rgba(138,160,198,0.10)", borderColor: "rgba(138,160,198,0.20)", fontWeight: 850 };

  return { fontWeight: 850 };
}

function asTicketType(v: any): TicketType {
  return String(v || "REPARO") as TicketType;
}
function asTicketPriority(v: any): TicketPriority {
  return String(v || "NORMAL") as TicketPriority;
}

function formatDurationMs(ms: number) {
  const a = Math.abs(ms);
  const totalMin = Math.floor(a / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function getSlaState(ticket: any, nowMs: number) {
  if (!ticket || String(ticket?.status) === "CONCLUIDO") return null;
  const opened = parseDateMs(ticket?.opened_at) ?? parseDateMs(ticket?.created_at) ?? parseDateMs(ticket?.createdAt);
  const base = opened ?? parseDateMs(ticket?.updated_at);
  if (!base) return null;

  const urgent = String(ticket?.priority || "").toUpperCase() === "URGENTE";
  const maxHours = urgent ? 8 : 24;
  const due = base + maxHours * 60 * 60 * 1000;
  const remainingMs = due - nowMs;
  const overdue = remainingMs <= 0;

  return {
    overdue,
    remainingMs,
    maxHours,
    label: overdue ? `Vencido há ${formatDurationMs(remainingMs)}` : `Vence em ${formatDurationMs(remainingMs)}`,
  };
}

function slaBadgeDetail(ticket: any, nowMs: number) {
  const sla = getSlaState(ticket, nowMs);
  if (!sla) return null;

  const cls = sla.overdue ? "badge danger ticket-sla-badge" : Math.abs(sla.remainingMs) <= 60 * 60 * 1000 ? "badge warn ticket-sla-badge" : "badge ticket-sla-badge";
  return (
    <span className={cls} title={`Prazo ${String(ticket?.priority || "NORMAL").toUpperCase() === "URGENTE" ? "urgente" : "normal"}: ${sla.maxHours}h`}>
      <span className="i">{sla.overdue ? "⛔" : "⏳"}</span> {sla.label}
    </span>
  );
}

/* =========================
   CLIENT UI PREFS (LS)
========================= */
const LS_CLIENT_TIMELINE_IMPORTANT = "rioautocom_client_timeline_important_v1";

function getBoolLS(key: string, def: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return def;
    return raw === "1" || raw === "true";
  } catch {
    return def;
  }
}
function setBoolLS(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {}
}

/* =========================
   Timeline helpers
========================= */
type TimelineItem = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  body?: string;
  when?: string;
  who?: string;
  icon: string;
  important: boolean;
};

function buildTimelineItem(u: any, ticket: any, derivedAssignedName: string | null): TimelineItem {
  const kind = normalizeKind(u);
  const when = String(u?.created_at || u?.createdAt || "").trim();

  let who = resolveUpdateActorLabel(u, ticket, derivedAssignedName);
  if (!who || who === "—" || looksLikeIdish(who)) who = "Sistema";

  const payload = getUpdatePayload(u) || {};
  const note = String(u?.note || u?.message || "").trim();

  const base: TimelineItem = {
    id: String(u?.id ?? `${kind}_${when}_${Math.random()}`),
    kind,
    title: kind,
    subtitle: who ? `por ${who}` : undefined,
    body: note || "",
    when,
    icon: "📝",
    important: false,
  };

  if (kind === "CREATE") {
    return { ...base, icon: "🟦", title: "Chamado aberto", body: note || "Chamado criado", important: true };
  }
  if (kind === "EDIT") {
    return { ...base, icon: "✏️", title: "Atualização", body: note || "Chamado atualizado", important: true };
  }
  if (kind === "ASSIGN") {
    const tech = isNonEmptyString(payload?.username) ? payload.username.trim() : derivedAssignedName || "";
    return {
      ...base,
      icon: "🧑‍🔧",
      title: "Técnico designado",
      body: tech ? `Designado para: ${tech}` : note || "Técnico designado",
      important: true,
    };
  }
  if (kind === "COMMENT") {
    return { ...base, icon: "💬", title: "Mensagem", body: note || "Comentário", important: true };
  }
  if (kind === "CLOSE") {
    return { ...base, icon: "✅", title: "Chamado concluído", body: note || "Concluído com parecer", important: true };
  }
  if (kind === "STATUS_CHANGE") {
    const from = payload?.from_status ?? payload?.from ?? payload?.old_status ?? payload?.old ?? payload?.prev_status;
    const to = payload?.to_status ?? payload?.to ?? payload?.new_status ?? payload?.new ?? payload?.next_status;

    if (from || to) {
      return {
        ...base,
        icon: "🔁",
        title: "Status alterado",
        body: `${prettyStatus(from)} → ${prettyStatus(to)}`,
        important: true,
      };
    }
    return { ...base, icon: "🔁", title: "Status alterado", body: note || `Status: ${prettyStatus((ticket as any)?.status)}`, important: false };
  }
  if (kind === "PEND") {
    return { ...base, icon: "⏸️", title: "Pendência", body: note || "Chamado pendenciado", important: true };
  }
  if (kind === "START") {
    return { ...base, icon: "▶️", title: "Atendimento iniciado", body: note || "Atendimento iniciado", important: true };
  }

  return { ...base, icon: "📝", title: kind.replace(/_/g, " "), important: false };
}

function collapseConsecutiveDuplicates(items: TimelineItem[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && it.kind === "STATUS_CHANGE" && prev.kind === "STATUS_CHANGE") {
      const a = String(prev.body || "").trim();
      const b = String(it.body || "").trim();
      if (!b || a === b) continue;
    }
    out.push(it);
  }
  return out;
}

/* =========================
   RECENTE (4h)
========================= */
function parseDateMs(v?: any): number | null {
  if (!v) return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function isRecentTicket(ticket: any, hours = 4): boolean {
  if (!ticket) return false;
  if (String(ticket?.status) === "CONCLUIDO") return false;

  const opened =
    parseDateMs(ticket?.opened_at) ??
    parseDateMs(ticket?.created_at) ??
    parseDateMs(ticket?.createdAt);

  if (!opened) return false;

  const limit = hours * 60 * 60 * 1000;
  return Date.now() - opened <= limit;
}

function badgeStatus(s: string, recent?: boolean) {
  if (s === "CONCLUIDO") return <span className="badge ok">Concluído</span>;
  if (s === "PENDENTE") return <span className="badge warn">Pendente</span>;
  if (s === "EM_ATENDIMENTO") return <span className="badge accentB">Em atendimento</span>;
  if (s === "ATRIBUIDO") return <span className="badge">Atribuído</span>;

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span className="badge accent" style={{ fontWeight: 900 }}>
        Aberto
      </span>
      {recent ? (
        <span
          className="badge"
          style={{
            fontWeight: 900,
            borderColor: "rgba(255,138,0,0.35)",
            background: "rgba(255,138,0,0.12)",
          }}
          title="Aberto recentemente"
        >
          Recente
        </span>
      ) : null}
    </span>
  );
}

function resolveWhoNice(kind: string, rawWho: string, ticket: any, derivedAssignedName: string | null) {
  const k = String(kind || "").toUpperCase();
  const who = String(rawWho || "").trim();

  const ticketCreator =
    (ticket as any)?.created_by_username ||
    (ticket as any)?.created_by_name ||
    (ticket as any)?.requester_name ||
    "";

  if (k === "CREATE" && isNonEmptyString(ticketCreator)) return ticketCreator.trim();

  if ((k === "ASSIGN" || k === "START" || k === "PEND" || k === "CLOSE" || k === "EDIT" || k === "COMMENT") && derivedAssignedName) {
    if (!who || who === "—" || looksLikeIdish(who)) return derivedAssignedName;
  }

  if (!who || who === "—" || looksLikeIdish(who)) return "Sistema";
  return who;
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const { role } = useAuth();
  const { show, Toast } = useToast();

  const isClient = role === "CLIENT";

  const [loading, setLoading] = React.useState(true);
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [updates, setUpdates] = React.useState<TicketUpdate[]>([]);
  const [attachments, setAttachments] = React.useState<TicketAttachment[]>([]);
  const [stores, setStores] = React.useState<StoreItem[]>([]);
  const [comment, setComment] = React.useState("");
  const [pendMsg, setPendMsg] = React.useState("");
  const [parecer, setParecer] = React.useState("");
  const [closeFiles, setCloseFiles] = React.useState<File[]>([]);
  const [actionLoading, setActionLoading] = React.useState<string>("");

  const [importantOnly, setImportantOnly] = React.useState<boolean>(() =>
    getBoolLS(LS_CLIENT_TIMELINE_IMPORTANT, true)
  );

  const [editClosureOpen, setEditClosureOpen] = React.useState(false);
  const [editClosureText, setEditClosureText] = React.useState("");
  const [savingClosure, setSavingClosure] = React.useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getTicket(id);
      setTicket(data.ticket);
      setUpdates(data.updates || []);
      setAttachments(data.attachments || []);
    } catch (err: any) {
      show(err?.message || "Erro ao carregar", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadStoresFallback = async () => {
    if (!role) return;

    try {
      const [storesList, networksList] = await Promise.all([
        role === "ADMIN" ? adminListStores() : listStores(),
        listNetworks(),
      ]);

      const networkNameById = new Map<string, string>();
      (networksList || []).forEach((n: any) => {
        const nid = n?.id != null ? String(n.id) : "";
        const name = safeStr(n?.name);
        if (nid && name) networkNameById.set(nid, name);
      });

      setStores((storesList || []).map((s: any) => mapStoreItem(s, networkNameById)));
    } catch {
      // fallback silencioso
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  React.useEffect(() => {
    if (!role) return;
    loadStoresFallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const storeById = React.useMemo(() => {
    const map = new Map<string, StoreItem>();
    for (const s of stores) {
      map.set(String(s.id), s);
    }
    return map;
  }, [stores]);

  const resolvedStoreDisplay = React.useMemo(() => {
    if (!ticket) return "—";
    return resolveStoreDisplayFromTicket(ticket as any, storeById);
  }, [ticket, storeById]);

  const currentStatus = String(ticket?.status || "ABERTO");
  const done = isDone(ticket?.status);
  const canTechActions = (role === "TECH" || role === "ADMIN") && !done;
  const isAssigned = !!ticket?.assigned_tech_id;
  const canAssignNow = canTechActions && currentStatus === "ABERTO" && !isAssigned;
  const canStartNow = canTechActions && (currentStatus === "ATRIBUIDO" || currentStatus === "PENDENTE");
  const canPendNow = canTechActions && currentStatus === "EM_ATENDIMENTO";
  const canCloseNow = canTechActions && ["ATRIBUIDO", "EM_ATENDIMENTO", "PENDENTE"].includes(currentStatus);

  const isAdmin = role === "ADMIN";
  const canEditClosure = (role === "TECH" || role === "ADMIN") && done && !isClient;
  const canReopen = isAdmin && done;

  const [editOpen, setEditOpen] = React.useState(false);
  const [editRequester, setEditRequester] = React.useState("");
  const [editLocal, setEditLocal] = React.useState("");
  const [editProblem, setEditProblem] = React.useState("");
  const [editPriority, setEditPriority] = React.useState<TicketPriority>("NORMAL");
  const [editType, setEditType] = React.useState<TicketType>("REPARO");
  const [savingEdit, setSavingEdit] = React.useState(false);

  const openEdit = () => {
    if (!ticket) return;
    setEditRequester(String(ticket.requester_name || ""));
    setEditLocal(String(ticket.local || ""));
    setEditProblem(String(ticket.problem || ""));
    setEditPriority(asTicketPriority(ticket.priority));
    setEditType(asTicketType(ticket.type));
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (savingEdit) return;
    setEditOpen(false);
  };

  const doSaveEdit = async () => {
    if (!id || !ticket) return;
    if (!isAdmin) return show("Apenas admin pode editar.", "error");

    const nextRequester = editRequester.trim();
    const nextLocal = editLocal.trim();
    const nextProblem = editProblem.trim();
    if (!nextRequester) return show("Solicitante é obrigatório.", "error");
    if (!nextLocal) return show("Local é obrigatório.", "error");
    if (!nextProblem) return show("Problema é obrigatório.", "error");

    const payload: any = {};
    if (nextRequester !== String(ticket.requester_name || "")) payload.requester_name = nextRequester;
    if (nextLocal !== String(ticket.local || "")) payload.local = nextLocal;
    if (nextProblem !== String(ticket.problem || "")) payload.problem = nextProblem;
    if (editPriority !== ticket.priority) payload.priority = editPriority;
    if (editType !== ticket.type) payload.type = editType;

    if (Object.keys(payload).length === 0) {
      show("Sem alterações para salvar.", "error");
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await editTicket(id, payload);
      setTicket(updated);
      setEditOpen(false);
      show("Chamado editado!", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao editar chamado", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const doAssign = async () => {
    if (!id || actionLoading) return;
    if (done) return show("Chamado já concluído.", "error");
    if (!canAssignNow) return show("Este chamado já foi assumido ou não está disponível para assumir.", "error");
    setActionLoading("assign");
    try {
      const updated = await assignTicket(id);
      setTicket(updated);
      show("Chamado assumido!", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao assumir chamado", "error");
    } finally {
      setActionLoading("");
    }
  };

  const doStart = async () => {
    if (!id || actionLoading) return;
    if (done) return show("Chamado já concluído.", "error");
    if (!canStartNow) return show("Este chamado ainda não está pronto para iniciar.", "error");
    setActionLoading("start");
    try {
      const updated = await startTicket(id);
      setTicket(updated);
      show("Atendimento iniciado!", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao iniciar atendimento", "error");
    } finally {
      setActionLoading("");
    }
  };

  const doPend = async () => {
    if (!id || actionLoading) return;
    if (done) return show("Chamado já concluído.", "error");
    if (!canPendNow) return show("Só é possível pendenciar um chamado em atendimento.", "error");
    if (!(pendMsg || "").trim()) return show("Informe o motivo da pendência.", "error");
    setActionLoading("pend");
    try {
      const updated = await pendTicket(id, (pendMsg || "").trim());
      setTicket(updated);
      setPendMsg("");
      show("Pendência registrada!", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao registrar pendência", "error");
    } finally {
      setActionLoading("");
    }
  };

  const doComment = async () => {
    if (!id || actionLoading) return;
    if (!comment.trim()) return show("Digite uma mensagem.", "error");
    setActionLoading("comment");
    try {
      await commentTicket(id, comment.trim());
      setComment("");
      show("Mensagem enviada!", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao enviar mensagem", "error");
    } finally {
      setActionLoading("");
    }
  };

  const doClose = async () => {
    if (!id || actionLoading) return;
    if (done) return show("Chamado já concluído.", "error");
    if (!canCloseNow) return show("Este chamado ainda não pode ser concluído.", "error");
    if (!parecer.trim()) return show("Parecer é obrigatório.", "error");
    setActionLoading("close");
    try {
      const updated = closeFiles.length > 0
        ? await closeTicketWithAttachments(id, parecer.trim(), closeFiles)
        : await closeTicket(id, parecer.trim());
      setTicket(updated);
      show("Chamado concluído!", "success");
      setParecer("");
      setCloseFiles([]);
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao concluir chamado", "error");
    } finally {
      setActionLoading("");
    }
  };

  const doReopen = async () => {
    if (!id || actionLoading) return;
    if (!canReopen) return show("Apenas admin pode reabrir chamado concluído.", "error");

    const ok = window.confirm(
      "Reabrir este chamado e devolver para a fila geral?\n\n" +
        "O status voltará para ABERTO, o técnico atribuído será removido e o chamado poderá ser fechado novamente."
    );
    if (!ok) return;

    setActionLoading("reopen");
    try {
      const updated = await reopenTicket(id, { delete_closing_attachments: false });
      setTicket(updated);
      show("Chamado reaberto e devolvido para a fila geral.", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao reabrir chamado", "error");
    } finally {
      setActionLoading("");
    }
  };

  const assignedFromBackend =
    (ticket as any)?.assigned_tech_username ||
    (ticket as any)?.assigned_tech_name ||
    (ticket as any)?.assigned_to_username ||
    (ticket as any)?.assigned_to_name ||
    (ticket as any)?.assigned_to ||
    null;

  const assignedFromUpdates = resolveAssignedFromUpdates(updates as any[]);
  const derivedAssignedName = isNonEmptyString(assignedFromBackend)
    ? assignedFromBackend.trim()
    : assignedFromUpdates;

  const assignedLabel =
    derivedAssignedName ||
    (ticket?.assigned_tech_id ? shortId(String((ticket as any).assigned_tech_id)) : "—");

  const resolutionText = (ticket as any)?.resolution_text || (ticket as any)?.resolutionText || "";
  const openingAttachments = React.useMemo(
    () => attachments.filter((a) => String(a.phase).toUpperCase() === "ABERTURA"),
    [attachments]
  );
  const closingAttachments = React.useMemo(
    () => attachments.filter((a) => String(a.phase).toUpperCase() === "FECHAMENTO"),
    [attachments]
  );
  const updatedAtLabel = ticket?.updated_at ? formatPTBR(ticket.updated_at) : "";
  const recent = ticket ? isRecentTicket(ticket as any, 4) : false;
  const [nowTick, setNowTick] = React.useState(0);
  React.useEffect(() => {
    const timer = window.setInterval(() => setNowTick((v) => v + 1), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  const nowMs = React.useMemo(() => Date.now(), [nowTick]);

  const openEditClosure = () => {
    setEditClosureText(String(resolutionText || "").trim());
    setEditClosureOpen(true);
  };
  const cancelEditClosure = () => {
    if (savingClosure) return;
    setEditClosureOpen(false);
  };
  const saveEditClosure = async () => {
    if (!id) return;
    const next = String(editClosureText || "").trim();
    if (next.length < 15) return show("Parecer deve ter pelo menos 15 caracteres.", "error");

    setSavingClosure(true);
    try {
      await editTicketClosure(id, next);
      show("Parecer atualizado!", "success");
      setEditClosureOpen(false);
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao atualizar parecer", "error");
    } finally {
      setSavingClosure(false);
    }
  };

  const updatesAsc = React.useMemo(() => {
    const arr = Array.isArray(updates) ? [...updates] : [];
    arr.sort((a: any, b: any) => {
      const da = String((a as any)?.created_at || (a as any)?.createdAt || "");
      const db = String((b as any)?.created_at || (b as any)?.createdAt || "");
      if (da < db) return -1;
      if (da > db) return 1;
      return 0;
    });
    return arr as any[];
  }, [updates]);

  const DETAIL_UPDATES_SOFT_LIMIT = 120;
  const recentUpdatesAsc = React.useMemo(() => {
    if (!Array.isArray(updatesAsc)) return [] as any[];
    return updatesAsc.slice(-DETAIL_UPDATES_SOFT_LIMIT);
  }, [updatesAsc]);

  const [showAllTimeline, setShowAllTimeline] = React.useState(false);
  const [showAllHistory, setShowAllHistory] = React.useState(false);

  const clientTimeline = React.useMemo(() => {
    if (!ticket) return [];
    let items = recentUpdatesAsc.map((u) => buildTimelineItem(u, ticket, derivedAssignedName));
    items = collapseConsecutiveDuplicates(items);
    if (importantOnly) items = items.filter((it) => it.important);
    return items;
  }, [recentUpdatesAsc, ticket, derivedAssignedName, importantOnly]);

  const visibleClientTimeline = React.useMemo(() => {
    if (showAllTimeline) return clientTimeline;
    return clientTimeline.slice(-12);
  }, [clientTimeline, showAllTimeline]);

  const visibleHistory = React.useMemo(() => {
    const base = recentUpdatesAsc.slice().reverse();
    if (showAllHistory) return base;
    return base.slice(0, 20);
  }, [recentUpdatesAsc, showAllHistory]);

  const setImportantOnlySafe = (v: boolean) => {
    setImportantOnly(v);
    setBoolLS(LS_CLIENT_TIMELINE_IMPORTANT, v);
  };

  const fieldShell: React.CSSProperties = {
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(135deg, rgba(194,128,51,0.08), rgba(0,0,0,0.16))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  };
  const fieldTopRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
    flexWrap: "wrap",
  };
  const fieldTitle: React.CSSProperties = { fontSize: 12, color: "rgba(138,160,198,0.95)", fontWeight: 900, letterSpacing: 0.2 };
  const fieldHint: React.CSSProperties = { fontSize: 12, color: "rgba(138,160,198,0.75)" };
  const fieldValue: React.CSSProperties = { fontWeight: 800, whiteSpace: "pre-wrap", lineHeight: 1.35 };

  return (
    <div className="grid">
      <div className="col-12 card">
        {loading || !ticket ? (
          <div className="small">Carregando...</div>
        ) : (
          <>
            {done && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(46,204,113,0.22)",
                  background: "linear-gradient(135deg, rgba(46,204,113,0.18), rgba(46,204,113,0.06))",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.4 }}>✅ Concluído</span>
                    <span className="badge ok" style={{ padding: "6px 10px", borderRadius: 999 }}>Finalizado</span>
                  </div>

                  {updatedAtLabel && (
                    <div className="small" style={{ opacity: 0.95 }}>
                      Atualizado em <b>{updatedAtLabel}</b>
                    </div>
                  )}
                </div>

                <div className="small" style={{ marginTop: 8, opacity: 0.92 }}>
                  Chamado finalizado. Ações de atendimento ficam bloqueadas, exceto edição do parecer.
                </div>
              </div>
            )}

            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 240 }}>
                <div className="h2" style={{ marginBottom: 2 }}>Chamado</div>
                <div className="small wrap-anywhere" style={{ opacity: 0.9 }}>{ticket.id}</div>
              </div>

              <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                <span style={{ transform: "scale(1.02)", transformOrigin: "right" }}>
                  {badgeStatus(ticket.status, recent)}
                </span>

                {slaBadgeDetail(ticket, nowMs)}

                <span
                  className={"badge " + (ticket.priority === "URGENTE" ? "danger" : "")}
                  style={{ padding: "6px 10px", borderRadius: 999, fontWeight: 900 }}
                >
                  {prettyPriority(ticket.priority)}
                </span>

                <span className="badge" style={{ padding: "6px 10px", borderRadius: 999, fontWeight: 850 }}>
                  {prettyType(ticket.type)}
                </span>
              </div>
            </div>

            <div className="sep" />

            <div className="grid">
              <div className="col-6" style={{ minWidth: 0 }}>
                <div className="small">Loja</div>
                <div className="wrap-anywhere" style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>
                  {resolvedStoreDisplay}
                </div>
              </div>

              <div className="col-6" style={{ minWidth: 0 }}>
                <div className="small">Atribuído para</div>
                <div className="wrap-anywhere" style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>
                  {assignedLabel}
                </div>

                <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
                  Status: <b>{prettyStatus(ticket.status)}</b>
                </div>

                {ticket.updated_at && (
                  <div className="small" style={{ opacity: 0.9 }}>
                    Atualizado: <b>{formatPTBR(ticket.updated_at)}</b>
                  </div>
                )}
              </div>

              <div className="col-12" style={{ minWidth: 0 }}>
                <div style={fieldShell}>
                  <div style={fieldTopRow}>
                    <div style={fieldTitle}>📍 Local</div>
                    <div style={fieldHint}>onde ocorre</div>
                  </div>
                  <div className="wrap-anywhere" style={fieldValue}>
                    {ticket.local || "—"}
                  </div>
                </div>
              </div>

              <div className="col-12" style={{ minWidth: 0 }}>
                <div
                  style={{
                    ...fieldShell,
                    border: "1px solid rgba(255,138,0,0.16)",
                    background: "linear-gradient(135deg, rgba(255,138,0,0.08), rgba(0,0,0,0.14))",
                  }}
                >
                  <div style={fieldTopRow}>
                    <div style={fieldTitle}>🧾 Problema</div>
                    <div style={fieldHint}>o que foi solicitado</div>
                  </div>
                  <div className="wrap-anywhere" style={{ ...fieldValue, fontWeight: 750 }}>
                    {ticket.problem || "—"}
                  </div>
                </div>
              </div>

              {ticket.status === "CONCLUIDO" && (
                <div className="col-12" style={{ minWidth: 0 }}>
                  <div className="sep" />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div className="h2" style={{ margin: 0 }}>Parecer (conclusão)</div>
                      <span className="badge ok" style={{ padding: "6px 10px", borderRadius: 999 }}>Final</span>
                    </div>

                    {canEditClosure && !editClosureOpen && (
                      <button className="btn" onClick={openEditClosure}>
                        Editar parecer
                      </button>
                    )}
                  </div>

                  {!editClosureOpen ? (
                    <div
                      className="wrap-anywhere"
                      style={{
                        whiteSpace: "pre-wrap",
                        padding: 14,
                        borderRadius: 16,
                        border: "1px solid rgba(46,204,113,0.25)",
                        background: "rgba(46,204,113,0.08)",
                        fontWeight: 650,
                      }}
                    >
                      {String(resolutionText || "").trim() ? String(resolutionText).trim() : "—"}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.16)",
                      }}
                    >
                      <label>Novo parecer</label>
                      <textarea
                        className="input wrap-anywhere"
                        rows={5}
                        value={editClosureText}
                        onChange={(e) => setEditClosureText(e.target.value)}
                        placeholder="Corrija o parecer aqui..."
                        disabled={savingClosure}
                      />

                      <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        <button className="btn" onClick={cancelEditClosure} disabled={savingClosure}>
                          Cancelar
                        </button>
                        <button className="btn primary" onClick={saveEditClosure} disabled={savingClosure}>
                          {savingClosure ? "Salvando..." : "Salvar parecer"}
                        </button>
                      </div>

                      <div className="small" style={{ marginTop: 8, opacity: 0.9 }}>
                        A edição fica registrada no histórico.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sep" />
            <div className="grid">
              <div className="col-6" style={{ minWidth: 0 }}>
                <AttachmentsPanel title="Anexos da abertura" attachments={openingAttachments} />
              </div>
              <div className="col-6" style={{ minWidth: 0 }}>
                <AttachmentsPanel title="Anexos do fechamento" attachments={closingAttachments} />
              </div>
            </div>

            {isClient && (
              <>
                <div className="sep" />
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div className="h2" style={{ marginBottom: 2 }}>Linha do tempo</div>
                    <div className="small" style={{ opacity: 0.9 }}>
                      Acompanhe as atualizações do chamado.
                      {updatesAsc.length > DETAIL_UPDATES_SOFT_LIMIT ? ` Exibindo os ${DETAIL_UPDATES_SOFT_LIMIT} registros mais recentes.` : ""}
                    </div>
                  </div>

                  <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
                      <input type="checkbox" checked={importantOnly} onChange={(e) => setImportantOnlySafe(e.target.checked)} />
                      <span className="small" style={{ margin: 0, opacity: 0.95 }}>Somente importantes</span>
                    </label>
                    {clientTimeline.length > 12 && (
                      <button className="btn" onClick={() => setShowAllTimeline((v) => !v)}>
                        {showAllTimeline ? "Mostrar menos" : `Mostrar tudo (${clientTimeline.length})`}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {visibleClientTimeline.length === 0 ? (
                    <div className="small">Sem atualizações ainda.</div>
                  ) : (
                    visibleClientTimeline.map((it) => (
                      <div
                        key={it.id}
                        className={"card ticket-timeline__item " + (it.important ? "ticket-timeline__item--important" : "")}
                      >
                        <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ fontSize: 16 }}>{it.icon}</div>
                            <div style={{ fontWeight: 900 }}>{it.title}</div>
                            <span className="badge" style={{ opacity: 0.8 }}>{it.kind}</span>
                          </div>
                          <div className="small" style={{ opacity: 0.9 }}>{it.when ? formatPTBR(it.when) : ""}</div>
                        </div>

                        {it.subtitle && (
                          <div className="small wrap-anywhere" style={{ marginTop: 6, opacity: 0.9 }}>
                            {it.subtitle}
                          </div>
                        )}

                        {it.body && (
                          <div className="wrap-anywhere" style={{ marginTop: 10, whiteSpace: "pre-wrap", fontWeight: 650 }}>
                            {it.body}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            <div className="sep" />

            <div className="ticket-action-panel">
              <div className="ticket-action-panel__head">
                <div>
                  <div className="h2" style={{ margin: 0 }}>Ações do chamado</div>
                  <div className="small" style={{ marginTop: 4, opacity: 0.9 }}>
                    {done ? "Chamado finalizado." : "As ações disponíveis seguem o status atual do chamado."}
                  </div>
                </div>
                <div className="page-chip-row">
                  {isAdmin && (
                    <button className="btn" onClick={openEdit} disabled={savingEdit || !!actionLoading}>Editar</button>
                  )}
                  {canReopen && (
                    <button className="btn accent" onClick={doReopen} disabled={!!actionLoading}>
                      {actionLoading === "reopen" ? "Reabrindo..." : "Reabrir chamado"}
                    </button>
                  )}
                  <button className="btn" onClick={load} disabled={loading || !!actionLoading}>Recarregar</button>
                </div>
              </div>

              {canTechActions && (
                <div className="ticket-action-panel__buttons">
                  {canAssignNow && (
                    <button className="btn primary" onClick={doAssign} disabled={!!actionLoading}>
                      {actionLoading === "assign" ? "Assumindo..." : "Assumir chamado"}
                    </button>
                  )}
                  {canStartNow && (
                    <button className="btn primary" onClick={doStart} disabled={!!actionLoading}>
                      {actionLoading === "start" ? "Iniciando..." : "Iniciar atendimento"}
                    </button>
                  )}
                  {canPendNow && (
                    <button className="btn" onClick={doPend} disabled={!!actionLoading}>
                      {actionLoading === "pend" ? "Registrando..." : "Pendenciar"}
                    </button>
                  )}
                  {!canAssignNow && !canStartNow && !canPendNow && !canCloseNow && (
                    <span className="badge" style={{ padding: "8px 12px", borderRadius: 999, alignSelf: "center" }}>
                      Nenhuma ação operacional disponível
                    </span>
                  )}
                </div>
              )}

              {done && (
                <span className="badge ok" style={{ padding: "8px 12px", borderRadius: 999, alignSelf: "flex-start" }}>
                  {canReopen ? "Finalizado — pode ser reaberto pelo admin" : "Somente leitura"}
                </span>
              )}
            </div>

            {canTechActions && (
              <>
                <div className="sep" />

                {(canPendNow || canCloseNow) && (
                  <div className="grid ticket-workflow-grid">
                    {canPendNow && (
                      <div className="col-6" style={{ minWidth: 0 }}>
                        <div className="ticket-detail-block">
                          <div className="h2">Registrar pendência</div>
                          <label>Motivo da pendência</label>
                          <textarea
                            className="input wrap-anywhere"
                            rows={4}
                            value={pendMsg}
                            onChange={(e) => setPendMsg(e.target.value)}
                            placeholder="Ex: aguardando peça, autorização ou retorno do cliente..."
                            disabled={!!actionLoading}
                          />
                          <div style={{ marginTop: 10 }}>
                            <button className="btn" onClick={doPend} disabled={!!actionLoading}>
                              {actionLoading === "pend" ? "Registrando..." : "Pendenciar chamado"}
                            </button>
                          </div>
                          <div className="small" style={{ marginTop: 8, opacity: 0.9 }}>
                            O motivo é obrigatório e ficará registrado no histórico.
                          </div>
                        </div>
                      </div>
                    )}

                    {canCloseNow && (
                      <div className="col-6" style={{ minWidth: 0 }}>
                        <div className="ticket-detail-block ticket-detail-block--success">
                          <div className="h2">Concluir chamado</div>
                          <label>Parecer técnico</label>
                          <textarea
                            className="input wrap-anywhere"
                            rows={4}
                            value={parecer}
                            onChange={(e) => setParecer(e.target.value)}
                            placeholder="Descreva o que foi feito, testes realizados e resultado final..."
                            disabled={!!actionLoading}
                          />
                          <div style={{ marginTop: 10 }}>
                            <label>Anexos do fechamento</label>
                            <input
                              className="input ticket-file-input"
                              type="file"
                              multiple
                              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                              onChange={(e) => setCloseFiles(Array.from(e.target.files || []).slice(0, 5))}
                              disabled={!!actionLoading}
                            />
                            <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
                              Fotos e vídeos curtos usados como evidência do atendimento. Máximo de 5 arquivos.
                            </div>
                            {closeFiles.length > 0 && (
                              <div className="ticket-attachment-list" style={{ marginTop: 10 }}>
                                {closeFiles.map((file, idx) => (
                                  <div className="ticket-attachment-chip" key={`${file.name}-${idx}`}>
                                    <span>{file.type.startsWith("video/") ? "🎥" : "🖼️"}</span>
                                    <span className="wrap-anywhere">{file.name}</span>
                                    <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <button className="btn primary" onClick={doClose} disabled={!!actionLoading}>
                              {actionLoading === "close" ? "Concluindo..." : "Concluir chamado"}
                            </button>
                          </div>
                          <div className="small" style={{ marginTop: 8, opacity: 0.9 }}>
                            O parecer é obrigatório para finalizar o atendimento.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="sep" />

                <div className="ticket-detail-block" style={{ minWidth: 0 }}>
                  <div className="h2">Comentário interno</div>
                  <label>Mensagem</label>
                  <textarea
                    className="input wrap-anywhere"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ex: diagnóstico iniciado, orientação enviada ou observação do atendimento..."
                    disabled={!!actionLoading}
                  />
                  <div style={{ marginTop: 10 }}>
                    <button className="btn" onClick={doComment} disabled={!!actionLoading}>
                      {actionLoading === "comment" ? "Enviando..." : "Enviar comentário"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {!isClient && (
        <div className="col-12 card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="h2">Histórico</div>
              <div className="small" style={{ opacity: 0.9 }}>
                {updatesAsc.length > DETAIL_UPDATES_SOFT_LIMIT ? `Exibindo os ${DETAIL_UPDATES_SOFT_LIMIT} registros mais recentes.` : ""}
              </div>
            </div>
            {recentUpdatesAsc.length > 20 && (
              <button className="btn" onClick={() => setShowAllHistory((v) => !v)}>
                {showAllHistory ? "Mostrar menos" : `Mostrar tudo (${recentUpdatesAsc.length})`}
              </button>
            )}
          </div>
          {visibleHistory.length === 0 ? (
            <div className="small">Sem atualizações ainda.</div>
          ) : (
            <div className="ticket-timeline">
              {visibleHistory.map((u: any) => {
                const kind = normalizeKind(u);
                const msg = u.note || u.message || "";
                const when = u.created_at || u.createdAt || "";

                const rawWho = ticket ? resolveUpdateActorLabel(u, ticket, derivedAssignedName) : "—";
                const who = ticket ? resolveWhoNice(kind, rawWho, ticket, derivedAssignedName) : "Sistema";

                return (
                  <div
                    key={u.id}
                    className="card ticket-timeline__item"
                  >
                    <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div className="badge" style={{ padding: "6px 10px", borderRadius: 999, ...kindChipStyle(kind) }}>
                        {prettyKind(kind)}
                      </div>
                      <div className="small" style={{ opacity: 0.9 }}>{when ? formatPTBR(when) : ""}</div>
                    </div>

                    <div className="small wrap-anywhere" style={{ marginTop: 6, opacity: 0.9 }}>
                      por <b>{who}</b>
                    </div>

                    {msg && (
                      <div className="wrap-anywhere" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                        {String(msg)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{
              width: "min(720px, 100%)",
              borderRadius: 18,
              padding: 14,
              background: "rgba(17,26,46,0.92)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div className="h2" style={{ margin: 0 }}>Editar chamado</div>
                <div className="small wrap-anywhere" style={{ marginTop: 4, opacity: 0.85 }}>
                  {ticket?.id}
                </div>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn" onClick={closeEdit} disabled={savingEdit}>Cancelar</button>
                <button className="btn primary" onClick={doSaveEdit} disabled={savingEdit}>
                  {savingEdit ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>

            <div className="sep" />

            <div className="grid">
              <div className="col-6" style={{ minWidth: 0 }}>
                <label>Solicitante</label>
                <input className="input" value={editRequester} onChange={(e) => setEditRequester(e.target.value)} />
              </div>

              <div className="col-6" style={{ minWidth: 0 }}>
                <label>Local</label>
                <input className="input" value={editLocal} onChange={(e) => setEditLocal(e.target.value)} />
              </div>

              <div className="col-12" style={{ minWidth: 0 }}>
                <label>Problema</label>
                <textarea className="input wrap-anywhere" rows={4} value={editProblem} onChange={(e) => setEditProblem(e.target.value)} />
              </div>

              <div className="col-6" style={{ minWidth: 0 }}>
                <label>Prioridade</label>
                <FancySelect
                  value={editPriority}
                  onChange={(value) => setEditPriority(value as TicketPriority)}
                  options={[
                    { value: "NORMAL", label: "Normal" },
                    { value: "URGENTE", label: "Urgente" },
                  ]}
                />
                <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>* Apenas ADMIN pode editar.</div>
              </div>

              <div className="col-6" style={{ minWidth: 0 }}>
                <label>Tipo</label>
                <FancySelect
                  value={editType}
                  onChange={(value) => setEditType(value as TicketType)}
                  options={[
                    { value: "REPARO", label: "Reparo" },
                    { value: "INSTALACAO", label: "Instalação" },
                    { value: "SERVICO", label: "Serviço" },
                    { value: "VISITA_TECNICA", label: "Visita técnica" },
                  ]}
                />
              </div>
            </div>

            <div className="sep" />

            <div className="small" style={{ opacity: 0.85 }}>
              Ao salvar, o sistema registra a edição no histórico.
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
