import React from "react";
import {
  AnyDeskAccess,
  adminListAnyDeskAccesses,
  adminCreateAnyDeskAccess,
  adminUpdateAnyDeskAccess,
  adminDeleteAnyDeskAccess,
  adminListStores,
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

type NetworkOption = {
  key: string;
  label: string;
};

type FormState = {
  store_id: string;
  label: string;
  anydesk_id: string;
  notes: string;
  active: boolean;
};

type StatusFilter = "all" | "active" | "inactive";
type ViewMode = "cards" | "table";

const EMPTY_FORM: FormState = {
  store_id: "",
  label: "",
  anydesk_id: "",
  notes: "",
  active: true,
};

const NO_NETWORK_FILTER = "__NO_NETWORK__";
const RECENT_DAYS = 45;

function safeStr(v: unknown) {
  return v == null ? "" : String(v).trim();
}

function normalizeSearch(v: unknown) {
  return safeStr(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeAnyDeskId(v: string) {
  return safeStr(v).replace(/\s+/g, "");
}

function normalizeAnyDeskDigits(v: string) {
  return normalizeAnyDeskId(v).replace(/\D/g, "");
}

function formatAnyDeskId(v: string) {
  const digits = normalizeAnyDeskDigits(v);
  if (!digits) return safeStr(v);
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

function formatDateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecentlyUpdated(v?: string | null) {
  if (!v) return false;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  const diffMs = Date.now() - d.getTime();
  return diffMs <= RECENT_DAYS * 24 * 60 * 60 * 1000;
}

function csvCell(v: unknown) {
  const raw = safeStr(v).replace(/"/g, '""');
  return `"${raw}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function getNetworkNameFromStore(s?: StoreItem) {
  if (!s) return "";
  return safeStr(s.network_name || s.rede_name);
}

function getNetworkIdFromStore(s?: StoreItem) {
  if (!s) return "";
  return safeStr(s.network_id || s.rede_id);
}

function getNetworkKeyFromStore(s?: StoreItem) {
  if (!s) return NO_NETWORK_FILTER;
  const id = getNetworkIdFromStore(s);
  const name = getNetworkNameFromStore(s);

  if (id) return `id:${id}`;
  if (name) return `name:${name.toLowerCase()}`;
  return NO_NETWORK_FILTER;
}

function storeOptionLabel(s: StoreItem) {
  const net = getNetworkNameFromStore(s);
  return net ? `${net} - ${s.name}` : s.name;
}

function getItemStoreName(item: AnyDeskAccess, storeById: Map<string, StoreItem>, storeNameById: Map<string, string>) {
  return safeStr(item.store_name) || storeNameById.get(String(item.store_id)) || safeStr(item.store_id) || "Loja não identificada";
}

function getAccessRisk(item: AnyDeskAccess, duplicateIds: Set<string>) {
  const id = normalizeAnyDeskDigits(item.anydesk_id);
  if (item.active === false) return { label: "Inativo", className: "warn", hint: "Acesso desativado" };
  if (!id) return { label: "Sem ID", className: "danger", hint: "Complete o AnyDesk" };
  if (duplicateIds.has(id)) return { label: "Duplicado", className: "warn", hint: "Mesmo ID em mais de um cadastro" };
  if (!isRecentlyUpdated(item.updated_at || item.created_at)) return { label: "Revisar", className: "accent", hint: `Sem atualização recente (${RECENT_DAYS}+ dias)` };
  return { label: "Ok", className: "ok", hint: "Cadastro ativo" };
}

function useIsMobile(breakpointPx = 860) {
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

async function copyText(text: string) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function MiniStat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint: string; tone?: "ok" | "warn" | "danger" | "accent" }) {
  const toneStyle: React.CSSProperties =
    tone === "ok"
      ? { borderColor: "rgba(34,197,94,.32)", background: "linear-gradient(135deg, rgba(34,197,94,.12), rgba(255,255,255,.035))" }
      : tone === "warn"
      ? { borderColor: "rgba(245,158,11,.36)", background: "linear-gradient(135deg, rgba(245,158,11,.13), rgba(255,255,255,.035))" }
      : tone === "danger"
      ? { borderColor: "rgba(239,68,68,.34)", background: "linear-gradient(135deg, rgba(239,68,68,.14), rgba(255,255,255,.035))" }
      : tone === "accent"
      ? { borderColor: "rgba(245,177,75,.36)", background: "linear-gradient(135deg, rgba(245,177,75,.15), rgba(255,255,255,.035))" }
      : {};

  return (
    <div className="page-kpi" style={toneStyle}>
      <div className="page-kpi__label">{label}</div>
      <div className="page-kpi__value">{value}</div>
      <div className="page-kpi__hint">{hint}</div>
    </div>
  );
}

function CopyButton({ children, onClick, className = "btn" }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button className={className} onClick={onClick} type="button">
      {children}
    </button>
  );
}

export default function AccessesPage() {
  const { role } = useAuth();
  const { show, Toast } = useToast();

  const isAdmin = role === "ADMIN";
  const isMobile = useIsMobile(860);

  const [loading, setLoading] = React.useState(true);
  const [storesLoading, setStoresLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string>("");

  const [stores, setStores] = React.useState<StoreItem[]>([]);
  const [items, setItems] = React.useState<AnyDeskAccess[]>([]);

  const [q, setQ] = React.useState("");
  const [networkFilter, setNetworkFilter] = React.useState("");
  const [storeFilter, setStoreFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("active");
  const [viewMode, setViewMode] = React.useState<ViewMode>("cards");
  const [selectedId, setSelectedId] = React.useState<string>("");

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AnyDeskAccess | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  const fetchStores = async () => {
    if (!isAdmin) return;

    setStoresLoading(true);
    try {
      const [storesList, networksList] = await Promise.all([adminListStores(), listNetworks()]);

      const networkNameById = new Map<string, string>();
      (networksList || []).forEach((n: any) => {
        const id = n?.id != null ? String(n.id) : "";
        const name = safeStr(n?.name);
        if (id && name) networkNameById.set(id, name);
      });

      setStores(
        (storesList || []).map((s: any) => {
          const network_id =
            s.network_id != null
              ? String(s.network_id)
              : s.rede_id != null
              ? String(s.rede_id)
              : s.network?.id != null
              ? String(s.network.id)
              : s.rede?.id != null
              ? String(s.rede.id)
              : undefined;

          const network_name_raw =
            s.network_name != null
              ? String(s.network_name)
              : s.rede_name != null
              ? String(s.rede_name)
              : s.network?.name != null
              ? String(s.network.name)
              : s.rede?.name != null
              ? String(s.rede.name)
              : undefined;

          const network_name =
            (network_name_raw && network_name_raw.trim()) ||
            (network_id && networkNameById.get(network_id)) ||
            undefined;

          return {
            id: String(s.id),
            name: String(s.name ?? s.store_name ?? ""),
            cnpj: s.cnpj ? String(s.cnpj) : undefined,
            active: s?.active === false ? false : true,
            network_id,
            network_name,
            rede_id: s.rede_id != null ? String(s.rede_id) : undefined,
            rede_name: s.rede_name != null ? String(s.rede_name) : undefined,
          };
        })
      );
    } catch (err: any) {
      show(err?.message || "Erro ao carregar lojas", "error");
    } finally {
      setStoresLoading(false);
    }
  };

  const fetchAccesses = async (params?: { q?: string; store_id?: string }) => {
    if (!isAdmin) return;

    setLoading(true);
    try {
      const list = await adminListAnyDeskAccesses({
        q: params?.q ?? undefined,
        store_id: params?.store_id ?? undefined,
      });
      setItems(list || []);
    } catch (err: any) {
      show(err?.message || "Erro ao carregar acessos", "error");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (!isAdmin) return;

    let alive = true;

    (async () => {
      await fetchStores();
      if (!alive) return;
      await fetchAccesses({ q: undefined, store_id: undefined });
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const storeById = React.useMemo(() => {
    const map = new Map<string, StoreItem>();
    for (const s of stores) map.set(String(s.id), s);
    return map;
  }, [stores]);

  const storeNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stores) map.set(String(s.id), storeOptionLabel(s));
    return map;
  }, [stores]);

  const networkOptions = React.useMemo<NetworkOption[]>(() => {
    const map = new Map<string, string>();
    let hasNoNetwork = false;

    for (const s of stores) {
      const key = getNetworkKeyFromStore(s);
      const name = getNetworkNameFromStore(s);

      if (key === NO_NETWORK_FILTER) {
        hasNoNetwork = true;
        continue;
      }

      if (!map.has(key)) map.set(key, name || "Sem nome");
    }

    const opts = Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    if (hasNoNetwork) opts.push({ key: NO_NETWORK_FILTER, label: "Sem rede" });
    return opts;
  }, [stores]);

  const storeOptions = React.useMemo(() => {
    let list = [...stores];
    if (networkFilter) list = list.filter((s) => getNetworkKeyFromStore(s) === networkFilter);
    list.sort((a, b) => storeOptionLabel(a).localeCompare(storeOptionLabel(b)));
    return list;
  }, [stores, networkFilter]);

  React.useEffect(() => {
    if (!storeFilter) return;
    const ok = storeOptions.some((s) => String(s.id) === String(storeFilter));
    if (!ok) setStoreFilter("");
  }, [networkFilter, storeOptions, storeFilter]);

  const duplicateIds = React.useMemo(() => {
    const count = new Map<string, number>();
    for (const item of items) {
      const id = normalizeAnyDeskDigits(item.anydesk_id);
      if (!id) continue;
      count.set(id, (count.get(id) || 0) + 1);
    }

    return new Set(Array.from(count.entries()).filter(([, qty]) => qty > 1).map(([id]) => id));
  }, [items]);

  const filteredItems = React.useMemo(() => {
    const term = normalizeSearch(q);
    let list = [...items];

    if (networkFilter) {
      list = list.filter((item) => getNetworkKeyFromStore(storeById.get(String(item.store_id))) === networkFilter);
    }

    if (storeFilter) list = list.filter((item) => String(item.store_id) === String(storeFilter));

    if (statusFilter === "active") list = list.filter((x) => x.active !== false);
    if (statusFilter === "inactive") list = list.filter((x) => x.active === false);

    if (term) {
      list = list.filter((item) => {
        const store = storeById.get(String(item.store_id));
        const haystack = [
          item.label,
          item.anydesk_id,
          item.notes,
          item.store_id,
          item.store_name,
          storeOptionLabel(store || { id: String(item.store_id), name: safeStr(item.store_name) }),
          store?.cnpj,
          getNetworkNameFromStore(store),
        ]
          .map(normalizeSearch)
          .join(" ");
        return haystack.includes(term);
      });
    }

    list.sort((a, b) => {
      const storeA = getItemStoreName(a, storeById, storeNameById);
      const storeB = getItemStoreName(b, storeById, storeNameById);
      const byStore = storeA.localeCompare(storeB);
      if (byStore !== 0) return byStore;

      const byLabel = safeStr(a.label).localeCompare(safeStr(b.label));
      if (byLabel !== 0) return byLabel;

      return safeStr(a.anydesk_id).localeCompare(safeStr(b.anydesk_id));
    });

    return list;
  }, [items, networkFilter, storeFilter, statusFilter, q, storeById, storeNameById]);

  const selectedItem = React.useMemo(() => {
    if (!selectedId) return filteredItems[0] || null;
    return filteredItems.find((item) => String(item.id) === String(selectedId)) || filteredItems[0] || null;
  }, [filteredItems, selectedId]);

  React.useEffect(() => {
    if (!selectedItem) return;
    setSelectedId(String(selectedItem.id));
  }, [selectedItem]);

  const accessesSummary = React.useMemo(() => {
    const activeItems = items.filter((x) => x.active !== false);
    const inactiveItems = items.filter((x) => x.active === false);
    const storeIdsWithAccess = new Set(activeItems.map((x) => String(x.store_id)));
    const activeStores = stores.filter((s) => s.active !== false);
    const storesWithoutAccess = activeStores.filter((s) => !storeIdsWithAccess.has(String(s.id))).length;
    const reviewCount = items.filter((x) => {
      const risk = getAccessRisk(x, duplicateIds);
      return risk.label === "Revisar" || risk.label === "Duplicado" || risk.label === "Sem ID";
    }).length;

    return {
      total: items.length,
      visible: filteredItems.length,
      active: activeItems.length,
      inactive: inactiveItems.length,
      stores: new Set(activeItems.map((x) => String(x.store_id))).size,
      networks: new Set(activeItems.map((x) => getNetworkKeyFromStore(storeById.get(String(x.store_id)))).filter(Boolean)).size,
      storesWithoutAccess,
      duplicated: duplicateIds.size,
      review: reviewCount,
    };
  }, [items, filteredItems.length, stores, storeById, duplicateIds]);

  const networkSummary = React.useMemo(() => {
    const map = new Map<string, { key: string; name: string; total: number; active: number; stores: Set<string> }>();

    for (const item of items) {
      const store = storeById.get(String(item.store_id));
      const key = getNetworkKeyFromStore(store);
      const name = getNetworkNameFromStore(store) || "Sem rede";
      const current = map.get(key) || { key, name, total: 0, active: 0, stores: new Set<string>() };
      current.total += 1;
      if (item.active !== false) current.active += 1;
      current.stores.add(String(item.store_id));
      map.set(key, current);
    }

    return Array.from(map.values())
      .map((x) => ({ ...x, storesCount: x.stores.size }))
      .sort((a, b) => b.active - a.active)
      .slice(0, 6);
  }, [items, storeById]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (item: AnyDeskAccess) => {
    setEditing(item);
    setForm({
      store_id: String(item.store_id),
      label: safeStr(item.label),
      anydesk_id: safeStr(item.anydesk_id),
      notes: safeStr(item.notes),
      active: item.active !== false,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const validateForm = () => {
    if (!form.store_id) {
      show("Selecione a loja.", "error");
      return false;
    }
    if (!safeStr(form.label)) {
      show("Informe a identificação do acesso. Ex.: Servidor, Caixa 1.", "error");
      return false;
    }
    if (!normalizeAnyDeskId(form.anydesk_id)) {
      show("Informe o ID do AnyDesk.", "error");
      return false;
    }
    return true;
  };

  const onSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const payload = {
        store_id: form.store_id,
        label: safeStr(form.label),
        anydesk_id: normalizeAnyDeskId(form.anydesk_id),
        notes: safeStr(form.notes) || undefined,
        active: !!form.active,
      };

      let saved: AnyDeskAccess | null = null;
      if (editing) {
        saved = await adminUpdateAnyDeskAccess(editing.id, payload);
        show("Acesso atualizado!", "success");
      } else {
        saved = await adminCreateAnyDeskAccess(payload);
        show("Acesso criado!", "success");
      }

      closeModal();
      await fetchAccesses({ q: undefined, store_id: undefined });
      if (saved?.id) setSelectedId(String(saved.id));
    } catch (err: any) {
      show(err?.message || "Erro ao salvar acesso", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (item: AnyDeskAccess) => {
    const ok = window.confirm(
      `Excluir o acesso "${item.label}" da loja "${getItemStoreName(item, storeById, storeNameById)}"?`
    );
    if (!ok) return;

    setDeletingId(String(item.id));
    try {
      await adminDeleteAnyDeskAccess(item.id);
      show("Acesso excluído!", "success");
      if (selectedId === String(item.id)) setSelectedId("");
      await fetchAccesses({ q: undefined, store_id: undefined });
    } catch (err: any) {
      show(err?.message || "Erro ao excluir acesso", "error");
    } finally {
      setDeletingId("");
    }
  };

  const onCopy = async (item: AnyDeskAccess) => {
    try {
      await copyText(normalizeAnyDeskId(item.anydesk_id));
      show("ID copiado!", "success");
    } catch {
      show("Não foi possível copiar o ID.", "error");
    }
  };

  const onCopyCard = async (item: AnyDeskAccess) => {
    const store = storeById.get(String(item.store_id));
    const lines = [
      `Loja: ${getItemStoreName(item, storeById, storeNameById)}`,
      getNetworkNameFromStore(store) ? `Rede: ${getNetworkNameFromStore(store)}` : "",
      store?.cnpj ? `CNPJ: ${store.cnpj}` : "",
      `Acesso: ${safeStr(item.label)}`,
      `AnyDesk: ${formatAnyDeskId(item.anydesk_id)}`,
      safeStr(item.notes) ? `Observações: ${safeStr(item.notes)}` : "",
    ].filter(Boolean);

    try {
      await copyText(lines.join("\n"));
      show("Resumo do acesso copiado!", "success");
    } catch {
      show("Não foi possível copiar o resumo.", "error");
    }
  };

  const onOpenAnyDesk = async (item: AnyDeskAccess) => {
    const id = normalizeAnyDeskId(item.anydesk_id);
    if (!id) {
      show("ID do AnyDesk inválido.", "error");
      return;
    }

    try {
      window.location.href = `anydesk:${id}`;
      window.setTimeout(async () => {
        try {
          await copyText(id);
          show("Tentando abrir o AnyDesk. Se não abrir, o ID já foi copiado.", "success");
        } catch {
          show("Tentando abrir o AnyDesk.", "success");
        }
      }, 150);
    } catch {
      try {
        await copyText(id);
        show("Não foi possível abrir o AnyDesk. ID copiado.", "error");
      } catch {
        show("Não foi possível abrir o AnyDesk.", "error");
      }
    }
  };

  const onExportCsv = () => {
    const rows = [
      ["Rede", "Loja", "CNPJ", "Identificacao", "AnyDesk", "Status", "Atualizado em", "Observacoes"],
      ...filteredItems.map((item) => {
        const store = storeById.get(String(item.store_id));
        return [
          getNetworkNameFromStore(store) || "Sem rede",
          getItemStoreName(item, storeById, storeNameById),
          store?.cnpj || "",
          item.label,
          normalizeAnyDeskId(item.anydesk_id),
          item.active !== false ? "Ativo" : "Inativo",
          formatDateTime(item.updated_at || item.created_at),
          item.notes || "",
        ];
      }),
    ];

    downloadCsv(`cofre-acessos-rioautocom-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    show("CSV de acessos gerado.", "success");
  };

  const onRefreshAll = async () => {
    await fetchStores();
    await fetchAccesses({ q: undefined, store_id: undefined });
  };

  const clearFilters = async () => {
    setQ("");
    setNetworkFilter("");
    setStoreFilter("");
    setStatusFilter("active");
    await fetchAccesses({ q: undefined, store_id: undefined });
  };

  if (!isAdmin) {
    return (
      <div className="page-shell accesses-page">
        <div className="card page-hero">
          <div className="page-hero__head">
            <div>
              <h1 className="page-hero__title">Cofre de acessos</h1>
              <div className="page-hero__sub">Somente administradores.</div>
            </div>
          </div>
        </div>
        <Toast />
      </div>
    );
  }

  return (
    <div className="page-shell accesses-page">
      <div className="card page-hero" style={{ overflow: "hidden" }}>
        <div className="page-hero__head">
          <div>
            <div className="badge accent" style={{ marginBottom: 10 }}>Acessos 2.0</div>
            <h1 className="page-hero__title">Cofre de acessos</h1>
            <div className="page-hero__sub">
              Consulte, copie e organize acessos remotos por loja, rede e status operacional.
            </div>
          </div>

          <div className="page-hero__actions">
            <button className="btn" onClick={onRefreshAll} disabled={loading || storesLoading} type="button">
              {loading || storesLoading ? "Atualizando..." : "Atualizar"}
            </button>
            <button className="btn" onClick={onExportCsv} disabled={filteredItems.length === 0} type="button">
              Exportar CSV
            </button>
            <button className="btn primary" onClick={openCreate} type="button">
              + Novo acesso
            </button>
          </div>
        </div>

        <div className="page-kpis">
          <MiniStat label="Acessos ativos" value={accessesSummary.active} hint={`${accessesSummary.total} cadastro(s) no total.`} tone="ok" />
          <MiniStat label="Lojas cobertas" value={accessesSummary.stores} hint="Com pelo menos um acesso ativo." tone="accent" />
          <MiniStat label="Sem acesso" value={accessesSummary.storesWithoutAccess} hint="Lojas ativas sem acesso cadastrado." tone={accessesSummary.storesWithoutAccess ? "warn" : "ok"} />
          <MiniStat label="Revisar" value={accessesSummary.review} hint="Duplicados, sem ID ou antigos." tone={accessesSummary.review ? "warn" : "ok"} />
        </div>

        <div
          className="card"
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 18,
            background: "linear-gradient(135deg, rgba(245,177,75,.12), rgba(255,255,255,.035))",
            border: "1px solid rgba(245,177,75,.18)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Acessos organizados para atendimento</div>
              <div className="small" style={{ marginTop: 4 }}>
                Pesquise por loja, CNPJ, rede, identificação, AnyDesk ou observação. Use “Copiar resumo” para agilizar o atendimento.
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="badge">{accessesSummary.visible} visível(eis)</span>
              <span className="badge">{accessesSummary.networks} rede(s)</span>
              <span className="badge warn">{accessesSummary.inactive} inativo(s)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card page-section-card page-toolbar accesses-filter-card">
        <div className="page-section-head">
          <div>
            <h2 className="page-section-title">Filtros de acesso</h2>
            <div className="page-section-sub">Localize rapidamente a loja, rede ou identificação do acesso remoto.</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className={`btn ${viewMode === "cards" ? "primary" : ""}`} onClick={() => setViewMode("cards")} type="button">
              Cards
            </button>
            <button className={`btn ${viewMode === "table" ? "primary" : ""}`} onClick={() => setViewMode("table")} type="button">
              Tabela
            </button>
          </div>
        </div>

        <div className="grid">
          <div className={isMobile ? "col-12" : "col-4"}>
            <label>Buscar</label>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Loja, CNPJ, rede, AnyDesk, observação..."
            />
          </div>

          <div className={isMobile ? "col-12" : "col-3"}>
            <label>Rede</label>
            <FancySelect
              value={networkFilter}
              onChange={setNetworkFilter}
              disabled={storesLoading}
              placeholder={storesLoading ? "Carregando redes..." : "Todas as redes"}
              options={networkOptions.map((n) => ({ value: n.key, label: n.label }))}
            />
          </div>

          <div className={isMobile ? "col-12" : "col-3"}>
            <label>Loja</label>
            <FancySelect
              value={storeFilter}
              onChange={setStoreFilter}
              disabled={storesLoading}
              placeholder={storesLoading ? "Carregando lojas..." : "Todas as lojas"}
              options={storeOptions.map((s) => ({ value: s.id, label: storeOptionLabel(s), hint: s.cnpj }))}
            />
          </div>

          <div className={isMobile ? "col-12" : "col-2"}>
            <label>Status</label>
            <FancySelect
              value={statusFilter}
              onChange={(value) => setStatusFilter((value || "active") as StatusFilter)}
              placeholder="Ativos"
              options={[
                { value: "active", label: "Ativos" },
                { value: "all", label: "Todos" },
                { value: "inactive", label: "Inativos" },
              ]}
            />
          </div>

          <div className="col-12">
            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
              <div className="small">
                Mostrando <b>{filteredItems.length}</b> de <b>{items.length}</b> acesso(s).
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => fetchAccesses({ q: q.trim() || undefined, store_id: storeFilter || undefined })} disabled={loading} type="button">
                  Aplicar no servidor
                </button>
                <button className="btn" onClick={clearFilters} disabled={loading} type="button">
                  Limpar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {networkSummary.length > 0 && (
        <div className="card page-section-card accesses-coverage">
          <div className="page-section-head">
            <div>
              <h2 className="page-section-title">Cobertura por rede</h2>
              <div className="page-section-sub">Veja quais redes já têm cobertura de acesso remoto cadastrada.</div>
            </div>
          </div>

          <div className="grid">
            {networkSummary.map((net) => (
              <div className={isMobile ? "col-12" : "col-4"} key={net.key}>
                <button
                  className="card access-network-card"
                  type="button"
                  onClick={() => setNetworkFilter(net.key === NO_NETWORK_FILTER ? NO_NETWORK_FILTER : net.key)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: 14,
                    borderRadius: 18,
                    background: "rgba(255,255,255,.035)",
                    border: "1px solid rgba(255,255,255,.08)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{net.name}</div>
                    <span className="badge accent">{net.active}</span>
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    {net.storesCount} loja(s) • {net.total} acesso(s) cadastrados
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid accesses-workspace" style={{ alignItems: "start" }}>
        <div className={isMobile ? "col-12" : "col-8"}>
          <div className="card page-section-card accesses-list-panel">
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Lista de acessos</h2>
                <div className="page-section-sub">Selecione um acesso para copiar dados, abrir AnyDesk ou atualizar o cadastro.</div>
              </div>
              <span className="badge">{filteredItems.length} resultado(s)</span>
            </div>

            {loading ? (
              <div className="small">Carregando...</div>
            ) : filteredItems.length === 0 ? (
              <div
                className="card"
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background: "rgba(255,255,255,.035)",
                  border: "1px dashed rgba(255,255,255,.16)",
                }}
              >
                <div style={{ fontWeight: 900 }}>Nenhum acesso encontrado.</div>
                <div className="small" style={{ marginTop: 6 }}>
                  Altere os filtros ou cadastre um novo acesso para essa loja.
                </div>
              </div>
            ) : viewMode === "cards" || isMobile ? (
              <div className="accesses-card-list">
                {filteredItems.map((item) => {
                  const store = storeById.get(String(item.store_id));
                  const storeName = getItemStoreName(item, storeById, storeNameById);
                  const risk = getAccessRisk(item, duplicateIds);
                  const isSelected = selectedItem && String(selectedItem.id) === String(item.id);

                  return (
                    <button
                      key={item.id}
                      className={`card access-row-card ${isSelected ? "access-row-card--selected" : ""}`}
                      type="button"
                      onClick={() => setSelectedId(String(item.id))}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 14,
                        borderRadius: 20,
                        background: isSelected
                          ? "linear-gradient(135deg, rgba(245,177,75,.16), rgba(255,255,255,.045))"
                          : "rgba(255,255,255,.035)",
                        border: isSelected ? "1px solid rgba(245,177,75,.32)" : "1px solid rgba(255,255,255,.08)",
                        boxShadow: isSelected ? "0 18px 40px rgba(0,0,0,.18)" : undefined,
                        cursor: "pointer",
                      }}
                    >
                      <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 950, fontSize: 17, lineHeight: 1.18, overflowWrap: "break-word" }}>{storeName}</div>
                          <div className="small" style={{ marginTop: 4 }}>
                            {getNetworkNameFromStore(store) || "Sem rede"} {store?.cnpj ? `• CNPJ ${store.cnpj}` : ""}
                          </div>
                        </div>
                        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                          <span className={`badge ${risk.className}`}>{risk.label}</span>
                          {item.active !== false ? <span className="badge ok">ATIVO</span> : <span className="badge warn">INATIVO</span>}
                        </div>
                      </div>

                      <div className="grid" style={{ marginTop: 12 }}>
                        <div className={isMobile ? "col-12" : "col-4"}>
                          <div className="small">Identificação</div>
                          <div style={{ fontWeight: 850 }}>{item.label}</div>
                        </div>
                        <div className={isMobile ? "col-12" : "col-4"}>
                          <div className="small">AnyDesk</div>
                          <div style={{ fontWeight: 950, letterSpacing: ".03em" }}>{formatAnyDeskId(item.anydesk_id)}</div>
                        </div>
                        <div className={isMobile ? "col-12" : "col-4"}>
                          <div className="small">Última atualização</div>
                          <div style={{ fontWeight: 800 }}>{formatDateTime(item.updated_at || item.created_at)}</div>
                        </div>
                      </div>

                      {safeStr(item.notes) ? (
                        <div className="small access-row-note" style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                          {safeStr(item.notes)}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="table-wrap-premium">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Loja</th>
                      <th>Rede</th>
                      <th>Identificação</th>
                      <th>AnyDesk</th>
                      <th>Situação</th>
                      <th>Atualizado</th>
                      <th style={{ textAlign: "right" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const store = storeById.get(String(item.store_id));
                      const risk = getAccessRisk(item, duplicateIds);

                      return (
                        <tr key={item.id}>
                          <td>
                            <div style={{ fontWeight: 850 }}>{getItemStoreName(item, storeById, storeNameById)}</div>
                            <div className="small">{store?.cnpj || `ID ${item.store_id}`}</div>
                          </td>
                          <td>{getNetworkNameFromStore(store) || "Sem rede"}</td>
                          <td>
                            <div style={{ fontWeight: 750 }}>{item.label}</div>
                          </td>
                          <td>
                            <button className="btn" onClick={() => onOpenAnyDesk(item)} title="Abrir AnyDesk" type="button" style={{ minWidth: 140 }}>
                              {formatAnyDeskId(item.anydesk_id)}
                            </button>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                              <span className={`badge ${risk.className}`}>{risk.label}</span>
                              {item.active !== false ? <span className="badge ok">ATIVO</span> : <span className="badge warn">INATIVO</span>}
                            </div>
                          </td>
                          <td>{formatDateTime(item.updated_at || item.created_at)}</td>
                          <td style={{ textAlign: "right" }}>
                            <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                              <button className="btn" onClick={() => setSelectedId(String(item.id))} type="button">
                                Detalhes
                              </button>
                              <button className="btn" onClick={() => onCopy(item)} type="button">
                                Copiar
                              </button>
                              <button className="btn" onClick={() => openEdit(item)} type="button">
                                Editar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className={isMobile ? "col-12" : "col-4"}>
          <div className="card page-section-card access-detail-panel" style={{ position: isMobile ? "static" : "sticky", top: 90 }}>
            <div className="page-section-head">
              <div>
                <h2 className="page-section-title">Painel do acesso</h2>
                <div className="page-section-sub">Ações rápidas para o item selecionado.</div>
              </div>
            </div>

            {!selectedItem ? (
              <div className="small">Selecione um acesso na lista.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {(() => {
                  const item = selectedItem;
                  const store = storeById.get(String(item.store_id));
                  const risk = getAccessRisk(item, duplicateIds);
                  return (
                    <>
                      <div
                        className="card access-detail-summary"
                        style={{
                          padding: 14,
                          borderRadius: 20,
                          background: "rgba(255,255,255,.035)",
                          border: "1px solid rgba(255,255,255,.08)",
                        }}
                      >
                        <div style={{ fontWeight: 950, fontSize: 18, lineHeight: 1.15 }}>{getItemStoreName(item, storeById, storeNameById)}</div>
                        <div className="small" style={{ marginTop: 6 }}>
                          {getNetworkNameFromStore(store) || "Sem rede"}
                          {store?.cnpj ? ` • CNPJ ${store.cnpj}` : ""}
                        </div>

                        <div className="sep" />

                        <div className="small">Identificação</div>
                        <div style={{ fontWeight: 900 }}>{item.label}</div>

                        <div style={{ marginTop: 12 }}>
                          <div className="small">AnyDesk</div>
                          <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: ".04em" }}>{formatAnyDeskId(item.anydesk_id)}</div>
                        </div>

                        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                          <span className={`badge ${risk.className}`}>{risk.label}</span>
                          {item.active !== false ? <span className="badge ok">ATIVO</span> : <span className="badge warn">INATIVO</span>}
                        </div>
                        <div className="small" style={{ marginTop: 8 }}>{risk.hint}</div>
                      </div>

                      <div className="grid">
                        <div className="col-12">
                          <button className="btn primary" onClick={() => onOpenAnyDesk(item)} type="button" style={{ width: "100%" }}>
                            Abrir AnyDesk
                          </button>
                        </div>
                        <div className="col-6">
                          <CopyButton onClick={() => onCopy(item)}>
                            Copiar ID
                          </CopyButton>
                        </div>
                        <div className="col-6">
                          <CopyButton onClick={() => onCopyCard(item)}>
                            Copiar resumo
                          </CopyButton>
                        </div>
                        <div className="col-6">
                          <button className="btn" onClick={() => openEdit(item)} type="button" style={{ width: "100%" }}>
                            Editar
                          </button>
                        </div>
                        <div className="col-6">
                          <button className="btn danger" onClick={() => onDelete(item)} disabled={deletingId === String(item.id)} type="button" style={{ width: "100%" }}>
                            {deletingId === String(item.id) ? "Excluindo..." : "Excluir"}
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="small">Observações</div>
                        <div
                          className="card"
                          style={{
                            marginTop: 6,
                            padding: 12,
                            borderRadius: 16,
                            background: "rgba(255,255,255,.035)",
                            border: "1px solid rgba(255,255,255,.08)",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.45,
                          }}
                        >
                          {safeStr(item.notes) || "Nenhuma observação técnica adicionada."}
                        </div>
                      </div>

                      <div className="small">
                        Criado em: {formatDateTime(item.created_at)}
                        <br />
                        Atualizado em: {formatDateTime(item.updated_at)}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) closeModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.62)",
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
              width: "min(820px, 100%)",
              borderRadius: 22,
              padding: 16,
              background: "rgba(25,25,25,0.97)",
              border: "1px solid rgba(255,255,255,0.10)",
              maxHeight: "90dvh",
              overflow: "auto",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div className="h2" style={{ margin: 0 }}>
                  {editing ? "Editar acesso" : "Novo acesso"}
                </div>
                <div className="small" style={{ marginTop: 4 }}>
                  Cadastre o acesso remoto principal da loja. Senhas não devem ser salvas nesta etapa.
                </div>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn" onClick={closeModal} disabled={saving} type="button">
                  Cancelar
                </button>
                <button className="btn primary" onClick={onSave} disabled={saving} type="button">
                  {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar acesso"}
                </button>
              </div>
            </div>

            <div className="sep" />

            <div
              className="card"
              style={{
                padding: 12,
                borderRadius: 16,
                background: "rgba(245,158,11,.10)",
                border: "1px solid rgba(245,158,11,.20)",
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 850 }}>Orientação de segurança</div>
              <div className="small" style={{ marginTop: 4 }}>
                Use este cadastro para ID, identificação e observações técnicas. Não salve senhas aqui enquanto o cofre criptografado não for ativado.
              </div>
            </div>

            <div className="grid">
              <div className="col-12">
                <label>Loja</label>
                <FancySelect
                  value={form.store_id}
                  onChange={(value) => setForm((f) => ({ ...f, store_id: value }))}
                  disabled={storesLoading}
                  placeholder={storesLoading ? "Carregando lojas..." : "Selecione..."}
                  options={stores
                    .slice()
                    .sort((a, b) => storeOptionLabel(a).localeCompare(storeOptionLabel(b)))
                    .map((s) => ({ value: s.id, label: storeOptionLabel(s), hint: s.cnpj || undefined }))}
                />
              </div>

              <div className="col-6">
                <label>Identificação</label>
                <input
                  className="input"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Ex.: Servidor, Caixa 1, Retaguarda"
                />
              </div>

              <div className="col-6">
                <label>ID AnyDesk</label>
                <input
                  className="input"
                  value={form.anydesk_id}
                  onChange={(e) => setForm((f) => ({ ...f, anydesk_id: e.target.value }))}
                  placeholder="Ex.: 123456789"
                />
              </div>

              <div className="col-12">
                <label>Observações técnicas</label>
                <textarea
                  rows={5}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Ex.: servidor principal, caixa do balcão, horário ideal para acesso, observações de rede..."
                />
              </div>

              <div className="col-12">
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 0 }}>
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                  <span style={{ color: "var(--text)", fontSize: 14 }}>Acesso ativo</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
