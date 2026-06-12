import React from "react";
import ReactDOM from "react-dom";
import { Link } from "react-router-dom";
import {
  Ticket,
  listTickets,
  createTicket,
  createTicketWithAttachments,
  adminListStores,
  listNetworks,
  listStores,
  assignTicket,
  reopenTicket,
  startTicket,
} from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";
import FancySelect from "../components/FancySelect";

/* =========================
   OCULTAÇÃO (ADMIN ONLY)
========================= */
const LS_HIDDEN_TICKETS = "rioautocom_hidden_tickets_v1";

function getHiddenTickets(): string[] {
  try {
    const raw = localStorage.getItem(LS_HIDDEN_TICKETS);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
}

function setHiddenTickets(ids: string[]) {
  localStorage.setItem(LS_HIDDEN_TICKETS, JSON.stringify(Array.from(new Set(ids.map(String)))));
}

function hideTicketId(id: string) {
  const set = new Set(getHiddenTickets());
  set.add(String(id));
  setHiddenTickets(Array.from(set));
}

function restoreTicketId(id: string) {
  const idStr = String(id);
  setHiddenTickets(getHiddenTickets().filter((x) => String(x) !== idStr));
}

function isHiddenTicket(id: string) {
  const idStr = String(id);
  return getHiddenTickets().includes(idStr);
}

/* =========================
   Normalização defensiva
========================= */
const STATUS_SET = new Set(["ABERTO", "ATRIBUIDO", "EM_ATENDIMENTO", "PENDENTE", "CONCLUIDO"]);
const TYPE_SET = new Set(["REPARO", "SUPORTE", "MANUTENCAO", "VISITA"]);
const PRIORITY_SET = new Set(["NORMAL", "URGENTE"]);

function safeStatus(v: any): string {
  const s = String(v ?? "").trim();
  return STATUS_SET.has(s) ? s : "ABERTO";
}

function safeType(v: any): Ticket["type"] {
  const s = String(v ?? "").trim();
  return (TYPE_SET.has(s) ? s : "REPARO") as Ticket["type"];
}

function safePriority(v: any): Ticket["priority"] {
  const s = String(v ?? "").trim();
  return (PRIORITY_SET.has(s) ? s : "NORMAL") as Ticket["priority"];
}

function isConcludedTicket(v: any): boolean {
  return safeStatus(v) === "CONCLUIDO";
}

const OPEN_FAMILY = new Set(["ABERTO", "ATRIBUIDO", "EM_ATENDIMENTO", "PENDENTE"]);
const OPEN_FILTER = "__OPEN__";

/* =========================
   Badges com ícones
========================= */
function statusLabel(s: any) {
  const ss = safeStatus(s);
  if (ss === "CONCLUIDO") return "Concluído";
  if (ss === "EM_ATENDIMENTO") return "Em atendimento";
  if (ss === "ATRIBUIDO") return "Atribuído";
  if (ss === "PENDENTE") return "Pendente";
  return "Aberto";
}

function priorityLabel(p: any) {
  return safePriority(p) === "URGENTE" ? "Urgente" : "Normal";
}

function typeLabel(t: any) {
  const tt = safeType(t);
  if (tt === "MANUTENCAO") return "Manutenção";
  if (tt === "SUPORTE") return "Suporte";
  if (tt === "VISITA") return "Visita";
  return "Reparo";
}

function statusBadge(s: string) {
  const ss = safeStatus(s);
  if (ss === "CONCLUIDO")
    return (
      <span className="badge ok">
        <span className="i">✓</span> Concluído
      </span>
    );

  if (ss === "EM_ATENDIMENTO")
    return (
      <span className="badge accentB">
        <span className="i">▶</span> Em atendimento
      </span>
    );

  if (ss === "ATRIBUIDO")
    return (
      <span className="badge">
        <span className="i">👤</span> Atribuído
      </span>
    );

  if (ss === "PENDENTE")
    return (
      <span className="badge warn">
        <span className="i">⏳</span> Pendente
      </span>
    );

  return (
    <span className="badge">
      <span className="i">•</span> Aberto
    </span>
  );
}

function priorityBadge(p: Ticket["priority"]) {
  const pp = safePriority(p);
  return (
    <span className={"badge " + (pp === "URGENTE" ? "danger" : "")}>
      <span className="i">{pp === "URGENTE" ? "⚡" : "•"}</span> {priorityLabel(pp)}
    </span>
  );
}

function typeBadge(t: Ticket["type"]) {
  const tt = safeType(t);
  return (
    <span className="badge">
      <span className="i">⌁</span> {typeLabel(tt)}
    </span>
  );
}

/* ========================= */

function useIsMobile(breakpointPx = 820) {
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

function parseISOorNull(v?: string | null): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function inDateRange(ts: number, fromTs?: number | null, toTs?: number | null): boolean {
  if (fromTs != null && ts < fromTs) return false;
  if (toTs != null && ts > toTs) return false;
  return true;
}

function safeStr(v: any) {
  return (v == null ? "" : String(v)).trim();
}

function getFirstNameFromAuth(auth: any): string {
  const raw = safeStr(
    auth?.name ||
      auth?.full_name ||
      auth?.display_name ||
      auth?.username ||
      "Admin"
  );

  const first = raw.match(/[A-Za-zÀ-ÿ0-9]+/)?.[0] || "Admin";
  if (!first) return "Admin";

  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** =========================
 *  REDE/LOJA (frontend)
 * ========================= */
function getNetworkNameFromTicket(t: any): string {
  return t?.store_network_name ?? t?.network_name ?? t?.rede_name ?? t?.chain_name ?? t?.group_name ?? "";
}

function getStoreNameFromTicket(t: any): string {
  return t?.store_name ?? t?.store?.name ?? t?.storeName ?? "";
}

function getStoreDisplayFromTicket(t: any): string {
  const net = getNetworkNameFromTicket(t);
  const store = getStoreNameFromTicket(t) || String(t?.store_id ?? "");
  if (net && store) return `${net} - ${store}`;
  return store || net || "—";
}

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

function getNetworkNameFromStore(s?: StoreItem | null): string {
  return (s?.network_name ?? s?.rede_name ?? "") || "";
}

function getNetworkIdFromStore(s?: StoreItem | null): string {
  return (s?.network_id ?? s?.rede_id ?? "") || "";
}

function storeOptionLabel(s: StoreItem): string {
  return s.name;
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

/* =========================
   Sorting
========================= */

type SortKey = "updated" | "status" | "store" | "priority" | "type";
type SortDir = "asc" | "desc";

const STATUS_ORDER: string[] = ["ABERTO", "ATRIBUIDO", "EM_ATENDIMENTO", "PENDENTE", "CONCLUIDO"];

function statusRank(s?: string) {
  const idx = STATUS_ORDER.indexOf(safeStatus(s));
  return idx >= 0 ? idx : 999;
}

function priorityRank(p?: string) {
  return safePriority(p) === "URGENTE" ? 0 : 1;
}

function ticketSortValue(t: any, key: SortKey, getStoreDisplay?: (t: any) => string): any {
  if (key === "updated") return parseISOorNull(t?.updated_at) ?? parseISOorNull(t?.opened_at) ?? 0;
  if (key === "status") return statusRank(t?.status);
  if (key === "store") return safeStr(getStoreDisplay ? getStoreDisplay(t) : getStoreDisplayFromTicket(t)).toLowerCase();
  if (key === "priority") return priorityRank(t?.priority);
  if (key === "type") return safeStr(safeType(t?.type));
  return 0;
}

function sortTickets(list: any[], key: SortKey, dir: SortDir, getStoreDisplay?: (t: any) => string) {
  const mult = dir === "asc" ? 1 : -1;
  const arr = list.slice();
  arr.sort((a, b) => {
    const va = ticketSortValue(a, key, getStoreDisplay);
    const vb = ticketSortValue(b, key, getStoreDisplay);

    if (va < vb) return -1 * mult;
    if (va > vb) return 1 * mult;

    const ta = parseISOorNull(a?.updated_at) ?? parseISOorNull(a?.opened_at) ?? 0;
    const tb = parseISOorNull(b?.updated_at) ?? parseISOorNull(b?.opened_at) ?? 0;
    return tb - ta;
  });
  return arr;
}

/* =========================
   Menu Portal
========================= */

type MenuPlacement = "down" | "up";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function usePortalMenuPosition(
  open: boolean,
  triggerEl: HTMLElement | null,
  menuWidth = 210,
  menuMaxHeight = 260,
  gap = 8
) {
  const [pos, setPos] = React.useState<{ top: number; left: number; placement: MenuPlacement }>({
    top: 0,
    left: 0,
    placement: "down",
  });

  const update = React.useCallback(() => {
    if (!triggerEl) return;

    const r = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - r.bottom;
    const spaceAbove = r.top;

    const placement: MenuPlacement =
      spaceBelow >= menuMaxHeight + gap || spaceBelow >= spaceAbove ? "down" : "up";

    const left = clamp(r.right - menuWidth, 8, vw - menuWidth - 8);

    const top =
      placement === "down"
        ? clamp(r.bottom + gap, 8, vh - 8)
        : clamp(r.top - gap, 8, vh - 8);

    setPos({ top, left, placement });
  }, [triggerEl, menuWidth, menuMaxHeight, gap]);

  React.useEffect(() => {
    if (!open) return;
    update();

    const onResize = () => update();
    const onScroll = () => update();

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, update]);

  return pos;
}

function PortalMenu({
  open,
  triggerEl,
  onClose,
  children,
}: {
  open: boolean;
  triggerEl: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const { top, left, placement } = usePortalMenuPosition(open, triggerEl, 210, 260, 8);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      const menu = menuRef.current;
      if (menu && menu.contains(target)) return;

      if (triggerEl && triggerEl.contains(target)) return;

      onClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose, triggerEl]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className={"menu-pop " + (placement === "up" ? "menu-pop--up" : "menu-pop--down")}
      role="menu"
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 5000,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

/* =========================
   CLIENT UX helpers
========================= */

function formatDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTimeShort(ts: number) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

function getLastUpdateTs(t: any): number | null {
  return parseISOorNull(t?.updated_at) ?? parseISOorNull(t?.opened_at) ?? null;
}

function isNewTicket(t: any, hours = 4): boolean {
  const opened = parseISOorNull(t?.opened_at);
  if (!opened) return false;
  const now = Date.now();
  return now - opened <= hours * 60 * 60 * 1000;
}

/* =========================
   SLA (deadline badge)
========================= */
function formatDurationMs(ms: number) {
  const a = Math.abs(ms);
  const totalMin = Math.floor(a / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function slaBadge(t: any, nowMs: number) {
  const st = safeStatus(t?.status);
  if (st === "CONCLUIDO") return null;

  const opened = parseISOorNull(t?.opened_at) ?? parseISOorNull(t?.created_at) ?? null;
  const base = opened ?? parseISOorNull(t?.updated_at) ?? null;
  if (base == null) return null;

  const urgent = safePriority(t?.priority) === "URGENTE";
  const maxHours = urgent ? 8 : 24;
  const due = base + maxHours * 60 * 60 * 1000;

  const remaining = due - nowMs;
  const overdue = remaining <= 0;

  const label = overdue ? `Vencido há ${formatDurationMs(remaining)}` : `Vence em ${formatDurationMs(remaining)}`;
  const title = overdue
    ? `Prazo estourado há ${formatDurationMs(remaining)} (${urgent ? "URGENTE" : "NORMAL"}: ${maxHours}h)`
    : `Prazo em ${formatDurationMs(remaining)} (${urgent ? "URGENTE" : "NORMAL"}: ${maxHours}h)`;

  const cls = overdue ? "badge danger mini ticket-sla-badge" : remaining <= 60 * 60 * 1000 ? "badge warn mini ticket-sla-badge" : "badge mini ticket-sla-badge";

  return (
    <span className={cls} title={title}>
      <span className="i">{overdue ? "⛔" : "⏳"}</span> {label}
    </span>
  );
}

/* =========================
   CLIENT prefs (localStorage)
========================= */
type ClientPrefs = {
  statusFilter?: string;
  fromDate?: string;
  toDate?: string;
  showClosed?: boolean;
  search?: string;
  sortKey?: SortKey;
  sortDir?: SortDir;
  groupByStatus?: boolean;
};

const LS_CLIENT_PREFS = "rioautocom_tickets_client_prefs_v1";

function readClientPrefs(): ClientPrefs | null {
  try {
    const raw = localStorage.getItem(LS_CLIENT_PREFS);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as ClientPrefs) : null;
  } catch {
    return null;
  }
}

function writeClientPrefs(p: ClientPrefs) {
  try {
    localStorage.setItem(LS_CLIENT_PREFS, JSON.stringify(p));
  } catch {
    // ignore
  }
}

function Chip({
  active,
  orange,
  label,
  onClick,
  title,
}: {
  active: boolean;
  orange?: boolean;
  label: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      className={"chip " + (active ? "active " : "") + (active && orange ? "orange" : "")}
      onClick={onClick}
      title={title}
      type="button"
    >
      <span className="chip-dot" />
      {label}
    </button>
  );
}

export default function TicketsPage() {
  const { role, auth } = useAuth();
  const { show, Toast } = useToast();

  const isMobile = useIsMobile(820);
  const defaultRequesterName = React.useMemo(() => getFirstNameFromAuth(auth), [auth]);

  const [loading, setLoading] = React.useState(true);

  const [allTickets, setAllTickets] = React.useState<Ticket[]>([]);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [storeFilter, setStoreFilter] = React.useState<string>("");
  const [fromDate, setFromDate] = React.useState<string>("");
  const [toDate, setToDate] = React.useState<string>("");

  const [showClosed, setShowClosed] = React.useState<boolean>(false);
  const [hideClosedAdmin, setHideClosedAdmin] = React.useState<boolean>(true);
  const [showHiddenTickets, setShowHiddenTickets] = React.useState<boolean>(false);

  const [search, setSearch] = React.useState<string>("");

  const [sortKey, setSortKey] = React.useState<SortKey>("updated");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const [groupByStatus, setGroupByStatus] = React.useState<boolean>(true);
  const [collapsedStatus, setCollapsedStatus] = React.useState<Record<string, boolean>>({});

  const [stores, setStores] = React.useState<StoreItem[]>([]);

  const [createOpen, setCreateOpen] = React.useState<boolean>(false);

  const [newNetworkKey, setNewNetworkKey] = React.useState<string>("");
  const [newStoreId, setNewStoreId] = React.useState("");

  const [newType, setNewType] = React.useState<Ticket["type"]>("REPARO");
  const [newPriority, setNewPriority] = React.useState<Ticket["priority"]>("NORMAL");

  const [newRequesterName, setNewRequesterName] = React.useState(defaultRequesterName);
  const [newLocal, setNewLocal] = React.useState("");
  const [newProblem, setNewProblem] = React.useState("");
  const [newFiles, setNewFiles] = React.useState<File[]>([]);
  const [creating, setCreating] = React.useState(false);

  const [actingId, setActingId] = React.useState<string>("");

  const [hiddenVersion, setHiddenVersion] = React.useState(0);

  const pageSize = isMobile ? 18 : 45;
  const [visibleCount, setVisibleCount] = React.useState<number>(pageSize);

  React.useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize]);

  React.useEffect(() => {
    if (createOpen) setNewRequesterName(defaultRequesterName);
  }, [createOpen, defaultRequesterName]);

  const visibleTickets = React.useMemo(() => {
    return tickets.slice(0, visibleCount);
  }, [tickets, visibleCount]);

  const activeStoreIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) {
      if (s?.active === false) continue;
      set.add(String(s.id));
    }
    return set;
  }, [stores]);

  const storeById = React.useMemo(() => {
    const map = new Map<string, StoreItem>();
    for (const s of stores) {
      map.set(String(s.id), s);
    }
    return map;
  }, [stores]);

  const resolveStoreDisplay = React.useCallback(
    (t: any) => resolveStoreDisplayFromTicket(t, storeById),
    [storeById]
  );

  const load = async () => {
    setLoading(true);
    try {
      const openOnly =
        role === "ADMIN" &&
        hideClosedAdmin &&
        !showHiddenTickets &&
        statusFilter !== "CONCLUIDO";

      const data = await listTickets(openOnly ? { open_only: true } : undefined);
      setAllTickets(data);
    } catch (err: any) {
      show(err?.message || "Erro ao carregar chamados", "error");
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
        const id = n?.id != null ? String(n.id) : "";
        const name = String(n?.name ?? "").trim();
        if (id && name) networkNameById.set(id, name);
      });

      setStores((storesList || []).map((s: any) => mapStoreItem(s, networkNameById)));
    } catch (err: any) {
      show(err?.message || "Erro ao carregar lojas", "error");
    }
  };

  const mergeUpdatedTicket = React.useCallback((updated: Ticket) => {
    if (!updated?.id) return;
    setAllTickets((prev) => prev.map((t) => (String(t.id) === String(updated.id) ? { ...t, ...updated } : t)));
    setTickets((prev) => prev.map((t) => (String(t.id) === String(updated.id) ? { ...t, ...updated } : t)));
  }, []);

  const onCreate = async () => {
    if (role !== "ADMIN") return;

    if (!newStoreId) return show("Selecione a loja.", "error");
    if (!newRequesterName.trim()) return show("Informe o solicitante.", "error");
    if (!newLocal.trim()) return show("Informe o local.", "error");
    if (!newProblem.trim() || newProblem.trim().length < 5)
      return show("Descreva o problema (mín. 5 caracteres).", "error");

    setCreating(true);
    try {
      const payload = {
        store_id: newStoreId,
        requester_name: newRequesterName.trim(),
        local: newLocal.trim(),
        problem: newProblem.trim(),
        type: safeType(newType),
        priority: safePriority(newPriority),
      };

      if (newFiles.length > 0) {
        await createTicketWithAttachments(payload, newFiles);
      } else {
        await createTicket(payload);
      }

      show("Chamado criado!", "success");

      setNewStoreId("");
      setNewRequesterName(defaultRequesterName);
      setNewType("REPARO");
      setNewPriority("NORMAL");
      setNewLocal("");
      setNewProblem("");
      setNewFiles([]);

      setCreateOpen(false);
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao criar chamado", "error");
    } finally {
      setCreating(false);
    }
  };

  const canQuickActions = role === "TECH" || role === "ADMIN";

  const doQuickAssign = async (id: string) => {
    if (!id) return;
    setActingId(String(id));
    try {
      const updated = await assignTicket(id);
      mergeUpdatedTicket(updated);
      show("Chamado assumido!", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao assumir chamado", "error");
    } finally {
      setActingId("");
    }
  };

  const doQuickStart = async (id: string) => {
    if (!id) return;
    setActingId(String(id));
    try {
      const updated = await startTicket(id);
      mergeUpdatedTicket(updated);
      show("Atendimento iniciado!", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao iniciar atendimento", "error");
    } finally {
      setActingId("");
    }
  };

  const doQuickReopen = async (id: string) => {
    if (!id) return;

    const ok = window.confirm(
      "Reabrir este chamado e devolver para a fila geral?\n\n" +
        "O técnico atribuído será removido e o status voltará para ABERTO."
    );
    if (!ok) return;

    setActingId(String(id));
    try {
      const updated = await reopenTicket(id, { delete_closing_attachments: false });
      mergeUpdatedTicket(updated);
      show("Chamado reaberto e devolvido para a fila geral.", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao reabrir chamado", "error");
    } finally {
      setActingId("");
    }
  };

  const applyFilters = React.useCallback(() => {
    let list = [...allTickets];

    if (role === "ADMIN") {
      list = list.filter((t) => (showHiddenTickets ? isHiddenTicket(t.id) : !isHiddenTicket(t.id)));
    } else {
      list = list.filter((t) => !isHiddenTicket(t.id));
    }

    const fromTs = fromDate ? Date.parse(fromDate + "T00:00:00") : null;
    const toTs = toDate ? Date.parse(toDate + "T23:59:59") : null;

    if (fromTs != null || toTs != null) {
      list = list.filter((t) => {
        const ts = getLastUpdateTs(t as any);
        if (ts == null) return false;
        return inDateRange(ts, fromTs, toTs);
      });
    }

    if (role === "ADMIN" && stores.length > 0) {
      list = list.filter((t) => activeStoreIds.has(String((t as any).store_id)));
    }

    if (role === "ADMIN" && storeFilter) {
      list = list.filter((t) => String((t as any).store_id) === String(storeFilter));
    }

    if (role === "ADMIN" && hideClosedAdmin && statusFilter !== "CONCLUIDO") {
      list = list.filter((t) => safeStatus((t as any).status) !== "CONCLUIDO");
    }

    if (role === "TECH") {
      list = list.filter((t) => safeStatus((t as any).status) !== "CONCLUIDO");
    }

    if (role === "CLIENT") {
      list = list.filter((t) => {
        const st = safeStatus((t as any).status);
        if (st === "CONCLUIDO") return !!showClosed;
        return OPEN_FAMILY.has(st);
      });
    }

    if (statusFilter === OPEN_FILTER) {
      list = list.filter((t) => OPEN_FAMILY.has(safeStatus((t as any).status)));
    } else if (statusFilter === "CONCLUIDO") {
      list = list.filter((t) => safeStatus((t as any).status) === "CONCLUIDO");
    }

    const q = safeStr(search).toLowerCase();
    if (q) {
      list = list.filter((t: any) => {
        const parts = [
          safeStr(safeStatus(t?.status)),
          safeStr(t?.store_name),
          safeStr(resolveStoreDisplay(t)),
          safeStr(t?.local),
          safeStr(t?.problem),
          safeStr(t?.id),
        ]
          .join(" | ")
          .toLowerCase();
        return parts.includes(q);
      });
    }

    list = sortTickets(list as any[], sortKey, sortDir, resolveStoreDisplay) as any;
    setTickets(list);

    setVisibleCount(pageSize);
  }, [
    allTickets,
    fromDate,
    toDate,
    role,
    statusFilter,
    storeFilter,
    showClosed,
    showHiddenTickets,
    hiddenVersion,
    hideClosedAdmin,
    activeStoreIds,
    stores,
    search,
    sortKey,
    sortDir,
    pageSize,
    resolveStoreDisplay,
  ]);

  React.useEffect(() => {
    if (role === "ADMIN") return;
    setStatusFilter("");
    setShowClosed(false);
    setStoreFilter("");
    setShowHiddenTickets(false);
  }, [role]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (role !== "ADMIN") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, hideClosedAdmin, showHiddenTickets, statusFilter]);

  React.useEffect(() => {
    if (!role) return;
    loadStoresFallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  React.useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  React.useEffect(() => {
    if (role !== "CLIENT") return;
    if (statusFilter === "CONCLUIDO" && !showClosed) setShowClosed(true);
    if (!showClosed && statusFilter === "CONCLUIDO") setStatusFilter("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, statusFilter, showClosed]);

  const clientPrefsLoaded = React.useRef(false);
  React.useEffect(() => {
    if (role !== "CLIENT") {
      clientPrefsLoaded.current = true;
      return;
    }
    const p = readClientPrefs();
    if (p) {
      if (typeof p.statusFilter === "string") setStatusFilter(p.statusFilter);
      if (typeof p.fromDate === "string") setFromDate(p.fromDate);
      if (typeof p.toDate === "string") setToDate(p.toDate);
      if (typeof p.showClosed === "boolean") setShowClosed(p.showClosed);
      if (typeof p.search === "string") setSearch(p.search);
      if (p.sortKey) setSortKey(p.sortKey);
      if (p.sortDir) setSortDir(p.sortDir);
      if (typeof p.groupByStatus === "boolean") setGroupByStatus(p.groupByStatus);
    }
    clientPrefsLoaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  React.useEffect(() => {
    if (role !== "CLIENT") return;
    if (!clientPrefsLoaded.current) return;

    const t = window.setTimeout(() => {
      writeClientPrefs({
        statusFilter,
        fromDate,
        toDate,
        showClosed,
        search,
        sortKey,
        sortDir,
        groupByStatus,
      });
    }, 250);

    return () => window.clearTimeout(t);
  }, [role, statusFilter, fromDate, toDate, showClosed, search, sortKey, sortDir, groupByStatus]);

  const clearFilters = () => {
    setStatusFilter("");
    setStoreFilter("");
    setFromDate("");
    setToDate("");
    setShowClosed(false);
    setSearch("");
  };

  const doHide = (id: string) => {
    hideTicketId(id);
    setHiddenVersion((v) => v + 1);
    show("Chamado ocultado.", "success");
  };

  const doRestore = (id: string) => {
    restoreTicketId(id);
    setHiddenVersion((v) => v + 1);
    show("Chamado restaurado.", "success");
  };

  const storesByNetwork = React.useMemo(() => {
    const map = new Map<string, { key: string; name: string; items: StoreItem[] }>();

    for (const s of stores) {
      if (s?.active === false) continue;

      const netName = getNetworkNameFromStore(s);
      const netId = getNetworkIdFromStore(s);
      const key = netId || netName || "__SEM_REDE__";
      const name = netName || "Sem rede";

      if (!map.has(key)) map.set(key, { key, name, items: [] });
      map.get(key)!.items.push(s);
    }

    const groups = Array.from(map.values());
    for (const g of groups) g.items.sort((a, b) => a.name.localeCompare(b.name));
    groups.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }, [stores]);

  const createNetworks = React.useMemo(() => storesByNetwork, [storesByNetwork]);

  const storesForSelectedNetwork = React.useMemo(() => {
    if (!newNetworkKey) return [];
    const g = createNetworks.find((x) => x.key === newNetworkKey);
    return g?.items || [];
  }, [newNetworkKey, createNetworks]);

  React.useEffect(() => {
    if (!newStoreId) return;
    const ok = storesForSelectedNetwork.some((s) => String(s.id) === String(newStoreId));
    if (!ok) setNewStoreId("");
  }, [newNetworkKey, storesForSelectedNetwork, newStoreId]);

  React.useEffect(() => {
    if (role !== "ADMIN") return;
    if (newNetworkKey) return;
    if (createNetworks.length > 0) setNewNetworkKey(createNetworks[0].key);
  }, [role, createNetworks, newNetworkKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(key === "updated" ? "desc" : "asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

  const sortLabel = React.useMemo(() => {
    const map: Record<SortKey, string> = {
      updated: "Atualização",
      status: "Status",
      store: "Loja",
      priority: "Prioridade",
      type: "Tipo",
    };
    return map[sortKey];
  }, [sortKey]);

  const grouped = React.useMemo(() => {
    if (!groupByStatus) return null;

    const map = new Map<string, Ticket[]>();
    for (const t of visibleTickets) {
      const s = safeStatus((t as any)?.status || "ABERTO");
      if (!map.has(s)) map.set(s, [] as any);
      map.get(s)!.push(t);
    }

    const keys = Array.from(map.keys()).sort((a, b) => statusRank(a) - statusRank(b));
    return keys.map((k) => ({
      status: k,
      items: map.get(k) || [],
    }));
  }, [visibleTickets, groupByStatus]);

  const toggleCollapsed = (status: string) => {
    setCollapsedStatus((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const isAdmin = role === "ADMIN";
  const showCreateButton = role === "ADMIN" && !showHiddenTickets;

  const [openMenuId, setOpenMenuId] = React.useState<string>("");
  const [menuTriggerEl, setMenuTriggerEl] = React.useState<HTMLElement | null>(null);

  const openMenuFor = (id: string, el: HTMLElement | null) => {
    setOpenMenuId((prev) => (prev === id ? "" : id));
    setMenuTriggerEl(el);
  };

  const closeMenu = () => {
    setOpenMenuId("");
    setMenuTriggerEl(null);
  };

  const runAndClose = async (fn: () => Promise<void> | void) => {
    try {
      await fn();
    } finally {
      closeMenu();
    }
  };

  const clientSummary = React.useMemo(() => {
    if (role !== "CLIENT") return null;

    const base = [...tickets];
    const countOpen = base.filter((t: any) => OPEN_FAMILY.has(safeStatus(t.status))).length;
    const countClosed = base.filter((t: any) => safeStatus(t.status) === "CONCLUIDO").length;

    return { open: countOpen, closed: countClosed, total: base.length };
  }, [role, tickets]);

  const pageSummary = React.useMemo(() => {
    const base = [...tickets];
    const open = base.filter((t: any) => OPEN_FAMILY.has(safeStatus(t.status))).length;
    const urgent = base.filter((t: any) => safePriority((t as any).priority) === "URGENTE").length;
    const hidden = role === "ADMIN" ? base.filter((t: any) => isHiddenTicket(String((t as any).id))).length : 0;
    return { total: base.length, open, urgent, hidden };
  }, [tickets, role, hiddenVersion]);

  const setPeriod = (days: number | null) => {
    if (days == null) {
      setFromDate("");
      setToDate("");
      return;
    }
    const now = new Date();
    const end = formatDateInput(now);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - (days - 1));
    const start = formatDateInput(startDate);

    setFromDate(start);
    setToDate(end);
  };

  const isPeriodActive = (days: number | null) => {
    if (days == null) return !fromDate && !toDate;
    const now = new Date();
    const end = formatDateInput(now);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - (days - 1));
    const start = formatDateInput(startDate);
    return fromDate === start && toDate === end;
  };

  const canLoadMore = visibleCount < tickets.length;

  const rowWrap: React.CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
    minWidth: 0,
  };

  const rightPanel: React.CSSProperties = {
    display: "grid",
    gap: 10,
    alignContent: "start",
    justifyItems: "stretch",
    minWidth: 0,
    flex: "1 1 520px",
    maxWidth: 860,
  };

  const [nowTick, setNowTick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setNowTick((v) => v + 1), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  const nowMs = React.useMemo(() => Date.now(), [nowTick]);

  return (
    <div className="grid">
      <div className="col-12 card page-hero">
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <div style={{ minWidth: 240, flex: "0 0 auto" }}>
            <div className="page-hero__title" style={{ fontSize: 28 }}>Chamados</div>
            <div className="page-hero__sub">
              {role === "TECH"
                ? "Gerencie seus atendimentos e chamados em aberto."
                : role === "CLIENT"
                ? "Acompanhe seus chamados e históricos."
                : showHiddenTickets
                ? "Chamados ocultos."
                : "Abertura, prazos, triagem e atendimento dos chamados."}
            </div>

            {showCreateButton && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn primary" onClick={() => setCreateOpen(true)}>
                  + Novo chamado
                </button>
              </div>
            )}

            {role === "CLIENT" && clientSummary && (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, minmax(140px, 1fr))",
                  gap: 10,
                }}
              >
                <div className="page-soft-card">
                  <div className="small" style={{ opacity: 0.85 }}>
                    Abertos
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.15 }}>{clientSummary.open}</div>
                </div>
                <div className="page-soft-card">
                  <div className="small" style={{ opacity: 0.85 }}>
                    Concluídos
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.15 }}>{clientSummary.closed}</div>
                </div>
                <div className="page-soft-card">
                  <div className="small" style={{ opacity: 0.85 }}>
                    Total
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.15 }}>{clientSummary.total}</div>
                </div>
              </div>
            )}

            {role !== "CLIENT" && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(140px, 1fr))", gap: 10 }}>
                <div className="page-soft-card"><div className="page-label">Total</div><div className="page-value-strong">{pageSummary.total}</div></div>
                <div className="page-soft-card"><div className="page-label">Abertos</div><div className="page-value-strong">{pageSummary.open}</div></div>
                <div className="page-soft-card"><div className="page-label">Urgentes</div><div className="page-value-strong">{pageSummary.urgent}</div></div>
                <div className="page-soft-card"><div className="page-label">Ocultos</div><div className="page-value-strong">{pageSummary.hidden}</div></div>
              </div>
            )}
          </div>

          <div style={rightPanel}>
            <div style={{ ...rowWrap, justifyContent: "flex-start" }}>
              <input
                className="input"
                placeholder={role === "CLIENT" ? "Buscar por assunto/local/loja..." : "Buscar (loja, local, texto...)"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: "1 1 320px",
                  minWidth: isMobile ? "100%" : 280,
                }}
              />

              {role === "CLIENT" && (
                <FancySelect
                  value={`${sortKey}:${sortDir}`}
                  onChange={(value) => {
                    const [k, d] = String(value).split(":");
                    setSortKey(k as SortKey);
                    setSortDir(d as SortDir);
                  }}
                  className="tickets-inline-select"
                  options={[
                    { value: "updated:desc", label: "Mais recentes" },
                    { value: "updated:asc", label: "Mais antigos" },
                    { value: "priority:asc", label: "Urgentes primeiro" },
                  ]}
                />
              )}

              {isMobile && role !== "CLIENT" && (
                <FancySelect
                  value={`${sortKey}:${sortDir}`}
                  onChange={(value) => {
                    const [k, d] = String(value).split(":");
                    setSortKey(k as SortKey);
                    setSortDir(d as SortDir);
                  }}
                  className="tickets-inline-select"
                  options={[
                    { value: "updated:desc", label: "Atualização", hint: "Recente" },
                    { value: "updated:asc", label: "Atualização", hint: "Antigo" },
                    { value: "priority:asc", label: "Prioridade", hint: "Urgentes primeiro" },
                    { value: "status:asc", label: "Status" },
                    { value: "store:asc", label: "Loja" },
                    { value: "type:asc", label: "Tipo" },
                  ]}
                />
              )}

              {role === "ADMIN" && (
                <FancySelect
                  value={storeFilter}
                  onChange={setStoreFilter}
                  className="tickets-inline-select tickets-store-select"
                  placeholder="Todas as lojas"
                  options={storesByNetwork.flatMap((g) =>
                    g.items.map((s) => ({
                      value: s.id,
                      label: storeOptionLabel(s),
                      hint: g.name,
                    }))
                  )}
                />
              )}

              <button className="btn" onClick={load} disabled={loading} style={{ flex: "0 0 auto" }}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>

            <div className="chips" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-start" }}>
              <Chip active={statusFilter === ""} label="Todos" onClick={() => setStatusFilter("")} title="Mostrar todos" />
              <Chip
                active={statusFilter === OPEN_FILTER}
                label="Abertos"
                onClick={() => setStatusFilter(OPEN_FILTER)}
                title="Chamados em aberto, atribuídos, em atendimento ou pendentes"
              />
              {(role === "ADMIN" || role === "CLIENT") && (
                <Chip
                  active={statusFilter === "CONCLUIDO"}
                  orange
                  label="Concluídos"
                  onClick={() => {
                    if (role === "CLIENT") setShowClosed(true);
                    setStatusFilter("CONCLUIDO");
                  }}
                  title="Mostrar apenas concluídos"
                />
              )}
            </div>

            {role === "CLIENT" && (
              <div style={rowWrap}>
                <div className="small" style={{ opacity: 0.85 }}>
                  Período:
                </div>

                {[
                  { days: 1, label: "Hoje" },
                  { days: 7, label: "7 dias" },
                  { days: 30, label: "30 dias" },
                  { days: null as number | null, label: "Tudo" },
                ].map((p) => {
                  const active = isPeriodActive(p.days);
                  return (
                    <button
                      key={String(p.days)}
                      className={"btn " + (active ? "accentB" : "")}
                      onClick={() => setPeriod(p.days)}
                      style={{ padding: "8px 10px", borderRadius: 999 }}
                      title="Aplicar período"
                    >
                      {p.label}
                    </button>
                  );
                })}

                <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                  <input type="checkbox" checked={groupByStatus} onChange={(e) => setGroupByStatus(e.target.checked)} />
                  <span className="small" style={{ margin: 0 }}>
                    Agrupar
                  </span>
                </label>
              </div>
            )}

            {role === "ADMIN" && (
              <div style={rowWrap}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                  <input type="checkbox" checked={hideClosedAdmin} onChange={(e) => setHideClosedAdmin(e.target.checked)} />
                  <span className="small" style={{ margin: 0 }}>
                    Ocultar concluídos
                  </span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                  <input type="checkbox" checked={groupByStatus} onChange={(e) => setGroupByStatus(e.target.checked)} />
                  <span className="small" style={{ margin: 0 }}>
                    Agrupar por status
                  </span>
                </label>

                <button
                  className={"btn " + (showHiddenTickets ? "accentB" : "")}
                  onClick={() => setShowHiddenTickets((v) => !v)}
                >
                  {showHiddenTickets ? "Vendo: Ocultos" : "Vendo: Normais"}
                </button>
              </div>
            )}

            <div style={rowWrap}>
              <div className="small" style={{ opacity: 0.85 }}>
                Data:
              </div>

              <input
                className="input"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ width: 160 }}
              />
              <input
                className="input"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ width: 160 }}
              />

              {role === "CLIENT" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                  <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
                  <span className="small" style={{ margin: 0 }}>
                    Mostrar concluídos
                  </span>
                </label>
              )}

              <button className="btn" onClick={clearFilters} disabled={loading} style={{ marginLeft: "auto" }}>
                Limpar filtros
              </button>
            </div>

            <div className="small" style={{ textAlign: "left", opacity: 0.9 }}>
              Mostrando <b>{Math.min(visibleTickets.length, tickets.length)}</b> de <b>{tickets.length}</b> chamado(s)
              {!isMobile && (
                <>
                  {" "}
                  · Ordenação: <b>{sortLabel}</b> ({sortDir === "asc" ? "↑" : "↓"})
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {isAdmin && createOpen && !showHiddenTickets && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !creating) setCreateOpen(false);
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
              width: "min(920px, 100%)",
              borderRadius: 18,
              padding: 14,
              background: "rgba(25,25,25,0.96)",
              border: "1px solid rgba(255,255,255,0.10)",
              maxHeight: "90dvh",
              overflow: "auto",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div className="h2" style={{ margin: 0 }}>
                  Criar chamado
                </div>
                <div className="small" style={{ marginTop: 4, opacity: 0.85 }}>
                  Selecione a rede e a loja para registrar o chamado
                </div>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancelar
                </button>
                <button className="btn primary" onClick={onCreate} disabled={creating}>
                  {creating ? "Criando..." : "Criar chamado"}
                </button>
              </div>
            </div>

            <div className="sep" />

            <div className="grid" style={{ marginTop: 10 }}>
              <div className="col-12 col-md-4">
                <div className="small">Rede</div>
                <FancySelect
                  value={newNetworkKey}
                  onChange={setNewNetworkKey}
                  placeholder="Selecione..."
                  options={createNetworks.map((g) => ({ value: g.key, label: g.name }))}
                />
              </div>

              <div className="col-12 col-md-8">
                <div className="small">Loja</div>
                <FancySelect
                  value={newStoreId}
                  onChange={setNewStoreId}
                  disabled={!newNetworkKey}
                  placeholder="Selecione..."
                  options={storesForSelectedNetwork.map((s) => ({
                    value: s.id,
                    label: storeOptionLabel(s),
                    hint: s.cnpj || undefined,
                  }))}
                />
              </div>

              <div className="col-12 col-md-3">
                <div className="small">Tipo</div>
                <FancySelect
                  value={newType}
                  onChange={(value) => setNewType(value as Ticket["type"])}
                  options={[
                    { value: "REPARO", label: "Reparo" },
                    { value: "MANUTENCAO", label: "Manutenção" },
                    { value: "SUPORTE", label: "Suporte" },
                    { value: "VISITA", label: "Visita" },
                  ]}
                />
              </div>

              <div className="col-12 col-md-3">
                <div className="small">Prioridade</div>
                <FancySelect
                  value={newPriority}
                  onChange={(value) => setNewPriority(value as Ticket["priority"])}
                  options={[
                    { value: "NORMAL", label: "Normal" },
                    { value: "URGENTE", label: "Urgente" },
                  ]}
                />
              </div>

              <div className="col-12 col-md-6">
                <div className="small">Solicitante</div>
                <input className="input ticket-form-control" value={newRequesterName} onChange={(e) => setNewRequesterName(e.target.value)} />
              </div>

              <div className="col-12 col-md-6">
                <div className="small">Local</div>
                <input className="input ticket-form-control" value={newLocal} onChange={(e) => setNewLocal(e.target.value)} />
              </div>

              <div className="col-12">
                <div className="small">Problema</div>
                <textarea className="input ticket-form-control wrap-anywhere" rows={4} value={newProblem} onChange={(e) => setNewProblem(e.target.value)} />
              </div>

              <div className="col-12">
                <div className="small">Anexos da abertura</div>
                <input
                  className="input ticket-file-input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  onChange={(e) => setNewFiles(Array.from(e.target.files || []).slice(0, 5))}
                  disabled={creating}
                />
                <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
                  Fotos: até 10 MB. Vídeos curtos: até 80 MB. Máximo de 5 arquivos.
                </div>
                {newFiles.length > 0 && (
                  <div className="ticket-attachment-list" style={{ marginTop: 10 }}>
                    {newFiles.map((file, idx) => (
                      <div className="ticket-attachment-chip" key={`${file.name}-${idx}`}>
                        <span>{file.type.startsWith("video/") ? "🎥" : "🖼️"}</span>
                        <span className="wrap-anywhere">{file.name}</span>
                        <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="col-12 card page-section-card">
        <div className="page-section-head"><div><h2 className="page-section-title">Lista de chamados</h2><div className="page-section-sub">Chamados filtrados para leitura e ação.</div></div><span className="badge">{tickets.length} resultado(s)</span></div>
        {loading ? (
          <div className="small">Carregando...</div>
        ) : tickets.length === 0 ? (
          <div className="small" style={{ display: "grid", gap: 8 }}>
            <div>Nenhum chamado encontrado.</div>
            <div>
              <button className="btn" onClick={clearFilters}>
                Limpar filtros
              </button>
            </div>
          </div>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {(grouped ?? [{ status: "Todos", items: visibleTickets }]).map((g: any) => {
              const status = String(g.status);
              const items: Ticket[] = g.items || [];
              const collapsed = groupByStatus ? !!collapsedStatus[status] : false;

              return (
                <div key={status} style={{ display: "grid", gap: 10 }}>
                  {groupByStatus && (
                    <button
                      className="btn"
                      onClick={() => toggleCollapsed(status)}
                      style={{ justifySelf: "stretch", textAlign: "left" }}
                      title="Abrir/fechar grupo"
                    >
                      <span style={{ fontWeight: 900 }}>
                        {statusBadge(status)}{" "}
                        <span className="badge accentB mini" style={{ marginLeft: 8 }}>
                          {items.length}
                        </span>
                      </span>{" "}
                      <span style={{ opacity: 0.8, marginLeft: 8 }}>{collapsed ? "▸" : "▾"}</span>
                    </button>
                  )}

                  {!collapsed &&
                    items.map((t) => {
                      const urgent = safePriority((t as any)?.priority) === "URGENTE";
                      const done = isConcludedTicket((t as any)?.status);
                      const st = safeStatus((t as any)?.status);
                      const assigned = !!(t as any)?.assigned_tech_id;
                      const canAct = canQuickActions && !done;
                      const canAssignNow = canAct && st === "ABERTO" && !assigned;
                      const canStartNow = canAct && (st === "ATRIBUIDO" || st === "PENDENTE");
                      const showTechActions = canAssignNow || canStartNow;
                      const showMore = role === "ADMIN" || showTechActions;
                      const lastTs = getLastUpdateTs(t as any);
                      const lastLabel = lastTs ? formatDateTimeShort(lastTs) : "";
                      const recent = isNewTicket(t as any, 4);

                      return (
                        <div
                          key={t.id}
                          className={"card ticket-card ticket-card--mobile " + (urgent && !done ? "ticket-urgent" : "")}
                          style={{
                            padding: 12,
                            borderRadius: 18,
                            background: "linear-gradient(180deg, rgba(18,29,54,0.94), rgba(10,18,34,0.98))",
                            border:
                              urgent && !done
                                ? "1px solid rgba(255,255,255,0.18)"
                                : "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <div style={{ display: "grid", gap: 10 }}>
                            <div className="ticket-mobile-card__top">
                              <div className="ticket-mobile-card__title">{resolveStoreDisplay(t as any)}</div>
                              {lastLabel ? <div className="small ticket-mobile-card__updated">Atualizado em <b>{lastLabel}</b></div> : null}
                            </div>

                            <div className="ticket-mobile-card__chips">
                              {statusBadge(safeStatus((t as any).status))}
                              {!done && slaBadge(t as any, nowMs)}
                              {!done && recent ? (
                                <span className="badge accentB mini" title="Criado nas últimas 4 horas">
                                  <span className="i">⏱</span> RECENTE
                                </span>
                              ) : null}
                              {!done && priorityBadge(safePriority((t as any).priority))}
                              {!done && typeBadge(safeType((t as any).type))}
                              <span className="badge mini" style={{ opacity: 0.92 }}>
                                #{String((t as any).id).slice(0, 8)}
                              </span>
                            </div>

                            <div className="ticket-mobile-card__block">
                              <div className="ticket-mobile-card__label">Local</div>
                              <div className="ticket-mobile-card__value">{(t as any).local || "—"}</div>
                            </div>

                            <div className="ticket-mobile-card__problem small">
                              {(t as any).problem || "—"}
                            </div>

                            <div className="ticket-mobile-card__actions">
                              <Link className="btn primary" to={`/tickets/${t.id}`} style={{ flex: "1 1 auto", textAlign: "center" }}>
                                Abrir
                              </Link>

                              {showMore && (
                                <>
                                  <button
                                    className="btn"
                                    onClick={(e) => openMenuFor(String(t.id), e.currentTarget)}
                                    aria-haspopup="menu"
                                    aria-expanded={openMenuId === String(t.id)}
                                    style={{ flex: "0 0 auto", minWidth: 132 }}
                                  >
                                    Mais opções ▾
                                  </button>

                                  <PortalMenu open={openMenuId === String(t.id)} triggerEl={menuTriggerEl} onClose={closeMenu}>
                                    {showTechActions && (
                                      <>
                                        {canAssignNow && (
                                          <button
                                            className="menu-item"
                                            role="menuitem"
                                            disabled={actingId === String(t.id)}
                                            onClick={() => runAndClose(() => doQuickAssign(String(t.id)))}
                                          >
                                            {actingId === String(t.id) ? "Assumindo..." : "Assumir chamado"}
                                          </button>
                                        )}
                                        {canStartNow && (
                                          <button
                                            className="menu-item"
                                            role="menuitem"
                                            disabled={actingId === String(t.id)}
                                            onClick={() => runAndClose(() => doQuickStart(String(t.id)))}
                                          >
                                            {actingId === String(t.id) ? "Iniciando..." : "Iniciar atendimento"}
                                          </button>
                                        )}
                                        <div className="menu-sep" />
                                      </>
                                    )}

                                    {role === "ADMIN" && (
                                      <>
                                        {done && (
                                          <>
                                            <button
                                              className="menu-item accentB"
                                              role="menuitem"
                                              disabled={actingId === String(t.id)}
                                              onClick={() => runAndClose(() => doQuickReopen(String(t.id)))}
                                            >
                                              {actingId === String(t.id) ? "Reabrindo..." : "Reabrir chamado"}
                                            </button>
                                            <div className="menu-sep" />
                                          </>
                                        )}
                                        {!showHiddenTickets ? (
                                          <button className="menu-item danger" role="menuitem" onClick={() => runAndClose(() => doHide(String(t.id)))}>
                                            Ocultar
                                          </button>
                                        ) : (
                                          <button className="menu-item accentB" role="menuitem" onClick={() => runAndClose(() => doRestore(String(t.id)))}>
                                            Restaurar
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </PortalMenu>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {canLoadMore && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                <button className="btn" onClick={() => setVisibleCount((v) => Math.min(v + pageSize, tickets.length))}>
                  Carregar mais
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {(grouped ?? [{ status: "Todos", items: visibleTickets }]).map((g: any) => {
              const status = String(g.status);
              const items: Ticket[] = g.items || [];
              const collapsed = groupByStatus ? !!collapsedStatus[status] : false;

              return (
                <div key={status} style={{ display: "grid", gap: 10 }}>
                  {groupByStatus && (
                    <button
                      className="btn"
                      onClick={() => toggleCollapsed(status)}
                      style={{ justifySelf: "stretch", textAlign: "left" }}
                      title="Abrir/fechar grupo"
                    >
                      <span style={{ fontWeight: 900 }}>
                        {statusBadge(status)}{" "}
                        <span className="badge accentB mini" style={{ marginLeft: 8 }}>
                          {items.length}
                        </span>
                      </span>{" "}
                      <span style={{ opacity: 0.8, marginLeft: 8 }}>{collapsed ? "▸" : "▾"}</span>
                    </button>
                  )}

                  {!collapsed &&
                    items.map((t) => {
                      const urgent = safePriority((t as any)?.priority) === "URGENTE";
                      const done = isConcludedTicket((t as any)?.status);
                      const st = safeStatus((t as any)?.status);
                      const assigned = !!(t as any)?.assigned_tech_id;
                      const canAct = canQuickActions && !done;
                      const canAssignNow = canAct && st === "ABERTO" && !assigned;
                      const canStartNow = canAct && (st === "ATRIBUIDO" || st === "PENDENTE");
                      const showTechActions = canAssignNow || canStartNow;
                      const showMore = role === "ADMIN" || showTechActions;

                      const lastTs = getLastUpdateTs(t as any);
                      const lastLabel = lastTs ? formatDateTimeShort(lastTs) : "";
                      const recent = isNewTicket(t as any, 4);

                      if (done) {
                        return (
                          <div
                            key={t.id}
                            className="list-card"
                          >
                            <div style={{ display: "grid", gap: 12 }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 12,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  {statusBadge(safeStatus((t as any).status))}
                                </div>

                                {lastLabel && (
                                  <div className="small" style={{ opacity: 0.85 }}>
                                    Atualizado em <b>{lastLabel}</b>
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  fontWeight: 900,
                                  fontSize: 18,
                                  lineHeight: 1.22,
                                  wordBreak: "normal",
                                  overflowWrap: "break-word",
                                }}
                              >
                                {resolveStoreDisplay(t as any)}
                              </div>

                              <div style={{ minWidth: 0 }}>
                                <div className="small">Local</div>
                                <div
                                  style={{
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                    wordBreak: "normal",
                                    overflowWrap: "break-word",
                                  }}
                                >
                                  {(t as any).local || "—"}
                                </div>
                              </div>

                              <div className="sep" style={{ margin: 0 }} />

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 16,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div style={{ flex: "1 1 460px", minWidth: 0 }}>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                                    <div className="small" style={{ fontWeight: 800 }}>
                                      Problema
                                    </div>
                                    <div
                                      className="small"
                                      style={{
                                        lineHeight: 1.45,
                                        wordBreak: "normal",
                                        overflowWrap: "break-word",
                                      }}
                                    >
                                      {(t as any).problem || "—"}
                                    </div>
                                  </div>
                                </div>

                                <div className="actions" style={{ flex: "0 0 auto", flexWrap: "wrap" }}>
                                  <Link className="btn primary" to={`/tickets/${t.id}`}>
                                    Abrir
                                  </Link>

                                  {showMore && (
                                    <>
                                      <button
                                        className="btn more-trigger"
                                        onClick={(e) => openMenuFor(String(t.id), e.currentTarget)}
                                        aria-haspopup="menu"
                                        aria-expanded={openMenuId === String(t.id)}
                                      >
                                        Mais opções ▾
                                      </button>

                                      <PortalMenu open={openMenuId === String(t.id)} triggerEl={menuTriggerEl} onClose={closeMenu}>
                                        {role === "ADMIN" && (
                                          <>
                                            {done && (
                                              <>
                                                <button
                                                  className="menu-item accentB"
                                                  role="menuitem"
                                                  disabled={actingId === String(t.id)}
                                                  onClick={() => runAndClose(() => doQuickReopen(String(t.id)))}
                                                >
                                                  {actingId === String(t.id) ? "Reabrindo..." : "Reabrir chamado"}
                                                </button>
                                                <div className="menu-sep" />
                                              </>
                                            )}
                                            {!showHiddenTickets ? (
                                              <button className="menu-item danger" role="menuitem" onClick={() => runAndClose(() => doHide(String(t.id)))}>
                                                Ocultar
                                              </button>
                                            ) : (
                                              <button className="menu-item accentB" role="menuitem" onClick={() => runAndClose(() => doRestore(String(t.id)))}>
                                                Restaurar
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </PortalMenu>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={t.id}
                          className={"list-card ticket-card " + (urgent ? "ticket-urgent" : "")}
                        >
                          <div style={{ display: "grid", gap: 12 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 12,
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                {statusBadge(safeStatus((t as any).status))}
                                {slaBadge(t as any, nowMs)}
                                {recent && (
                                  <span className="badge accentB mini" title="Criado nas últimas 4 horas">
                                    <span className="i">⏱</span> RECENTE
                                  </span>
                                )}
                                {typeBadge(safeType((t as any).type))}
                                {priorityBadge(safePriority((t as any).priority))}
                              </div>

                              {lastLabel && (
                                <div className="small" style={{ opacity: 0.85 }}>
                                  Atualizado em <b>{lastLabel}</b>
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                fontWeight: 900,
                                fontSize: 18,
                                lineHeight: 1.22,
                                wordBreak: "normal",
                                overflowWrap: "break-word",
                              }}
                            >
                              {resolveStoreDisplay(t as any)}
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div className="small">Local</div>
                              <div
                                style={{
                                  fontWeight: 800,
                                  lineHeight: 1.2,
                                  wordBreak: "normal",
                                  overflowWrap: "break-word",
                                }}
                              >
                                {(t as any).local || "—"}
                              </div>
                            </div>

                            <div className="sep" style={{ margin: 0 }} />

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 16,
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ flex: "1 1 460px", minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                                  <div className="small" style={{ fontWeight: 800 }}>
                                    Problema
                                  </div>
                                  <div
                                    className="small"
                                    style={{
                                      lineHeight: 1.45,
                                      wordBreak: "normal",
                                      overflowWrap: "break-word",
                                    }}
                                  >
                                    {(t as any).problem || "—"}
                                  </div>
                                </div>
                              </div>

                              <div className="actions" style={{ flex: "0 0 auto", flexWrap: "wrap" }}>
                                <Link className="btn primary" to={`/tickets/${t.id}`}>
                                  Abrir
                                </Link>

                                {showMore && (
                                  <>
                                    <button
                                      className="btn more-trigger"
                                      onClick={(e) => openMenuFor(String(t.id), e.currentTarget)}
                                      aria-haspopup="menu"
                                      aria-expanded={openMenuId === String(t.id)}
                                    >
                                      Mais opções ▾
                                    </button>

                                    <PortalMenu open={openMenuId === String(t.id)} triggerEl={menuTriggerEl} onClose={closeMenu}>
                                      {showTechActions && (
                                        <>
                                          {canAssignNow && (
                                            <button className="menu-item" role="menuitem" disabled={actingId === String(t.id)} onClick={() => runAndClose(() => doQuickAssign(String(t.id)))}>
                                              {actingId === String(t.id) ? "Assumindo..." : "Assumir chamado"}
                                            </button>
                                          )}
                                          {canStartNow && (
                                            <button className="menu-item" role="menuitem" disabled={actingId === String(t.id)} onClick={() => runAndClose(() => doQuickStart(String(t.id)))}>
                                              {actingId === String(t.id) ? "Iniciando..." : "Iniciar atendimento"}
                                            </button>
                                          )}
                                          <div className="menu-sep" />
                                        </>
                                      )}

                                      {role === "ADMIN" && (
                                        <>
                                          {done && (
                                            <>
                                              <button
                                                className="menu-item accentB"
                                                role="menuitem"
                                                disabled={actingId === String(t.id)}
                                                onClick={() => runAndClose(() => doQuickReopen(String(t.id)))}
                                              >
                                                {actingId === String(t.id) ? "Reabrindo..." : "Reabrir chamado"}
                                              </button>
                                              <div className="menu-sep" />
                                            </>
                                          )}
                                          {!showHiddenTickets ? (
                                            <button className="menu-item danger" role="menuitem" onClick={() => runAndClose(() => doHide(String(t.id)))}>
                                              Ocultar
                                            </button>
                                          ) : (
                                            <button className="menu-item accentB" role="menuitem" onClick={() => runAndClose(() => doRestore(String(t.id)))}>
                                              Restaurar
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </PortalMenu>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {canLoadMore && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button className="btn" onClick={() => setVisibleCount((v) => Math.min(v + pageSize, tickets.length))}>
                  Carregar mais
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Toast />
    </div>
  );
}
