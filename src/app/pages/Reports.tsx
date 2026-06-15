import React from "react";
import { getTicket, listTickets, listNetworks, listStores, Network, Store, Ticket, TicketUpdate } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";
import FancySelect from "../components/FancySelect";

/* =========================
   Helpers (datas/format)
========================= */
function stripAccentsUpper(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normStatus(v: any) {
  return stripAccentsUpper(String(v ?? ""));
}

function isClosedStatus(s: string) {
  const x = normStatus(s);
  return x === "CONCLUIDO" || x === "CANCELADO";
}

function prettyStatus(s: any) {
  const v = normStatus(s);
  if (v === "ABERTO") return "Aberto";
  if (v === "ATRIBUIDO") return "Atribuído";
  if (v === "EM_ATENDIMENTO") return "Em atendimento";
  if (v === "PENDENTE") return "Pendente";
  if (v === "CONCLUIDO") return "Concluído";
  if (v === "CANCELADO") return "Cancelado";
  return v || "—";
}

function priorityText(p: any) {
  return normStatus(p) === "URGENTE" ? "Urgente" : "Normal";
}

function parseDateMs(v?: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  // número (epoch)
  if (typeof v === "number" && Number.isFinite(v)) return v;

  // Date
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }

  const s = String(v).trim();
  if (!s) return null;

  // ✅ IMPORTANTÍSSIMO: date-only do input (YYYY-MM-DD) deve ser LOCAL, não UTC
  // (Date.parse("YYYY-MM-DD") usa UTC e no Brasil "volta 1 dia" dependendo do horário)
  const mDateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mDateOnly) {
    const yyyy = Number(mDateOnly[1]);
    const mm = Number(mDateOnly[2]);
    const dd = Number(mDateOnly[3]);
    const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0); // local midnight
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }

  // tenta parse nativo
  const t0 = Date.parse(s);
  if (Number.isFinite(t0)) return t0;

  // fallback para "YYYY-MM-DD HH:mm:ss" (com ou sem segundos)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const hh = Number(m[4] ?? "0");
    const mi = Number(m[5] ?? "0");
    const ss = Number(m[6] ?? "0");
    const d = new Date(yyyy, mm - 1, dd, hh, mi, ss, 0); // local
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }

  return null;
}


function csvCell(value: any) {
  const text = String(value ?? "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function safeFilename(name: string) {
  return String(name || "relatorio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function startOfDayMs(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function endOfDayMs(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

function fmtDateBR(ms: number) {
  try {
    return new Date(ms).toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}
function fmtDateTimeBR(ms: number) {
  try {
    return new Date(ms).toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

function msToLabel(ms: number | null | undefined) {
  if (!ms || !Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}

function avgMs(values: number[]) {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

function toISODateInput(ms: number) {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dayKey(ms: number) {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ticketOpenedMs(t: Ticket): number | null {
  return (
    parseDateMs((t as any)?.opened_at) ??
    parseDateMs((t as any)?.created_at) ??
    parseDateMs((t as any)?.createdAt) ??
    null
  );
}

/* =========================
   Charts (SVG, sem libs)
========================= */
type XY = { x: string; y: number };

function LineChart({
  seriesA,
  seriesB,
  labelA,
  labelB,
  height = 180,
}: {
  seriesA: XY[];
  seriesB?: XY[];
  labelA: string;
  labelB?: string;
  height?: number;
}) {
  const pad = 28;
  const w = 640;
  const h = height;

  const xs = seriesA.map((p) => p.x);
  const maxY = Math.max(1, ...seriesA.map((p) => p.y), ...(seriesB ? seriesB.map((p) => p.y) : []));

  const xToPx = (i: number) => {
    if (xs.length <= 1) return pad;
    const t = i / (xs.length - 1);
    return pad + t * (w - pad * 2);
  };
  const yToPx = (y: number) => {
    const t = y / maxY;
    return (h - pad) - t * (h - pad * 2);
  };

  const pathFor = (s: XY[]) =>
    s
      .map((p, i) => {
        const x = xToPx(i);
        const y = yToPx(p.y);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxY * i) / ticks));

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", minWidth: 360, display: "block" }}>
        {yTicks.map((t, i) => {
          const y = yToPx(t);
          return (
            <g key={i}>
              <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text x={6} y={y + 4} fontSize="10" fill="rgba(233,240,255,0.70)">
                {t}
              </text>
            </g>
          );
        })}

        <path d={pathFor(seriesA)} fill="none" stroke="rgba(255,138,0,0.95)" strokeWidth="3" />
        {seriesB ? <path d={pathFor(seriesB)} fill="none" stroke="rgba(216,162,75,0.95)" strokeWidth="3" /> : null}

        {seriesA.map((p, i) => (
          <circle key={p.x + i} cx={xToPx(i)} cy={yToPx(p.y)} r="3.5" fill="rgba(255,138,0,0.95)" />
        ))}
        {seriesB
          ? seriesB.map((p, i) => (
              <circle key={p.x + i + "_b"} cx={xToPx(i)} cy={yToPx(p.y)} r="3.5" fill="rgba(216,162,75,0.95)" />
            ))
          : null}

        {seriesA.map((p, i) => {
          const show = seriesA.length <= 10 ? true : i % Math.ceil(seriesA.length / 6) === 0 || i === seriesA.length - 1;
          if (!show) return null;
          return (
            <text
              key={"xl" + p.x}
              x={xToPx(i)}
              y={h - 6}
              fontSize="10"
              fill="rgba(233,240,255,0.70)"
              textAnchor="middle"
            >
              {p.x.slice(5)}
            </text>
          );
        })}
      </svg>

      <div className="small" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, opacity: 0.95 }}>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "rgba(255,138,0,0.95)" }} />
          {labelA}
        </span>
        {seriesB && labelB ? (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "rgba(216,162,75,0.95)" }} />
            {labelB}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BarChart({ data, height = 200 }: { data: { label: string; value: number }[]; height?: number }) {
  const w = 640;
  const h = height;
  const pad = 24;
  const maxV = Math.max(1, ...data.map((d) => d.value));
  const barW = (w - pad * 2) / Math.max(1, data.length);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", minWidth: 360, display: "block" }}>
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="rgba(255,255,255,0.10)" />

        {data.map((d, i) => {
          const x = pad + i * barW + 6;
          const bw = Math.max(12, barW - 12);
          const bh = ((h - pad * 2) * d.value) / maxV;
          const y = (h - pad) - bh;

          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={bw}
                height={bh}
                rx={10}
                fill="rgba(194,128,51,0.62)"
                stroke="rgba(255,255,255,0.10)"
              />
              <text x={x + bw / 2} y={y - 6} fontSize="10" fill="rgba(233,240,255,0.75)" textAnchor="middle">
                {d.value}
              </text>
              <text x={x + bw / 2} y={h - 6} fontSize="10" fill="rgba(233,240,255,0.70)" textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PieChart({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const cx = 110;
  const cy = 110;
  const r = 82;

  let acc = 0;
  const arcs = parts.map((p) => {
    const start = (acc / total) * Math.PI * 2;
    acc += p.value;
    const end = (acc / total) * Math.PI * 2;

    const x1 = cx + r * Math.cos(start - Math.PI / 2);
    const y1 = cy + r * Math.sin(start - Math.PI / 2);
    const x2 = cx + r * Math.cos(end - Math.PI / 2);
    const y2 = cy + r * Math.sin(end - Math.PI / 2);

    const large = end - start > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { ...p, d };
  });

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={220} height={220} viewBox="0 0 220 220" style={{ display: "block" }}>
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill={a.color} stroke="rgba(255,255,255,0.10)" />
        ))}
        <circle cx={cx} cy={cy} r={48} fill="rgba(7,15,29,0.95)" stroke="rgba(255,255,255,0.10)" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="14" fill="rgba(233,240,255,0.90)">
          {total}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="rgba(233,240,255,0.70)">
          tickets
        </text>
      </svg>

      <div style={{ display: "grid", gap: 8 }}>
        {parts.map((p) => (
          <div key={p.label} className="small" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: p.color }} />
            <span style={{ fontWeight: 900 }}>{p.label}</span>
            <span style={{ opacity: 0.9 }}>{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================
   Report 6 (tempos via updates)
========================= */
type Times = {
  openedAtMs?: number | null;
  assignedAtMs?: number | null;
  startedAtMs?: number | null;
  closedAtMs?: number | null;
};

function normalizeKind(u: any): string {
  return String(u?.event_type || u?.action || u?.type || "").toUpperCase();
}

function extractTimes(ticket: Ticket, updates: TicketUpdate[]): Times {
  const openedAtMs = ticketOpenedMs(ticket) ?? null;

  let assignedAtMs: number | null = null;
  let startedAtMs: number | null = null;
  let closedAtMs: number | null = null;

  for (const u of updates || []) {
    const k = normalizeKind(u);
    const when = parseDateMs((u as any)?.created_at || (u as any)?.createdAt);
    if (!when) continue;

    if (!assignedAtMs) {
      if (k === "ASSIGN") assignedAtMs = when;
      if (k === "STATUS_CHANGE") {
        try {
          const payload = (u as any)?.payload_json ? JSON.parse((u as any).payload_json) : null;
          const to = normStatus(payload?.to || payload?.to_status || "");
          if (to === "ATRIBUIDO") assignedAtMs = when;
        } catch {}
      }
    }

    if (!startedAtMs) {
      if (k === "START") startedAtMs = when;
      if (k === "STATUS_CHANGE") {
        try {
          const payload = (u as any)?.payload_json ? JSON.parse((u as any).payload_json) : null;
          const to = normStatus(payload?.to || payload?.to_status || "");
          if (to === "EM_ATENDIMENTO") startedAtMs = when;
        } catch {}
      }
    }

    if (!closedAtMs) {
      if (k === "CLOSE") closedAtMs = when;
      if (k === "STATUS_CHANGE") {
        try {
          const payload = (u as any)?.payload_json ? JSON.parse((u as any).payload_json) : null;
          const to = normStatus(payload?.to || payload?.to_status || "");
          if (to === "CONCLUIDO") closedAtMs = when;
        } catch {}
      }
    }
  }

  if (!closedAtMs && isClosedStatus((ticket as any)?.status)) {
    closedAtMs = parseDateMs((ticket as any)?.updated_at) ?? null;
  }

  return { openedAtMs, assignedAtMs, startedAtMs, closedAtMs };
}

/* =========================
   Keywords (problemas)
========================= */
const STOP = new Set([
  "para","com","sem","uma","um","de","da","do","das","dos","no","na","nos","nas",
  "ao","aos","à","às","e","ou","que","por","em","nao","não","mais","menos",
  "onde","quando","como","isso","isto","essa","esse","aquela","aquele","aqui",
  "ali","lá","pra","pro","p","o","a","os","as","te","se","sua","seu","suas","seus",
  "foi","esta","está","estao","estão","fica","ficou","tá","ta"
]);

function topKeywords(texts: string[], n = 10) {
  const m = new Map<string, number>();
  for (const t of texts) {
    const clean = String(t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ");
    for (const w of clean.split(/\s+/).filter(Boolean)) {
      if (w.length < 4) continue;
      if (STOP.has(w)) continue;
      m.set(w, (m.get(w) || 0) + 1);
    }
  }
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ k, v }));
}

/* =========================
   Página
========================= */

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

export default function ReportsPage() {
  const { role } = useAuth();
  const { show, Toast } = useToast();

  const isAdmin = role === "ADMIN";
  const isClient = role === "CLIENT";
  const isMobile = useIsMobile(820);

  // Período default: últimos 30 dias
  const now = Date.now();
  const [preset, setPreset] = React.useState<7 | 30 | 90 | "custom">(30);
  const [from, setFrom] = React.useState<string>(() => toISODateInput(startOfDayMs(new Date(now - 29 * 86400000))));
  const [to, setTo] = React.useState<string>(() => toISODateInput(startOfDayMs(new Date(now))));

  // filtros
  const [networkId, setNetworkId] = React.useState<string>("");
  const [storeId, setStoreId] = React.useState<string>("");
  const [includeDone, setIncludeDone] = React.useState<boolean>(true);

  // SLA: modo (somente abertos por padrão)
  const [slaMode, setSlaMode] = React.useState<"open" | "all">("open");

  // dados auxiliares (admin)
  const [networks, setNetworks] = React.useState<Network[]>([]);
  const [stores, setStores] = React.useState<Store[]>([]);

  // tickets
  const [loading, setLoading] = React.useState<boolean>(true);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loadedAt, setLoadedAt] = React.useState<number | null>(null);

  // report 6 (detalhes)
  const [timesLoading, setTimesLoading] = React.useState<boolean>(false);
  const [timesProgress, setTimesProgress] = React.useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [timesMap, setTimesMap] = React.useState<Record<string, Times>>({});
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

  // aplica preset
  React.useEffect(() => {
    if (preset === "custom") return;
    const days = preset;
    const toMs = startOfDayMs(new Date());
    const fromMs = startOfDayMs(new Date(toMs - (days - 1) * 86400000));
    setFrom(toISODateInput(fromMs));
    setTo(toISODateInput(toMs));
  }, [preset]);

  const periodFromMs = React.useMemo(() => {
    const ms = parseDateMs(from);
    return ms ? startOfDayMs(new Date(ms)) : startOfDayMs(new Date());
  }, [from]);

  const periodToMs = React.useMemo(() => {
    const ms = parseDateMs(to);
    return ms ? endOfDayMs(new Date(ms)) : endOfDayMs(new Date());
  }, [to]);

  const storeById = React.useMemo(() => {
    const m = new Map<string, Store>();
    for (const s of stores || []) m.set(String(s.id), s);
    return m;
  }, [stores]);

  function ticketNetworkId(t: Ticket): string {
    const direct = (t as any)?.network_id;
    if (direct !== null && direct !== undefined && String(direct).trim() !== "") return String(direct);
    const st = storeById.get(String(t.store_id));
    return st?.network_id ? String(st.network_id) : "";
  }

  async function loadMetaAdmin() {
    if (!isAdmin) return;
    try {
      const [ns, ss] = await Promise.all([listNetworks(), listStores()]);
      setNetworks(ns || []);
      setStores(ss || []);
    } catch {
      // não trava
    }
  }

  async function loadTickets() {
    setLoading(true);
    try {
      // pega base (filtros serão aplicados no frontend para garantir)
      const data = await (listTickets as any)({ limit: 500 });
      const arr = Array.isArray(data) ? data : [];
      setTickets(arr);
      setLoadedAt(Date.now());
    } catch (e: any) {
      show(e?.message || "Erro ao carregar tickets", "error");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadMetaAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  React.useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // filtros de Rede/Loja (garantidos)
  const ticketsFiltered = React.useMemo(() => {
    let arr = tickets;

    if (storeId) {
      arr = arr.filter((t) => String(t.store_id) === String(storeId));
    }

    if (isAdmin && networkId) {
      arr = arr.filter((t) => ticketNetworkId(t) === String(networkId));
    }

    return arr;
  }, [tickets, storeId, networkId, isAdmin, storeById]);

  // dataset de período (baseado na data de abertura)
  const ticketsInPeriodOpened = React.useMemo(() => {
    return ticketsFiltered.filter((t) => {
      const o = ticketOpenedMs(t);
      if (!o) return false;
      return o >= periodFromMs && o <= periodToMs;
    });
  }, [ticketsFiltered, periodFromMs, periodToMs]);

  // para relatórios 1/4/5/6 (histórico do período)
  const ticketsForPeriodInsights = React.useMemo(() => {
    // mantém concluídos no histórico do período (faz sentido p/ gráficos)
    return ticketsInPeriodOpened;
  }, [ticketsInPeriodOpened]);

  // para backlog (status atual)
  const ticketsForBacklog = React.useMemo(() => {
    if (includeDone) return ticketsFiltered;
    return ticketsFiltered.filter((t) => !isClosedStatus((t as any)?.status));
  }, [ticketsFiltered, includeDone]);

  /* =========================
     Report 1: séries tempo (período)
  ========================= */
  const daysAxis = React.useMemo(() => {
    const out: string[] = [];
    let cur = startOfDayMs(new Date(periodFromMs));
    const end = startOfDayMs(new Date(periodToMs));
    while (cur <= end) {
      out.push(dayKey(cur));
      cur += 86400000;
    }
    return out;
  }, [periodFromMs, periodToMs]);

  const openedSeries = React.useMemo<XY[]>(() => {
    const c = new Map<string, number>();
    for (const t of ticketsForPeriodInsights) {
      const o = ticketOpenedMs(t);
      if (!o) continue;
      const k = dayKey(o);
      c.set(k, (c.get(k) || 0) + 1);
    }
    return daysAxis.map((d) => ({ x: d, y: c.get(d) || 0 }));
  }, [ticketsForPeriodInsights, daysAxis]);

  const closedSeries = React.useMemo<XY[]>(() => {
    const c = new Map<string, number>();

    for (const t of ticketsForPeriodInsights) {
      if (!isClosedStatus((t as any)?.status)) continue;

      const m = timesMap[String((t as any)?.id)];
      const closeMs = (m?.closedAtMs ?? null) ?? parseDateMs((t as any)?.updated_at) ?? null;

      if (!closeMs) continue;
      if (closeMs < periodFromMs || closeMs > periodToMs) continue;

      const k = dayKey(closeMs);
      c.set(k, (c.get(k) || 0) + 1);
    }

    return daysAxis.map((d) => ({ x: d, y: c.get(d) || 0 }));
  }, [ticketsForPeriodInsights, daysAxis, timesMap, periodFromMs, periodToMs]);

  /* =========================
     Report 2: backlog por status (status atual)
  ========================= */
  const statusCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of ticketsForBacklog) {
      const s = normStatus((t as any)?.status || "—");
      map.set(s, (map.get(s) || 0) + 1);
    }
    const order = ["ABERTO", "ATRIBUIDO", "EM_ATENDIMENTO", "PENDENTE", "CONCLUIDO", "CANCELADO"];
    return order.map((s) => ({ label: s, value: map.get(s) || 0 }));
  }, [ticketsForBacklog]);

  /* =========================
     Report 3: SLA (abertos por padrão)
  ========================= */
  function slaHours(t: Ticket) {
    const p = normStatus((t as any)?.priority);
    return p === "URGENTE" ? 8 : 24;
  }

  const slaStats = React.useMemo(() => {
    let dentro = 0;
    let vencendo = 0;
    let vencido = 0;

    const base =
      slaMode === "all"
        ? ticketsForBacklog // pode incluir concluídos (se includeDone=Sim)
        : ticketsForBacklog.filter((t) => !isClosedStatus((t as any)?.status)); // somente abertos

    for (const t of base) {
      const opened = ticketOpenedMs(t);
      if (!opened) continue;

      const totalMs = slaHours(t) * 3600 * 1000;
      const due = opened + totalMs;

      const done = isClosedStatus((t as any)?.status);

      // se estiver analisando "all" e o ticket estiver fechado, usa closeMs como referência
      const closeMs =
        done
          ? ((timesMap[String((t as any)?.id)]?.closedAtMs ?? null) ?? parseDateMs((t as any)?.updated_at) ?? null)
          : null;

      const ref = done && closeMs ? closeMs : Date.now();

      if (ref > due) {
        vencido++;
      } else {
        const remaining = due - ref;
        const ratio = remaining / totalMs;
        if (!done && ratio <= 0.2) vencendo++;
        else dentro++;
      }
    }

    return { dentro, vencendo, vencido, total: dentro + vencendo + vencido };
  }, [ticketsForBacklog, timesMap, slaMode]);

  /* =========================
     Report 4: top lojas (período)
  ========================= */
  const topStores = React.useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const t of ticketsForPeriodInsights) {
      const id = String((t as any)?.store_id);
      const name = String((t as any)?.store_name || id);
      const it = map.get(id) || { name, count: 0 };
      it.count += 1;
      map.set(id, it);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [ticketsForPeriodInsights]);

  /* =========================
     Report 5: problemas frequentes (período)
  ========================= */
  const topLocals = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of ticketsForPeriodInsights) {
      const local = String((t as any)?.local || "").trim();
      const k = local ? local : "—";
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [ticketsForPeriodInsights]);

  const topWords = React.useMemo(() => {
    const texts = ticketsForPeriodInsights.map((t) => `${(t as any)?.local || ""} ${(t as any)?.problem || ""}`);
    return topKeywords(texts, 10);
  }, [ticketsForPeriodInsights]);

  /* =========================
     Report 6: tempos médios (período)
  ========================= */
  const candidatesForTimes = React.useMemo(() => {
    const ids = new Set<string>();
    for (const t of ticketsForPeriodInsights) ids.add(String((t as any)?.id));
    return Array.from(ids).map((id) => ticketsFiltered.find((t) => String((t as any)?.id) === id)).filter(Boolean) as Ticket[];
  }, [ticketsForPeriodInsights, ticketsFiltered]);

  async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (it: T) => Promise<R>) {
    const results: R[] = [];
    let i = 0;

    const workers = Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx]);
      }
    });

    await Promise.all(workers);
    return results;
  }

  async function computeTimes() {
    if (!candidatesForTimes.length) return;

    setTimesLoading(true);
    setTimesProgress({ done: 0, total: candidatesForTimes.length });

    try {
      const nextMap: Record<string, Times> = { ...timesMap };

      let doneCount = 0;
      const bump = () => {
        doneCount++;
        setTimesProgress({ done: doneCount, total: candidatesForTimes.length });
      };

      await runWithConcurrency(candidatesForTimes, 6, async (t) => {
        const id = String((t as any)?.id);

        // se já tem algo, pula
        if (nextMap[id]?.openedAtMs || nextMap[id]?.closedAtMs) {
          bump();
          return null as any;
        }

        const data = await getTicket(id);
        const updates = (data?.updates || []) as TicketUpdate[];
        const tt = extractTimes(data.ticket as any, updates);
        nextMap[id] = tt;

        bump();
        return null as any;
      });

      setTimesMap(nextMap);
      show("Tempos calculados!", "success");
    } catch (e: any) {
      show(e?.message || "Erro ao calcular tempos", "error");
    } finally {
      setTimesLoading(false);
    }
  }

  const timeMetrics = React.useMemo(() => {
    const toAssume: number[] = [];
    const toStart: number[] = [];
    const toClose: number[] = [];

    for (const t of ticketsForPeriodInsights) {
      const tm = timesMap[String((t as any)?.id)];
      if (!tm) continue;

      const opened = tm.openedAtMs ?? ticketOpenedMs(t);
      if (!opened) continue;

      if (tm.assignedAtMs && tm.assignedAtMs > opened) toAssume.push(tm.assignedAtMs - opened);
      if (tm.startedAtMs && tm.startedAtMs > opened) toStart.push(tm.startedAtMs - opened);
      if (tm.closedAtMs && tm.closedAtMs > opened) toClose.push(tm.closedAtMs - opened);
    }

    return {
      assumeAvg: avgMs(toAssume),
      startAvg: avgMs(toStart),
      closeAvg: avgMs(toClose),
      assumeN: toAssume.length,
      startN: toStart.length,
      closeN: toClose.length,
    };
  }, [ticketsForPeriodInsights, timesMap]);

  // opções de loja derivadas (select)
  const storeOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tickets) {
      map.set(String((t as any)?.store_id), String((t as any)?.store_name || (t as any)?.store_id));
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  /* =========================
     UI
  ========================= */
  const headerRight = (
    <div className="small" style={{ opacity: 0.9, display: "grid", gap: 4, textAlign: "right" }}>
      <div>
        Carregados: <b>{tickets.length}</b> • Após filtros: <b>{ticketsFiltered.length}</b>
      </div>
      {loadedAt ? (
        <div>
          Atualizado: <b>{fmtDateTimeBR(loadedAt)}</b>
        </div>
      ) : null}
    </div>
  );

  const reportsSummary = React.useMemo(() => ({
    opened: ticketsForPeriodInsights.length,
    backlog: ticketsForBacklog.length,
    overdue: slaStats.vencido,
    avgClose: timeMetrics.closeAvg,
  }), [ticketsForPeriodInsights.length, ticketsForBacklog.length, slaStats.vencido, timeMetrics.closeAvg]);

  const filtersSummary = [
    preset === "custom" ? "Período personalizado" : `Período: últimos ${preset} dias`,
    isAdmin ? `Rede: ${networks.find((n: any) => String((n as any)?.id) === networkId)?.name || "Todas"}` : null,
    `Loja: ${storeOptions.find((s) => s.id === storeId)?.name || "Todas"}`,
    `Concluídos: ${includeDone ? "sim" : "não"}`,
  ].filter(Boolean).join(" • ");


  const currentOpenTickets = React.useMemo(() => {
    return ticketsForBacklog.filter((t) => !isClosedStatus((t as any)?.status));
  }, [ticketsForBacklog]);

  const currentUrgentTickets = React.useMemo(() => {
    return currentOpenTickets.filter((t) => normStatus((t as any)?.priority) === "URGENTE");
  }, [currentOpenTickets]);

  const currentPendingTickets = React.useMemo(() => {
    return currentOpenTickets.filter((t) => normStatus((t as any)?.status) === "PENDENTE");
  }, [currentOpenTickets]);

  const currentOverdueTickets = React.useMemo(() => {
    const nowMs = Date.now();
    return currentOpenTickets
      .map((t) => {
        const opened = ticketOpenedMs(t);
        const dueMs = opened ? opened + slaHours(t) * 3600 * 1000 : null;
        return { ticket: t, dueMs, overdue: !!dueMs && dueMs <= nowMs };
      })
      .filter((x) => x.overdue)
      .sort((a, b) => (a.dueMs || 0) - (b.dueMs || 0))
      .map((x) => x.ticket);
  }, [currentOpenTickets]);

  const executiveHighlights = React.useMemo(() => {
    const notes: string[] = [];
    const closedInPeriod = ticketsForPeriodInsights.filter((t) => isClosedStatus((t as any)?.status)).length;
    const openCount = currentOpenTickets.length;
    const periodCount = ticketsForPeriodInsights.length;

    if (periodCount === 0) {
      notes.push("Nenhum chamado foi aberto no período selecionado.");
    } else {
      notes.push(`${periodCount} chamado(s) aberto(s) no período e ${closedInPeriod} concluído(s) dentro do recorte atual.`);
    }

    if (slaStats.vencido > 0) {
      notes.push(`${slaStats.vencido} chamado(s) com SLA vencido exigem priorização imediata.`);
    } else if (slaStats.vencendo > 0) {
      notes.push(`${slaStats.vencendo} chamado(s) estão próximos do vencimento de SLA.`);
    } else {
      notes.push("Nenhum SLA vencido no recorte analisado.");
    }

    if (currentUrgentTickets.length > 0) {
      notes.push(`${currentUrgentTickets.length} chamado(s) urgente(s) continuam em aberto.`);
    }

    if (currentPendingTickets.length > 0) {
      notes.push(`${currentPendingTickets.length} chamado(s) estão pendentes e precisam de acompanhamento.`);
    }

    if (topStores[0]) {
      notes.push(`A loja com maior volume no período é ${topStores[0].name}, com ${topStores[0].count} chamado(s).`);
    }

    if (timeMetrics.closeAvg) {
      notes.push(`Tempo médio de conclusão calculado: ${msToLabel(timeMetrics.closeAvg)}.`);
    } else {
      notes.push("Use “Calcular tempos” para completar os indicadores de produtividade.");
    }

    if (openCount === 0) {
      notes.push("Não há backlog aberto dentro dos filtros atuais.");
    }

    return notes.slice(0, 6);
  }, [ticketsForPeriodInsights, currentOpenTickets.length, currentUrgentTickets.length, currentPendingTickets.length, slaStats.vencido, slaStats.vencendo, topStores, timeMetrics.closeAvg]);

  const attentionTickets = React.useMemo(() => {
    const nowMs = Date.now();
    return currentOpenTickets
      .map((t) => {
        const opened = ticketOpenedMs(t);
        const dueMs = opened ? opened + slaHours(t) * 3600 * 1000 : Number.MAX_SAFE_INTEGER;
        const status = normStatus((t as any)?.status);
        const priority = normStatus((t as any)?.priority);
        let score = 0;
        if (dueMs <= nowMs) score += 1000;
        if (priority === "URGENTE") score += 300;
        if (status === "PENDENTE") score += 180;
        if (status === "ABERTO") score += 80;
        return { t, dueMs, score };
      })
      .sort((a, b) => b.score - a.score || a.dueMs - b.dueMs)
      .slice(0, 6)
      .map((x) => x.t);
  }, [currentOpenTickets]);

  function exportPeriodCsv() {
    const header = [
      "ID",
      "Loja",
      "Rede",
      "CNPJ",
      "Status",
      "Prioridade",
      "Tipo",
      "Local",
      "Problema",
      "Aberto em",
      "Atualizado em",
      "SLA horas",
      "SLA vencido",
    ];

    const rows = ticketsForPeriodInsights.map((t) => {
      const opened = ticketOpenedMs(t);
      const dueMs = opened ? opened + slaHours(t) * 3600 * 1000 : null;
      const overdue = !!dueMs && !isClosedStatus((t as any)?.status) && dueMs <= Date.now();
      return [
        (t as any)?.id,
        (t as any)?.store_name,
        (t as any)?.network_name,
        (t as any)?.store_cnpj || (t as any)?.cnpj,
        prettyStatus((t as any)?.status),
        priorityText((t as any)?.priority),
        (t as any)?.type,
        (t as any)?.local,
        (t as any)?.problem,
        opened ? fmtDateTimeBR(opened) : "",
        parseDateMs((t as any)?.updated_at) ? fmtDateTimeBR(parseDateMs((t as any)?.updated_at) as number) : "",
        slaHours(t),
        overdue ? "Sim" : "Não",
      ].map(csvCell).join(";");
    });

    const csv = [header.map(csvCell).join(";"), ...rows].join("\n");
    const name = safeFilename(`relatorio-rioautocom-${from}-a-${to}`) + ".csv";
    downloadTextFile(name, "\ufeff" + csv, "text/csv;charset=utf-8");
    show("CSV exportado!", "success");
  }

  function printExecutiveReport() {
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <div className="page-shell report-grid">
      <div className="card page-hero">
        <div className="page-hero__head">
          <div>
            <h1 className="page-hero__title">Relatórios</h1>
            <div className="page-hero__sub">
              Acompanhe chamados, prazos, backlog e produtividade do atendimento.
            </div>
          </div>
          <div className="page-hero__actions report-actions-top">
            {headerRight}
            <div className="row no-print" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={exportPeriodCsv} disabled={loading || ticketsForPeriodInsights.length === 0}>
                Exportar CSV
              </button>
              <button className="btn accentB" type="button" onClick={printExecutiveReport}>
                Imprimir / PDF
              </button>
            </div>
          </div>
        </div>

        <div className="page-kpis">
          <div className="page-kpi">
            <div className="page-kpi__label">Abertos no período</div>
            <div className="page-kpi__value">{reportsSummary.opened}</div>
            <div className="page-kpi__hint">Chamados criados no recorte.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Backlog atual</div>
            <div className="page-kpi__value">{reportsSummary.backlog}</div>
            <div className="page-kpi__hint">Chamados ainda em aberto.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">SLA vencido</div>
            <div className="page-kpi__value">{reportsSummary.overdue}</div>
            <div className="page-kpi__hint">Atenção fora do prazo.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Tempo médio até concluir</div>
            <div className="page-kpi__value">{msToLabel(reportsSummary.avgClose)}</div>
            <div className="page-kpi__hint">Média dos chamados concluídos.</div>
          </div>
        </div>
      </div>

      <div className="card page-section-card filters-sticky">
        <div className="page-section-head">
          <div>
            <h2 className="page-section-title">Filtros do relatório</h2>
            <div className="page-section-sub">Ajuste o recorte e leia os indicadores com mais clareza.</div>
          </div>
          {isMobile ? (
            <button className="btn page-mobile-toggle" type="button" onClick={() => setMobileFiltersOpen((v) => !v)}>
              {mobileFiltersOpen ? "Ocultar filtros" : "Mostrar filtros"}
            </button>
          ) : null}
        </div>

        {isMobile ? <div className="page-mobile-summary">{filtersSummary}</div> : null}

        {(!isMobile || mobileFiltersOpen) ? (
          <>
            <div className="grid page-mobile-filter-grid">
              <div className="col-3">
                <label>Período</label>
                <FancySelect
                  value={String(preset)}
                  onChange={(value) => setPreset((value === "custom" ? "custom" : Number(value)) as any)}
                  options={[
                    { value: "7", label: "Últimos 7 dias" },
                    { value: "30", label: "Últimos 30 dias" },
                    { value: "90", label: "Últimos 90 dias" },
                    { value: "custom", label: "Personalizado" },
                  ]}
                />
              </div>

              <div className="col-3">
                <label>De</label>
                <input className="input" type="date" value={from} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} />
              </div>

              <div className="col-3">
                <label>Até</label>
                <input className="input" type="date" value={to} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} />
              </div>

              <div className="col-3">
                <label>Incluir concluídos</label>
                <FancySelect
                  value={includeDone ? "1" : "0"}
                  onChange={(value) => setIncludeDone(value === "1")}
                  options={[
                    { value: "1", label: "Sim" },
                    { value: "0", label: "Não" },
                  ]}
                />
              </div>

              {isAdmin && (
                <div className="col-6">
                  <label>Rede (Admin)</label>
                  <FancySelect
                    value={networkId}
                    onChange={setNetworkId}
                    placeholder="Todas"
                    options={networks.map((n) => ({ value: String((n as any)?.id), label: String((n as any)?.name || "—") }))}
                  />
                  <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
                    Filtro aplicado sobre os dados carregados na tela.
                  </div>
                </div>
              )}

              <div className={isAdmin ? "col-6" : "col-12"}>
                <label>Loja</label>
                <FancySelect
                  value={storeId}
                  onChange={setStoreId}
                  placeholder="Todas"
                  options={storeOptions.map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
            </div>

            <div className="sep" />
          </>
        ) : null}

        <div className="row page-mobile-actions-row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div className="small" style={{ opacity: 0.9 }}>
            Período (abertura): <b>{fmtDateBR(periodFromMs)}</b> até <b>{fmtDateBR(periodToMs)}</b> • Chamados abertos no período:{" "}
            <b>{ticketsForPeriodInsights.length}</b> • Backlog (status atual): <b>{ticketsForBacklog.length}</b>
          </div>

          <div className="row page-mobile-actions-row__buttons" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={loadTickets} disabled={loading}>
              {loading ? "Carregando..." : "Recarregar"}
            </button>
            <button
              className="btn accentB"
              onClick={computeTimes}
              disabled={timesLoading || candidatesForTimes.length === 0}
              title="Calcula tempos lendo o histórico (getTicket). Pode levar alguns segundos em muitos tickets."
            >
              {timesLoading ? `Calculando tempos... (${timesProgress.done}/${timesProgress.total})` : "Calcular tempos"}
            </button>
          </div>
        </div>
      </div>

      <div className="card page-section-card report-executive print-focus">
        <div className="page-section-head">
          <div>
            <h2 className="page-section-title">Resumo executivo</h2>
            <div className="page-section-sub">
              Síntese do período para reunião, acompanhamento interno ou envio ao cliente.
            </div>
          </div>
          <div className="badge accentB">{fmtDateBR(periodFromMs)} a {fmtDateBR(periodToMs)}</div>
        </div>

        <div className="report-executive__grid">
          <div className="report-executive__panel">
            <div className="report-executive__eyebrow">Leitura do período</div>
            <ul className="report-executive__list">
              {executiveHighlights.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>

          <div className="report-executive__panel">
            <div className="report-executive__eyebrow">Atenção operacional</div>
            {attentionTickets.length === 0 ? (
              <div className="small">Nenhum chamado aberto exigindo destaque dentro dos filtros atuais.</div>
            ) : (
              <div className="report-attention-list">
                {attentionTickets.map((t) => {
                  const opened = ticketOpenedMs(t);
                  const dueMs = opened ? opened + slaHours(t) * 3600 * 1000 : null;
                  const overdue = !!dueMs && dueMs <= Date.now();
                  return (
                    <div key={String((t as any)?.id)} className="report-attention-item">
                      <div>
                        <b>{String((t as any)?.store_name || "Loja")}</b>
                        <div className="small">
                          {String((t as any)?.problem || (t as any)?.local || "Chamado sem descrição")}
                        </div>
                      </div>
                      <div className="report-attention-item__badges">
                        <span className={"badge mini " + (overdue ? "danger" : "")}>{overdue ? "SLA vencido" : prettyStatus((t as any)?.status)}</span>
                        <span className={"badge mini " + (normStatus((t as any)?.priority) === "URGENTE" ? "danger" : "")}>{priorityText((t as any)?.priority)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 1) Volume por dia (período) */}
      <div className="card page-section-card">
        <div className="page-section-head"><div><h2 className="page-section-title">Volume de chamados</h2><div className="page-section-sub">Abertos e concluídos dentro do período selecionado.</div></div></div>
        <LineChart seriesA={openedSeries} seriesB={closedSeries} labelA="Abertos" labelB="Concluídos" />
      </div>

      {/* 2) Backlog por status (status atual) */}
      <div className="card page-section-card">
        <div className="page-section-head"><div><h2 className="page-section-title">Backlog por status</h2><div className="page-section-sub">Distribuição atual por etapa de atendimento.</div></div></div>
        <BarChart data={statusCounts} />
      </div>

      {/* 3) SLA (abertos por padrão) */}
      <div className="card page-section-card">
        <div className="page-section-head"><div><h2 className="page-section-title">SLA e vencimentos</h2><div className="page-section-sub">Prazos atuais dos chamados abertos.</div></div></div>
        <div className="grid" style={{ marginBottom: 10 }}>
          <div className="col-4">
            <label>Analisar SLA</label>
            <FancySelect
              value={slaMode}
              onChange={(value) => setSlaMode(value as any)}
              options={[
                { value: "open", label: "Somente abertos", hint: "Situação atual" },
                { value: "all", label: "Abertos + concluídos", hint: "Histórico" },
              ]}
            />
          </div>
          <div className="col-8 small" style={{ opacity: 0.85, alignSelf: "end" }}>
            * “Somente abertos” evita contar “vencido” por ticket que já foi concluído (a não ser que você queira histórico).
          </div>
        </div>

        <PieChart
          parts={[
            { label: "Dentro do prazo", value: slaStats.dentro, color: "rgba(46,204,113,0.85)" },
            { label: "Vencendo", value: slaStats.vencendo, color: "rgba(241,196,15,0.85)" },
            { label: "Vencidos", value: slaStats.vencido, color: "rgba(255,77,79,0.85)" },
          ]}
        />

        <div className="small" style={{ marginTop: 10, opacity: 0.9 }}>
          Total analisado: <b>{slaStats.total}</b>
        </div>
      </div>

      {/* 4) Top lojas (período) */}
      <div className="card page-section-card">
        <div className="page-section-head"><div><h2 className="page-section-title">Lojas com mais chamados</h2><div className="page-section-sub">Ranking do período selecionado.</div></div></div>
        {topStores.length === 0 ? (
          <div className="small">Sem dados no período.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Loja</th>
                <th style={{ width: 120 }}>Chamados</th>
              </tr>
            </thead>
            <tbody>
              {topStores.map((s) => (
                <tr key={s.id}>
                  <td className="wrap-anywhere">{s.name}</td>
                  <td><span className="badge accentB">{s.count}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 5) Problemas frequentes (período) */}
      <div className="card page-section-card">
        <div className="page-section-head"><div><h2 className="page-section-title">Problemas frequentes</h2><div className="page-section-sub">Locais e termos mais recorrentes nos chamados.</div></div></div>
        <div className="grid">
          <div className="col-6">
            <div className="h2" style={{ marginBottom: 8 }}>Top Locais</div>
            <BarChart data={topLocals.map((x) => ({ label: x.label.length > 10 ? x.label.slice(0, 10) + "…" : x.label, value: x.value }))} />
            <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
              * O rótulo pode ser abreviado no gráfico.
            </div>
          </div>

          <div className="col-6">
            <div className="h2" style={{ marginBottom: 8 }}>Top Palavras-chave</div>
            {topWords.length === 0 ? (
              <div className="small">Sem texto suficiente para extrair palavras-chave.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {topWords.map((w) => (
                  <div key={w.k} className="row" style={{ justifyContent: "space-between" }}>
                    <div className="badge">{w.k}</div>
                    <div className="badge accent">{w.v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6) Tempos médios (período) */}
      <div className="card page-section-card">
        <div className="page-section-head"><div><h2 className="page-section-title">Tempo médio de atendimento</h2><div className="page-section-sub">Médias de assumir, iniciar e concluir chamados.</div></div></div>
        <div className="grid">
          <div className="col-4">
            <div className="page-soft-card">
              <div className="small">Tempo médio até assumir</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{msToLabel(timeMetrics.assumeAvg)}</div>
              <div className="small" style={{ opacity: 0.85, marginTop: 6 }}>amostra: {timeMetrics.assumeN}</div>
            </div>
          </div>
          <div className="col-4">
            <div className="page-soft-card">
              <div className="small">Tempo médio até iniciar</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{msToLabel(timeMetrics.startAvg)}</div>
              <div className="small" style={{ opacity: 0.85, marginTop: 6 }}>amostra: {timeMetrics.startN}</div>
            </div>
          </div>
          <div className="col-4">
            <div className="page-soft-card">
              <div className="small">Tempo médio até concluir</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{msToLabel(timeMetrics.closeAvg)}</div>
              <div className="small" style={{ opacity: 0.85, marginTop: 6 }}>amostra: {timeMetrics.closeN}</div>
            </div>
          </div>
        </div>

        {!Object.keys(timesMap).length ? (
          <div className="small" style={{ marginTop: 12, opacity: 0.9 }}>
            Clique em <b>Calcular tempos</b> para atualizar as médias.
          </div>
        ) : null}

        {timesLoading ? (
          <div className="small" style={{ marginTop: 10, opacity: 0.9 }}>
            Processando histórico… {timesProgress.done}/{timesProgress.total}
          </div>
        ) : null}
      </div>

      <Toast />
    </div>
  );
}
