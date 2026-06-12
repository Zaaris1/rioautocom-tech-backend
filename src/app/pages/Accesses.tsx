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

const EMPTY_FORM: FormState = {
  store_id: "",
  label: "",
  anydesk_id: "",
  notes: "",
  active: true,
};

const NO_NETWORK_FILTER = "__NO_NETWORK__";

function safeStr(v: any) {
  return v == null ? "" : String(v).trim();
}

function normalizeAnyDeskId(v: string) {
  return safeStr(v).replace(/\s+/g, "");
}

function formatAnyDeskId(v: string) {
  const digits = normalizeAnyDeskId(v).replace(/\D/g, "");
  if (!digits) return safeStr(v);
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

function getNetworkNameFromStore(s: StoreItem) {
  return safeStr(s.network_name || s.rede_name);
}

function getNetworkIdFromStore(s: StoreItem) {
  return safeStr(s.network_id || s.rede_id);
}

function getNetworkKeyFromStore(s: StoreItem) {
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

export default function AccessesPage() {
  const { role } = useAuth();
  const { show, Toast } = useToast();

  const isAdmin = role === "ADMIN";
  const isMobile = useIsMobile(820);

  const [loading, setLoading] = React.useState(true);
  const [storesLoading, setStoresLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string>("");

  const [stores, setStores] = React.useState<StoreItem[]>([]);
  const [items, setItems] = React.useState<AnyDeskAccess[]>([]);

  const [q, setQ] = React.useState("");
  const [networkFilter, setNetworkFilter] = React.useState("");
  const [storeFilter, setStoreFilter] = React.useState("");
  const [onlyActive, setOnlyActive] = React.useState(true);

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
        q: params?.q ?? (q.trim() || undefined),
        store_id: params?.store_id ?? (storeFilter || undefined),
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
      try {
        await fetchStores();
        if (!alive) return;
        await fetchAccesses({ q: undefined, store_id: undefined });
      } catch {
        // erros já tratados
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const storeById = React.useMemo(() => {
    const map = new Map<string, StoreItem>();
    for (const s of stores) {
      map.set(String(s.id), s);
    }
    return map;
  }, [stores]);

  const storeNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stores) {
      map.set(String(s.id), storeOptionLabel(s));
    }
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

      if (!map.has(key)) {
        map.set(key, name || "Sem nome");
      }
    }

    const opts = Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    if (hasNoNetwork) {
      opts.push({ key: NO_NETWORK_FILTER, label: "Sem rede" });
    }

    return opts;
  }, [stores]);

  const storeOptions = React.useMemo(() => {
    let list = [...stores];

    if (networkFilter) {
      list = list.filter((s) => getNetworkKeyFromStore(s) === networkFilter);
    }

    list.sort((a, b) => storeOptionLabel(a).localeCompare(storeOptionLabel(b)));
    return list;
  }, [stores, networkFilter]);

  React.useEffect(() => {
    if (!storeFilter) return;
    const ok = storeOptions.some((s) => String(s.id) === String(storeFilter));
    if (!ok) setStoreFilter("");
  }, [networkFilter, storeOptions, storeFilter]);

  const filteredItems = React.useMemo(() => {
    let list = [...items];

    if (networkFilter) {
      list = list.filter((item) => {
        const store = storeById.get(String(item.store_id));
        if (!store) return false;
        return getNetworkKeyFromStore(store) === networkFilter;
      });
    }

    if (storeFilter) {
      list = list.filter((item) => String(item.store_id) === String(storeFilter));
    }

    if (onlyActive) {
      list = list.filter((x) => x.active !== false);
    }

    list.sort((a, b) => {
      const sa = safeStr(a.store_name || storeNameById.get(String(a.store_id)));
      const sb = safeStr(b.store_name || storeNameById.get(String(b.store_id)));
      const byStore = sa.localeCompare(sb);
      if (byStore !== 0) return byStore;

      const la = safeStr(a.label);
      const lb = safeStr(b.label);
      const byLabel = la.localeCompare(lb);
      if (byLabel !== 0) return byLabel;

      return safeStr(a.anydesk_id).localeCompare(safeStr(b.anydesk_id));
    });

    return list;
  }, [items, networkFilter, storeFilter, onlyActive, storeById, storeNameById]);

  const accessesSummary = React.useMemo(() => {
    const activeCount = filteredItems.filter((x) => x.active !== false).length;
    const storeCount = new Set(filteredItems.map((x) => String(x.store_id))).size;
    const networkCount = new Set(
      filteredItems
        .map((x) => {
          const store = storeById.get(String(x.store_id));
          return store ? getNetworkKeyFromStore(store) : "";
        })
        .filter(Boolean)
    ).size;

    return {
      total: filteredItems.length,
      active: activeCount,
      stores: storeCount,
      networks: networkCount,
    };
  }, [filteredItems, storeById]);


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

      if (editing) {
        await adminUpdateAnyDeskAccess(editing.id, payload);
        show("Acesso atualizado!", "success");
      } else {
        await adminCreateAnyDeskAccess(payload);
        show("Acesso criado!", "success");
      }

      closeModal();
      await fetchAccesses();
    } catch (err: any) {
      show(err?.message || "Erro ao salvar acesso", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (item: AnyDeskAccess) => {
    const ok = window.confirm(
      `Excluir o acesso "${item.label}" da loja "${item.store_name || storeNameById.get(String(item.store_id)) || item.store_id}"?`
    );
    if (!ok) return;

    setDeletingId(String(item.id));
    try {
      await adminDeleteAnyDeskAccess(item.id);
      show("Acesso excluído!", "success");
      await fetchAccesses();
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

  if (!isAdmin) {
    return (
      <div className="page-shell">
        <div className="card page-hero">
          <div className="page-hero__head">
            <div>
              <h1 className="page-hero__title">Acessos</h1>
              <div className="page-hero__sub">Somente administradores.</div>
            </div>
          </div>
        </div>
        <Toast />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="card page-hero">
        <div className="page-hero__head">
          <div>
            <h1 className="page-hero__title">Acessos remotos</h1>
            <div className="page-hero__sub">
              Centralize os acessos remotos por loja.
            </div>
          </div>

          <div className="page-hero__actions">
            <button className="btn" onClick={() => fetchAccesses()} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <button className="btn primary" onClick={openCreate}>
              + Novo acesso
            </button>
          </div>
        </div>

        <div className="page-kpis">
          <div className="page-kpi">
            <div className="page-kpi__label">Acessos visíveis</div>
            <div className="page-kpi__value">{accessesSummary.total}</div>
            <div className="page-kpi__hint">Base filtrada.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Ativos</div>
            <div className="page-kpi__value">{accessesSummary.active}</div>
            <div className="page-kpi__hint">Disponíveis.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Lojas</div>
            <div className="page-kpi__value">{accessesSummary.stores}</div>
            <div className="page-kpi__hint">Lojas atendidas.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Redes</div>
            <div className="page-kpi__value">{accessesSummary.networks}</div>
            <div className="page-kpi__hint">Redes atendidas.</div>
          </div>
        </div>
      </div>

      <div className="card page-section-card page-toolbar filters-sticky">
        <div className="page-section-head">
          <div>
            <h2 className="page-section-title">Filtros e pesquisa</h2>
            <div className="page-section-sub">Filtre por rede, loja, status ou termo.</div>
          </div>
        </div>

        <div className="grid">
          <div className={isMobile ? "col-12" : "col-4"}>
            <label>Buscar</label>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Loja, identificação, ID ou observação..."
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
              options={storeOptions.map((s) => ({ value: s.id, label: storeOptionLabel(s) }))}
            />
          </div>

          <div className={isMobile ? "col-12" : "col-2"} style={{ display: "flex", alignItems: "end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 0 }}>
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              <span style={{ color: "var(--text)", fontSize: 14 }}>Somente ativos</span>
            </label>
          </div>

          <div className="col-12">
            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
              <div className="small">
                Mostrando <b>{filteredItems.length}</b> acesso(s)
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={() =>
                    fetchAccesses({
                      q: q.trim() || undefined,
                      store_id: storeFilter || undefined,
                    })
                  }
                  disabled={loading}
                >
                  Aplicar filtros
                </button>

                <button
                  className="btn"
                  onClick={async () => {
                    setQ("");
                    setNetworkFilter("");
                    setStoreFilter("");
                    setOnlyActive(true);
                    await fetchAccesses({ q: undefined, store_id: undefined });
                  }}
                  disabled={loading}
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card page-section-card">
        <div className="page-section-head">
          <div>
            <h2 className="page-section-title">Lista de acessos</h2>
            <div className="page-section-sub">Consulte, copie e atualize os acessos cadastrados.</div>
          </div>
          <span className="badge">{filteredItems.length} resultado(s)</span>
        </div>

        {loading ? (
          <div className="small">Carregando...</div>
        ) : filteredItems.length === 0 ? (
          <div className="small">Nenhum acesso encontrado.</div>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredItems.map((item) => {
              const storeName = item.store_name || storeNameById.get(String(item.store_id)) || item.store_id;

              return (
                <div
                  key={item.id}
                  className="card"
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    background: "rgba(0,0,0,0.12)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 18,
                        lineHeight: 1.2,
                        wordBreak: "normal",
                        overflowWrap: "break-word",
                      }}
                    >
                      {storeName}
                    </div>

                    <div className="small" style={{ lineHeight: 1.35, wordBreak: "break-word" }}>
                      ID loja: {item.store_id}
                    </div>

                    <div>
                      <div className="small">Identificação</div>
                      <div style={{ fontWeight: 800 }}>{item.label}</div>
                    </div>

                    <div>
                      <div className="small">AnyDesk</div>
                      <button
                        className="btn"
                        onClick={() => onOpenAnyDesk(item)}
                        title="Abrir no AnyDesk"
                        style={{ width: "100%", textAlign: "center" }}
                      >
                        {formatAnyDeskId(item.anydesk_id)}
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {item.active !== false ? (
                        <span className="badge ok">ATIVO</span>
                      ) : (
                        <span className="badge warn">INATIVO</span>
                      )}
                    </div>

                    <div>
                      <div className="small">Observações</div>
                      <div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                        {safeStr(item.notes) || "—"}
                      </div>
                    </div>

                    <div className="actions" style={{ justifyContent: "stretch" }}>
                      <button className="btn" onClick={() => onCopy(item)}>
                        Copiar ID
                      </button>
                      <button className="btn" onClick={() => onOpenAnyDesk(item)}>
                        Abrir
                      </button>
                      <button className="btn" onClick={() => openEdit(item)}>
                        Editar
                      </button>
                      <button
                        className="btn danger"
                        onClick={() => onDelete(item)}
                        disabled={deletingId === String(item.id)}
                      >
                        {deletingId === String(item.id) ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="table-wrap-premium">
            <table className="table">
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Identificação</th>
                  <th>AnyDesk</th>
                  <th>Observações</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const storeName = item.store_name || storeNameById.get(String(item.store_id)) || item.store_id;

                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 800 }}>{storeName}</div>
                        <div className="small">ID loja: {item.store_id}</div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700 }}>{item.label}</div>
                      </td>

                      <td>
                        <button
                          className="btn"
                          onClick={() => onOpenAnyDesk(item)}
                          title="Abrir no AnyDesk"
                          style={{ minWidth: 140 }}
                        >
                          {formatAnyDeskId(item.anydesk_id)}
                        </button>
                      </td>

                      <td>
                        <div className="small" style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>
                          {safeStr(item.notes) || "—"}
                        </div>
                      </td>

                      <td>
                        {item.active !== false ? (
                          <span className="badge ok">ATIVO</span>
                        ) : (
                          <span className="badge warn">INATIVO</span>
                        )}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button className="btn" onClick={() => onCopy(item)}>
                            Copiar ID
                          </button>
                          <button className="btn" onClick={() => onOpenAnyDesk(item)}>
                            Abrir
                          </button>
                          <button className="btn" onClick={() => openEdit(item)}>
                            Editar
                          </button>
                          <button
                            className="btn danger"
                            onClick={() => onDelete(item)}
                            disabled={deletingId === String(item.id)}
                          >
                            {deletingId === String(item.id) ? "Excluindo..." : "Excluir"}
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
              width: "min(760px, 100%)",
              borderRadius: 18,
              padding: 14,
              background: "rgba(25,25,25,0.96)",
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
                  Cadastre o ID do AnyDesk vinculado à loja.
                </div>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn" onClick={closeModal} disabled={saving}>
                  Cancelar
                </button>
                <button className="btn primary" onClick={onSave} disabled={saving}>
                  {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar acesso"}
                </button>
              </div>
            </div>

            <div className="sep" />

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
                    .map((s) => ({
                      value: s.id,
                      label: storeOptionLabel(s),
                      hint: s.cnpj || undefined,
                    }))}
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
                <label>Observações</label>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Informações adicionais, se necessário..."
                />
              </div>

              <div className="col-12">
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  />
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
