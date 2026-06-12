// src/app/api.ts

export const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "https://rioautocom-tech-backend.onrender.com";

export type Role = "ADMIN" | "TECH" | "CLIENT";

/**
 * Compatível com backend antigo (role) e novo (roles)
 */
export type AuthState = {
  access_token: string;

  // novo
  roles?: Role[];

  // legado
  role?: Role;

  must_change_password?: boolean;
  username?: string;

  // opcional
  active_role?: Role;
};

const LS_KEY = "rioautocom_auth_v1";

/* =========================
   LocalStorage Auth
========================= */
export function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export function setAuth(a: AuthState | null) {
  if (!a) localStorage.removeItem(LS_KEY);
  else localStorage.setItem(LS_KEY, JSON.stringify(a));
}

export function normalizeAuth(a: AuthState): AuthState {
  const roleLegacy = a.role;
  const roles = (a.roles && a.roles.length ? a.roles : roleLegacy ? [roleLegacy] : []) as Role[];

  const pickDefault = (): Role | undefined => {
    if (roles.includes("ADMIN")) return "ADMIN";
    if (roles.includes("TECH")) return "TECH";
    if (roles.includes("CLIENT")) return "CLIENT";
    return undefined;
  };

  const active_role = a.active_role && roles.includes(a.active_role) ? a.active_role : pickDefault();

  return {
    ...a,
    roles,
    role: roles[0],
    active_role,
  };
}

/* =========================
   Error Normalization
========================= */
function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function extractErrorMessage(data: any, status?: number): string {
  if (typeof data === "string" && data.trim()) return data.trim();

  if (isPlainObject(data)) {
    const detail = (data as any).detail;
    const message = (data as any).message || (data as any).error;

    if (typeof message === "string" && message.trim()) return message.trim();
    if (typeof detail === "string" && detail.trim()) return detail.trim();

    if (Array.isArray(detail)) {
      const parts = detail
        .map((it: any) => {
          const msg = it?.msg ? String(it.msg) : "";
          const loc = Array.isArray(it?.loc) ? it.loc.join(".") : it?.loc;
          return loc && msg ? `${loc}: ${msg}` : msg || loc || "";
        })
        .filter(Boolean);

      if (parts.length) return parts.join(" | ");
    }

    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  if (Array.isArray(data)) {
    try {
      return data.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" | ");
    } catch {
      return String(data);
    }
  }

  return status ? `HTTP ${status}` : "Erro";
}

/* =========================
   Timeout / Fetch
========================= */
const DEFAULT_TIMEOUT_MS = 25000;

function getTimeoutForPath(path: string, method?: string) {
  const m = String(method || "GET").toUpperCase();

  if (path.startsWith("/auth/login")) return 20000;
  if (path.startsWith("/tickets/with-attachments")) return 120000;
  if (path.includes("/close-with-attachments")) return 120000;
  if (path.includes("/attachments") && m === "POST") return 120000;
  if (path.startsWith("/tickets/") && m === "GET" && /^\/tickets\/[^/?]+$/.test(path)) return 45000;
  if (path.startsWith("/accesses/")) return 20000;
  if (path.startsWith("/monitoring/")) return 20000;

  return DEFAULT_TIMEOUT_MS;
}

/* =========================
   Base Fetch
========================= */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const headers = new Headers(opts.headers || {});

  headers.set("Accept", "application/json");
  if (opts.body && !(opts.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (auth?.access_token) headers.set("Authorization", `Bearer ${auth.access_token}`);

  const controller = new AbortController();
  const timeoutMs = getTimeoutForPath(path, opts.method);
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
      signal: controller.signal,
    });

    const text = await res.text();

    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      if (res.status === 503) {
        throw new Error("Servidor indisponível no momento. Tente novamente em alguns segundos.");
      }
      throw new Error(extractErrorMessage(data, res.status));
    }

    return data as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Tempo esgotado ao conectar com o servidor. Tente novamente.");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

/* =========================
   Auth
========================= */
export async function login(username: string, password: string) {
  const data = await apiFetch<any>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  const authRaw: AuthState = {
    ...(data as any),
    access_token: (data as any)?.access_token || (data as any)?.token,
    username,
  };

  const normalized = normalizeAuth(authRaw);
  setAuth(normalized);
  return normalized;
}

export async function changePassword(old_password: string, new_password: string) {
  return apiFetch<{ ok: boolean }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ old_password, new_password }),
  });
}

/* =========================
   Networks
========================= */
export type Network = { id: string; name: string };

export async function listNetworks() {
  return apiFetch<Network[]>("/networks/", { method: "GET" });
}

export async function adminCreateNetwork(input: { name: string }) {
  return apiFetch<any>("/admin/networks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* =========================
   Stores
========================= */
export type Store = {
  id: string;
  name: string;
  cnpj: string;
  active?: boolean;
  network_id?: string | null;
  network_name?: string | null;
};

export async function listStores() {
  return apiFetch<Store[]>("/stores/", { method: "GET" });
}

/* =========================
   AnyDesk Accesses
========================= */
export type AnyDeskAccess = {
  id: string;
  store_id: string;
  store_name?: string | null;
  label: string;
  anydesk_id: string;
  notes?: string | null;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

/* =========================
   Tickets
========================= */
export type TicketStatus =
  | "ABERTO"
  | "ATRIBUIDO"
  | "EM_ATENDIMENTO"
  | "PENDENTE"
  | "CONCLUIDO"
  | "CANCELADO";

export type TicketType =
  | "SUPORTE"
  | "VISITA"
  | "MANUTENCAO"
  | "REPARO"
  | "OUTRO"
  | "INSTALACAO"
  | "SERVICO"
  | "VISITA_TECNICA";

export type TicketPriority = "NORMAL" | "URGENTE";

export type Ticket = {
  id: string;
  store_id: string;
  store_name?: string | null;

  requester_name?: string | null;
  local?: string | null;
  problem: string;

  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;

  assigned_tech_id?: string | null;
  assigned_to?: string | null;

  opened_at?: string | null;
  updated_at?: string | null;

  resolution_text?: string | null;
};

export type TicketAttachment = {
  id: string;
  ticket_id: string;
  phase: "ABERTURA" | "FECHAMENTO" | string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  drive_file_id: string;
  drive_view_link?: string | null;
  drive_download_link?: string | null;
  created_at?: string | null;
};

export type TicketUpdate = {
  id: string;
  ticket_id: string;
  created_by_user_id: string;
  created_at: string;
  event_type: string;
  note?: string | null;
  payload_json?: string | null;
  actor?: string | null;
};

export async function listTickets(params?: { status?: string; mine?: boolean; open_only?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.mine) {
    qs.set("mine_only", "true");
    qs.set("mine", "true");
  }
  if (params?.open_only) qs.set("open_only", "true");

  const q = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<Ticket[]>(`/tickets/${q}`, { method: "GET" });
}

export async function getTicket(ticketId: string) {
  return apiFetch<{ ticket: Ticket; updates: TicketUpdate[]; attachments?: TicketAttachment[] }>(`/tickets/${ticketId}`, {
    method: "GET",
  });
}

export async function createTicket(input: {
  store_id: string;
  requester_name: string;
  local: string;
  problem: string;
  type: TicketType;
  priority: TicketPriority;
}) {
  return apiFetch<Ticket>("/tickets/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function buildTicketFormData(input: Record<string, any>, files?: File[]) {
  const fd = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null) fd.append(key, String(value));
  });
  (files || []).forEach((file) => fd.append("files", file));
  return fd;
}

export async function createTicketWithAttachments(
  input: {
    store_id: string;
    requester_name: string;
    local: string;
    problem: string;
    type: TicketType;
    priority: TicketPriority;
  },
  files: File[]
) {
  return apiFetch<Ticket>("/tickets/with-attachments", {
    method: "POST",
    body: buildTicketFormData(input, files),
  });
}

export async function uploadTicketAttachments(ticketId: string, phase: "ABERTURA" | "FECHAMENTO", files: File[]) {
  return apiFetch<TicketAttachment[]>(`/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: buildTicketFormData({ phase }, files),
  });
}

export async function assignTicket(ticketId: string) {
  return apiFetch<Ticket>(`/tickets/${ticketId}/assign`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function startTicket(ticketId: string, message?: string) {
  return apiFetch<Ticket>(`/tickets/${ticketId}/start`, {
    method: "POST",
    body: JSON.stringify({ message: message || null }),
  });
}

export async function pendTicket(ticketId: string, message?: string) {
  return apiFetch<Ticket>(`/tickets/${ticketId}/pend`, {
    method: "POST",
    body: JSON.stringify({ message: message || null }),
  });
}

export async function commentTicket(ticketId: string, message: string) {
  return apiFetch<{ ok: boolean }>(`/tickets/${ticketId}/comment`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function closeTicket(ticketId: string, parecer: string) {
  return apiFetch<Ticket>(`/tickets/${ticketId}/close`, {
    method: "POST",
    body: JSON.stringify({ parecer }),
  });
}

export async function closeTicketWithAttachments(ticketId: string, parecer: string, files: File[]) {
  return apiFetch<Ticket>(`/tickets/${ticketId}/close-with-attachments`, {
    method: "POST",
    body: buildTicketFormData({ parecer }, files),
  });
}

export async function reopenTicket(ticketId: string, input?: { delete_closing_attachments?: boolean }) {
  return apiFetch<Ticket>(`/tickets/${ticketId}/reopen`, {
    method: "POST",
    body: JSON.stringify({
      delete_closing_attachments: !!input?.delete_closing_attachments,
    }),
  });
}

export async function editTicket(
  ticketId: string,
  input: Partial<Pick<Ticket, "requester_name" | "local" | "problem" | "type" | "priority">>
) {
  return apiFetch<Ticket>(`/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function editTicketClosure(ticketId: string, parecer: string) {
  const body = JSON.stringify({ parecer });

  try {
    return await apiFetch<Ticket>(`/tickets/${ticketId}/closure`, {
      method: "PATCH",
      body,
    });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    const looksMissing =
      msg.includes("404") ||
      msg.toLowerCase().includes("not found") ||
      msg.toLowerCase().includes("não encontrado") ||
      msg.includes("405") ||
      msg.toLowerCase().includes("method not allowed");

    if (!looksMissing) throw e;

    return apiFetch<Ticket>(`/tickets/${ticketId}/close`, {
      method: "PATCH",
      body,
    });
  }
}

/* =========================
   Admin
========================= */
export type CreateUserInput = {
  username: string;
  role?: Role;
  roles?: Role[];
  password: string;
  must_change_password?: boolean;
};

export async function adminListUsers() {
  return apiFetch<any[]>("/admin/users", { method: "GET" });
}

export async function adminCreateUser(input: CreateUserInput) {
  return apiFetch<any>("/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function adminListStores() {
  return apiFetch<any[]>("/admin/stores", { method: "GET" });
}

export async function adminCreateStore(input: {
  name: string;
  cnpj: string;
  network_id?: string | number | null;
}) {
  return apiFetch<any>("/admin/stores", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function adminUpdateStore(
  store_id: string,
  input: { name: string; cnpj: string; active: boolean; network_id?: string | number | null }
) {
  return apiFetch<any>(`/admin/stores/${store_id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function adminGrantStore(
  a: string | { client_id?: string; username?: string; store_id: string },
  b?: string
) {
  if (typeof a === "string") {
    const client_id = a;
    const store_id = String(b || "");
    return apiFetch<any>(`/admin/clients/${client_id}/stores/${store_id}`, { method: "POST" });
  }

  const payload = a;
  if (payload.client_id) {
    return apiFetch<any>(`/admin/clients/${payload.client_id}/stores/${payload.store_id}`, { method: "POST" });
  }

  return apiFetch<any>("/admin/grant-store", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


export async function adminRevokeStore(client_id: string, store_id: string) {
  return apiFetch<any>(`/admin/clients/${client_id}/stores/${store_id}`, {
    method: "DELETE",
  });
}

/* =========================
   Admin — Networks
========================= */
export async function adminListNetworks() {
  return apiFetch<Network[]>("/admin/networks", { method: "GET" });
}

export async function adminGrantNetwork(
  a: string | { client_id?: string; username?: string; network_id: string },
  b?: string
) {
  if (typeof a === "string") {
    const client_id = a;
    const network_id = String(b || "");
    return apiFetch<any>(`/admin/clients/${client_id}/networks/${network_id}`, { method: "POST" });
  }

  const payload = a;
  if (payload.client_id) {
    return apiFetch<any>(`/admin/clients/${payload.client_id}/networks/${payload.network_id}`, { method: "POST" });
  }

  return apiFetch<any>("/admin/grant-network", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminRevokeNetwork(client_id: string, network_id: string) {
  return apiFetch<any>(`/admin/clients/${client_id}/networks/${network_id}`, {
    method: "DELETE",
  });
}

/* =========================
   Admin — AnyDesk Accesses
========================= */
export async function adminListAnyDeskAccesses(params?: { q?: string; store_id?: string }) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.store_id) qs.set("store_id", params.store_id);
  const q = qs.toString() ? `?${qs.toString()}` : "";

  return apiFetch<AnyDeskAccess[]>(`/accesses/${q}`, { method: "GET" });
}

export async function adminCreateAnyDeskAccess(input: {
  store_id: string;
  label: string;
  anydesk_id: string;
  notes?: string;
  active?: boolean;
}) {
  return apiFetch<AnyDeskAccess>("/accesses/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function adminUpdateAnyDeskAccess(
  access_id: string,
  input: {
    store_id?: string;
    label?: string;
    anydesk_id?: string;
    notes?: string;
    active?: boolean;
  }
) {
  return apiFetch<AnyDeskAccess>(`/accesses/${access_id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function adminDeleteAnyDeskAccess(access_id: string) {
  return apiFetch<{ ok: boolean }>(`/accesses/${access_id}`, {
    method: "DELETE",
  });
}


/* =========================
   Monitoring
========================= */
export type MonitoringStatus = "ONLINE" | "PARCIAL" | "OFFLINE" | "STALE" | "SEM_DADOS";

export type MonitoringItem = {
  name: string;
  ip: string;
  ok: boolean;
  detail?: string | null;
};

export type MonitoringStore = {
  store_id: string;
  store_name: string;
  cnpj: string;
  network_id?: string | null;
  network_name?: string | null;
  status: MonitoringStatus;
  reported_status?: "ONLINE" | "PARCIAL" | "OFFLINE" | null;
  up_count: number;
  down_count: number;
  total_count: number;
  summary?: string | null;
  signature?: string | null;
  methods?: string | null;
  agent_version?: string | null;
  last_check_at?: string | null;
  last_seen_at?: string | null;
  age_seconds?: number | null;
  active?: boolean;
  configured?: boolean;
  items: MonitoringItem[];
};

export async function listMonitoringOverview(params?: {
  q?: string;
  status?: MonitoringStatus | "";
  network_id?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.status) qs.set("status", params.status);
  if (params?.network_id) qs.set("network_id", params.network_id);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<{ items: MonitoringStore[] }>(`/monitoring/overview${q}`, { method: "GET" });
}

export async function getMonitoringStore(storeId: string) {
  return apiFetch<MonitoringStore>(`/monitoring/stores/${storeId}`, { method: "GET" });
}
