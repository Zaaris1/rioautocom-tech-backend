
import React from "react";
import {
  adminCreateStore,
  adminCreateUser,
  adminGrantStore,
  adminGrantNetwork,
  adminRevokeStore,
  adminRevokeNetwork,
  adminListStores,
  adminListUsers,
  adminUpdateStore,
  adminCreateNetwork,
  listNetworks,
} from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";
import FancySelect from "../components/FancySelect";

function roleLabel(role?: string) {
  if (!role) return "—";
  if (role === "ADMIN") return "Admin";
  if (role === "TECH") return "Técnico";
  if (role === "CLIENT") return "Cliente";
  return role;
}

function roleBadgeClass(role?: string) {
  if (role === "ADMIN") return "badge accent";
  if (role === "CLIENT") return "badge accentB";
  return "badge";
}

function normalizeId(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "null" || s === "undefined" ? "" : s;
}

function pickUserPrimaryRole(u: any): string {
  const r = String(u?.role || "").trim();
  if (r) return r;
  const roles = Array.isArray(u?.roles) ? u.roles.map(String) : [];
  if (roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("TECH")) return "TECH";
  if (roles.includes("CLIENT")) return "CLIENT";
  return "";
}

function byName(a: any, b: any) {
  return String(a?.name || a?.username || "").localeCompare(String(b?.name || b?.username || ""));
}

const ADMIN_TABS = [
  { id: "overview", label: "Visão geral", hint: "Resumo administrativo" },
  { id: "cadastros", label: "Cadastros", hint: "Usuários, lojas e redes" },
  { id: "permissoes", label: "Permissões", hint: "Acesso de clientes" },
  { id: "registros", label: "Registros", hint: "Consulta e manutenção" },
] as const;

export default function AdminPage() {
  const { role, roles } = useAuth();
  const { show, Toast } = useToast();

  const [users, setUsers] = React.useState<any[]>([]);
  const [stores, setStores] = React.useState<any[]>([]);
  const [networks, setNetworks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [newUser, setNewUser] = React.useState({
    username: "",
    role: "TECH",
    password: "",
    must_change_password: true,
  });

  const [newStore, setNewStore] = React.useState({ name: "", cnpj: "" });
  const [newStoreNetworkId, setNewStoreNetworkId] = React.useState<string>("");

  const [grant, setGrant] = React.useState({ client_id: "", store_id: "" });
  const [grantNet, setGrantNet] = React.useState({ client_id: "", network_id: "" });

  const [grantingStore, setGrantingStore] = React.useState(false);
  const [revokingStore, setRevokingStore] = React.useState(false);
  const [grantingNet, setGrantingNet] = React.useState(false);
  const [revokingNet, setRevokingNet] = React.useState(false);

  const [newNetworkName, setNewNetworkName] = React.useState("");
  const [creatingNetwork, setCreatingNetwork] = React.useState(false);
  const [showNetworksPanel, setShowNetworksPanel] = React.useState(false);

  const [userSearch, setUserSearch] = React.useState("");
  const [storeSearch, setStoreSearch] = React.useState("");
  const [adminTab, setAdminTab] = React.useState<(typeof ADMIN_TABS)[number]["id"]>("overview");

  const canAdmin = (roles || []).includes("ADMIN") || role === "ADMIN";

  const [editOpen, setEditOpen] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [editStoreId, setEditStoreId] = React.useState<string>("");
  const [editName, setEditName] = React.useState<string>("");
  const [editCnpj, setEditCnpj] = React.useState<string>("");
  const [editActive, setEditActive] = React.useState<boolean>(true);
  const [editNetworkId, setEditNetworkId] = React.useState<string>("");

  const networkNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (networks || []).forEach((n: any) => {
      const id = normalizeId(n?.id);
      const name = String(n?.name ?? "").trim();
      if (id && name) map.set(id, name);
    });
    return map;
  }, [networks]);

  const getStoreNetworkId = (s: any): string => {
    return normalizeId(s?.network_id ?? s?.rede_id ?? s?.network?.id ?? s?.rede?.id);
  };

  const getStoreNetworkName = (s: any): string => {
    const direct =
      String(
        s?.network_name ??
          s?.store_network_name ??
          s?.rede_name ??
          s?.network?.name ??
          s?.rede?.name ??
          ""
      ).trim();

    if (direct) return direct;
    const id = getStoreNetworkId(s);
    return id && networkNameById.has(id) ? networkNameById.get(id)! : "";
  };

  const openEdit = (s: any) => {
    setEditStoreId(String(s?.id || ""));
    setEditName(String(s?.name || ""));
    setEditCnpj(String(s?.cnpj || ""));
    setEditActive(s?.active === false ? false : true);
    setEditNetworkId(getStoreNetworkId(s));
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (savingEdit) return;
    setEditOpen(false);
  };

  const saveEdit = async () => {
    try {
      if (!editStoreId) return show("store_id inválido.", "error");
      if (!editName.trim()) return show("Informe o nome da loja.", "error");
      if (!editCnpj.trim()) return show("Informe o CNPJ.", "error");

      setSavingEdit(true);

      await adminUpdateStore(editStoreId, {
        name: editName.trim(),
        cnpj: editCnpj.trim(),
        active: !!editActive,
        network_id: editNetworkId ? editNetworkId : null,
      });

      show("Loja atualizada.", "success");
      setEditOpen(false);
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao atualizar loja", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [u, s, n] = await Promise.all([adminListUsers(), adminListStores(), listNetworks()]);
      setUsers(u || []);
      setStores(s || []);
      setNetworks(n || []);
    } catch (err: any) {
      show(err?.message || "Erro ao carregar administração", "error");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (canAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin]);

  if (!canAdmin) {
    return (
      <div className="card page-hero">
        <h1 className="page-hero__title">Administração</h1>
        <div className="page-hero__sub">Somente administradores.</div>
      </div>
    );
  }

  const createUser = async () => {
    try {
      if (!newUser.username.trim()) return show("Informe o username.", "error");
      if (!newUser.password) return show("Informe a senha.", "error");

      await adminCreateUser({
        username: newUser.username.trim(),
        role: newUser.role as any,
        roles: [newUser.role as any],
        password: newUser.password,
        must_change_password: !!newUser.must_change_password,
      });

      show("Usuário criado.", "success");
      setNewUser({ username: "", role: "TECH", password: "", must_change_password: true });
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao criar usuário", "error");
    }
  };

  const createStore = async () => {
    try {
      if (!newStore.name.trim()) return show("Informe o nome da loja.", "error");
      if (!newStore.cnpj.trim()) return show("Informe o CNPJ.", "error");

      await adminCreateStore({
        name: newStore.name.trim(),
        cnpj: newStore.cnpj.trim(),
        network_id: newStoreNetworkId ? newStoreNetworkId : null,
      });

      show("Loja criada.", "success");
      setNewStore({ name: "", cnpj: "" });
      setNewStoreNetworkId("");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao criar loja", "error");
    }
  };

  const createNetwork = async () => {
    try {
      const name = newNetworkName.trim();
      if (!name) return show("Informe o nome da rede.", "error");
      setCreatingNetwork(true);
      await adminCreateNetwork({ name });
      show("Rede criada.", "success");
      setNewNetworkName("");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao criar rede", "error");
    } finally {
      setCreatingNetwork(false);
    }
  };

  const doGrantStore = async () => {
    try {
      if (!grant.client_id.trim() || !grant.store_id.trim()) {
        return show("Selecione cliente e loja.", "error");
      }
      setGrantingStore(true);
      await adminGrantStore(grant.client_id.trim(), grant.store_id.trim());
      show("Acesso à loja liberado.", "success");
    } catch (err: any) {
      show(err?.message || "Erro ao liberar acesso à loja", "error");
    } finally {
      setGrantingStore(false);
    }
  };

  const doRevokeStore = async () => {
    try {
      if (!grant.client_id.trim() || !grant.store_id.trim()) {
        return show("Selecione cliente e loja.", "error");
      }
      setRevokingStore(true);
      await adminRevokeStore(grant.client_id.trim(), grant.store_id.trim());
      show("Acesso da loja removido.", "success");
    } catch (err: any) {
      show(err?.message || "Erro ao remover acesso da loja", "error");
    } finally {
      setRevokingStore(false);
    }
  };

  const doGrantNetwork = async () => {
    try {
      if (!grantNet.client_id.trim() || !grantNet.network_id.trim()) {
        return show("Selecione cliente e rede.", "error");
      }
      setGrantingNet(true);
      await adminGrantNetwork(grantNet.client_id.trim(), grantNet.network_id.trim());
      show("Acesso à rede liberado.", "success");
      setGrantNet((v) => ({ ...v, network_id: "" }));
    } catch (err: any) {
      show(err?.message || "Erro ao liberar acesso à rede", "error");
    } finally {
      setGrantingNet(false);
    }
  };

  const doRevokeNetwork = async () => {
    try {
      if (!grantNet.client_id.trim() || !grantNet.network_id.trim()) {
        return show("Selecione cliente e rede.", "error");
      }
      setRevokingNet(true);
      await adminRevokeNetwork(grantNet.client_id.trim(), grantNet.network_id.trim());
      show("Acesso da rede removido.", "success");
    } catch (err: any) {
      show(err?.message || "Erro ao remover acesso da rede", "error");
    } finally {
      setRevokingNet(false);
    }
  };

  const networksSorted = React.useMemo(() => {
    const arr = Array.isArray(networks) ? [...networks] : [];
    arr.sort(byName);
    return arr;
  }, [networks]);

  const clientsSorted = React.useMemo(() => {
    const arr = Array.isArray(users) ? [...users] : [];
    return arr.filter((u: any) => pickUserPrimaryRole(u) === "CLIENT").sort((a, b) => String(a?.username || "").localeCompare(String(b?.username || "")));
  }, [users]);

  const storesSorted = React.useMemo(() => {
    const arr = Array.isArray(stores) ? [...stores] : [];
    arr.sort((a: any, b: any) => String(a?.name || "").localeCompare(String(b?.name || "")));
    return arr;
  }, [stores]);

  const storeOptions = React.useMemo(() => {
    return storesSorted.map((s: any) => ({
      id: String(s.id),
      label: getStoreNetworkName(s) ? `${getStoreNetworkName(s)} - ${s.name}` : String(s.name || "—"),
    }));
  }, [storesSorted, networkNameById]);

  const admins = users.filter((u: any) => pickUserPrimaryRole(u) === "ADMIN").length;
  const techs = users.filter((u: any) => pickUserPrimaryRole(u) === "TECH").length;
  const clients = users.filter((u: any) => pickUserPrimaryRole(u) === "CLIENT").length;
  const inactiveStores = stores.filter((s: any) => s?.active === false).length;
  const activeStores = stores.length - inactiveStores;

  const filteredUsers = React.useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u: any) =>
      [u?.username, u?.id, pickUserPrimaryRole(u)]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q))
    );
  }, [users, userSearch]);

  const filteredStores = React.useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s: any) =>
      [s?.name, s?.cnpj, s?.id, getStoreNetworkName(s)]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q))
    );
  }, [stores, storeSearch, networkNameById]);

  const storesWithoutNetwork = stores.filter((s: any) => !getStoreNetworkName(s)).length;
  const usersNeedPassword = users.filter((u: any) => !!u?.must_change_password).length;
  const panelStyle: React.CSSProperties = {
    padding: 16,
    borderRadius: 22,
    background: "linear-gradient(180deg, rgba(19,29,44,0.92), rgba(14,22,35,0.82))",
    border: "1px solid rgba(160,174,196,0.16)",
  };

  const miniCardStyle: React.CSSProperties = {
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(160,174,196,0.13)",
  };

  const activeTabStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(242,174,74,0.95), rgba(213,132,39,0.95))",
    color: "#1b1206",
    borderColor: "rgba(242,174,74,0.65)",
    boxShadow: "0 12px 28px rgba(213,132,39,0.18)",
  };

  return (
    <div className="page-shell">
      <div className="card page-hero">
        <div className="page-hero__head">
          <div>
            <h1 className="page-hero__title">Central administrativa</h1>
            <div className="page-hero__sub">
              Gerencie usuários, lojas, redes e permissões de acesso em uma área única.
            </div>
          </div>

          <div className="page-hero__actions">
            <span className="badge accent">🔐 {roleLabel(role || undefined)}</span>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar dados"}
            </button>
          </div>
        </div>

        <div className="page-kpis">
          <div className="page-kpi">
            <div className="page-kpi__label">Usuários</div>
            <div className="page-kpi__value">{users.length}</div>
            <div className="page-kpi__hint">{admins} admin · {techs} técnicos · {clients} clientes</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Lojas</div>
            <div className="page-kpi__value">{stores.length}</div>
            <div className="page-kpi__hint">{activeStores} ativas · {inactiveStores} inativas</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Redes</div>
            <div className="page-kpi__value">{networksSorted.length}</div>
            <div className="page-kpi__hint">Agrupamento por cliente/rede</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Clientes</div>
            <div className="page-kpi__value">{clientsSorted.length}</div>
            <div className="page-kpi__hint">Com acesso controlado</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 10, borderRadius: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {ADMIN_TABS.map((tab) => {
            const active = adminTab === tab.id;
            return (
              <button
                key={tab.id}
                className="btn"
                onClick={() => setAdminTab(tab.id)}
                style={{
                  minHeight: 62,
                  justifyContent: "flex-start",
                  alignItems: "flex-start",
                  flexDirection: "column" as any,
                  gap: 4,
                  padding: "12px 14px",
                  ...(active ? activeTabStyle : {}),
                }}
              >
                <span style={{ fontWeight: 900 }}>{tab.label}</span>
                <span style={{ fontSize: 12, opacity: active ? 0.78 : 0.68 }}>{tab.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {adminTab === "overview" && (
        <div className="grid">
          <div className="col-7 card page-section-card">
            <div className="page-section-head">
              <div>
                <div className="h2">Resumo da operação</div>
                <div className="small">Pontos que ajudam a manter o cadastro organizado.</div>
              </div>
              <span className="badge accent">Administração</span>
            </div>
            <div className="sep" />

            <div style={{ display: "grid", gap: 12 }}>
              <div style={miniCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Lojas sem rede</div>
                    <div className="small" style={{ marginTop: 4 }}>Lojas sem agrupamento podem dificultar filtros e permissões.</div>
                  </div>
                  <span className={storesWithoutNetwork ? "badge warn" : "badge ok"}>{storesWithoutNetwork}</span>
                </div>
              </div>

              <div style={miniCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Usuários com troca de senha pendente</div>
                    <div className="small" style={{ marginTop: 4 }}>Contas novas ainda precisam definir senha própria.</div>
                  </div>
                  <span className={usersNeedPassword ? "badge warn" : "badge ok"}>{usersNeedPassword}</span>
                </div>
              </div>

              <div style={miniCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Lojas inativas</div>
                    <div className="small" style={{ marginTop: 4 }}>Unidades fora do fluxo normal do sistema.</div>
                  </div>
                  <span className={inactiveStores ? "badge warn" : "badge ok"}>{inactiveStores}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="col-5 card page-section-card">
            <div className="page-section-head">
              <div>
                <div className="h2">Ações rápidas</div>
                <div className="small">Acesse direto as rotinas mais usadas.</div>
              </div>
            </div>
            <div className="sep" />

            <div style={{ display: "grid", gap: 10 }}>
              <button className="btn primary" style={{ minHeight: 48, justifyContent: "space-between" }} onClick={() => setAdminTab("cadastros")}>
                Cadastrar usuário ou loja <span>›</span>
              </button>
              <button className="btn" style={{ minHeight: 48, justifyContent: "space-between" }} onClick={() => setAdminTab("permissoes")}>
                Liberar acesso de cliente <span>›</span>
              </button>
              <button className="btn" style={{ minHeight: 48, justifyContent: "space-between" }} onClick={() => setAdminTab("registros")}>
                Consultar usuários e lojas <span>›</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {adminTab === "cadastros" && (
        <div className="grid">
          <div className="col-6 card page-section-card">
            <div className="page-section-head">
              <div>
                <div className="h2">Novo usuário</div>
                <div className="small">Crie acessos para equipe técnica, clientes ou administradores.</div>
              </div>
              <span className="badge accent">Usuários</span>
            </div>
            <div className="sep" />

            <div className="grid">
              <div className="col-12">
                <label>Usuário</label>
                <input
                  className="input"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="ex: joao.tech"
                />
              </div>

              <div className="col-6">
                <label>Perfil</label>
                <FancySelect
                  value={newUser.role}
                  onChange={(value) => setNewUser({ ...newUser, role: value })}
                  options={[
                    { value: "TECH", label: "Técnico" },
                    { value: "CLIENT", label: "Cliente" },
                    { value: "ADMIN", label: "Admin" },
                  ]}
                />
              </div>

              <div className="col-6">
                <label>Senha inicial</label>
                <input
                  className="input"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Defina uma senha inicial"
                  autoComplete="new-password"
                />
              </div>

              <div className="col-12">
                <div style={miniCardStyle}>
                  <label style={{ margin: 0, color: "rgba(233,240,255,0.92)" }}>
                    <input
                      type="checkbox"
                      checked={!!newUser.must_change_password}
                      onChange={(e) => setNewUser({ ...newUser, must_change_password: e.target.checked })}
                    />
                    <span style={{ marginLeft: 10, fontWeight: 800 }}>Exigir troca no primeiro login</span>
                  </label>
                  <div className="small" style={{ marginTop: 6 }}>Recomendado para novas contas.</div>
                </div>
              </div>

              <div className="col-12">
                <button className="btn primary" onClick={createUser} disabled={!newUser.username.trim() || !newUser.password} style={{ width: "100%", minHeight: 46 }}>
                  Criar usuário
                </button>
              </div>
            </div>
          </div>

          <div className="col-6 card page-section-card">
            <div className="page-section-head">
              <div>
                <div className="h2">Nova loja</div>
                <div className="small">Inclua unidades e vincule à rede correta.</div>
              </div>
              <span className="badge accent">Lojas</span>
            </div>
            <div className="sep" />

            <div className="grid">
              <div className="col-12">
                <label>Nome da loja</label>
                <input
                  className="input"
                  value={newStore.name}
                  onChange={(e) => setNewStore({ ...newStore, name: e.target.value })}
                  placeholder="ex: Catete 2 - Shopping das Frutas"
                />
              </div>

              <div className="col-12">
                <label>CNPJ</label>
                <input
                  className="input"
                  value={newStore.cnpj}
                  onChange={(e) => setNewStore({ ...newStore, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                />
              </div>

              <div className="col-12">
                <label>Rede</label>
                <FancySelect
                  value={newStoreNetworkId}
                  onChange={setNewStoreNetworkId}
                  placeholder="Sem rede"
                  options={networksSorted.map((n: any) => ({ value: String(n?.id), label: String(n?.name || "—") }))}
                />
              </div>

              <div className="col-12">
                <button className="btn primary" onClick={createStore} disabled={!newStore.name.trim() || !newStore.cnpj.trim()} style={{ width: "100%", minHeight: 46 }}>
                  Criar loja
                </button>
              </div>
            </div>

            <div className="sep" />
            <div style={panelStyle}>
              <div className="h2" style={{ marginBottom: 6 }}>Criar rede</div>
              <div className="small">Use redes para agrupar lojas e liberar acesso em lote.</div>
              <div className="grid" style={{ marginTop: 12 }}>
                <div className="col-8">
                  <input className="input" value={newNetworkName} onChange={(e) => setNewNetworkName(e.target.value)} placeholder="ex: NorteFruti" autoComplete="off" />
                </div>
                <div className="col-4">
                  <button className="btn" onClick={createNetwork} disabled={!newNetworkName.trim() || creatingNetwork} style={{ width: "100%", minHeight: 44 }}>
                    {creatingNetwork ? "Criando..." : "Criar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {adminTab === "permissoes" && (
        <div className="grid">
          <div className="col-6 card page-section-card">
            <div className="page-section-head">
              <div>
                <div className="h2">Cliente → loja</div>
                <div className="small">Libere ou remova o acesso a uma unidade específica.</div>
              </div>
              <span className="badge accent">Permissão direta</span>
            </div>
            <div className="sep" />
            <div className="grid">
              <div className="col-12">
                <label>Cliente</label>
                <FancySelect
                  value={grant.client_id}
                  onChange={(value) => setGrant((v) => ({ ...v, client_id: value }))}
                  placeholder="Selecione o cliente"
                  options={clientsSorted.map((u: any) => ({ value: String(u?.id), label: String(u?.username || "—"), hint: String(u?.id).slice(0, 10) }))}
                />
              </div>
              <div className="col-12">
                <label>Loja</label>
                <FancySelect
                  value={grant.store_id}
                  onChange={(value) => setGrant((v) => ({ ...v, store_id: value }))}
                  placeholder="Selecione a loja"
                  options={storeOptions.map((s: any) => ({ value: s.id, label: s.label }))}
                />
              </div>
              <div className="col-12" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn primary" onClick={doGrantStore} disabled={!grant.client_id || !grant.store_id || grantingStore} style={{ flex: "1 1 220px", minHeight: 44 }}>
                  {grantingStore ? "Liberando..." : "Liberar loja"}
                </button>
                <button className="btn" onClick={doRevokeStore} disabled={!grant.client_id || !grant.store_id || revokingStore} style={{ flex: "1 1 220px", minHeight: 44 }}>
                  {revokingStore ? "Removendo..." : "Remover loja"}
                </button>
              </div>
            </div>
          </div>

          <div className="col-6 card page-section-card">
            <div className="page-section-head">
              <div>
                <div className="h2">Cliente → rede</div>
                <div className="small">Libere ou remova todas as lojas de uma rede.</div>
              </div>
              <span className="badge accent">Permissão por grupo</span>
            </div>
            <div className="sep" />
            <div className="grid">
              <div className="col-12">
                <label>Cliente</label>
                <FancySelect
                  value={grantNet.client_id}
                  onChange={(value) => setGrantNet((v) => ({ ...v, client_id: value }))}
                  placeholder="Selecione o cliente"
                  options={clientsSorted.map((u: any) => ({ value: String(u?.id), label: String(u?.username || "—"), hint: String(u?.id).slice(0, 10) }))}
                />
              </div>
              <div className="col-12">
                <label>Rede</label>
                <FancySelect
                  value={grantNet.network_id}
                  onChange={(value) => setGrantNet((v) => ({ ...v, network_id: value }))}
                  placeholder="Selecione a rede"
                  options={networksSorted.map((n: any) => ({ value: String(n?.id), label: String(n?.name || "—") }))}
                />
              </div>
              <div className="col-12" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn primary" onClick={doGrantNetwork} disabled={!grantNet.client_id || !grantNet.network_id || grantingNet} style={{ flex: "1 1 220px", minHeight: 44 }}>
                  {grantingNet ? "Liberando..." : "Liberar rede"}
                </button>
                <button className="btn" onClick={doRevokeNetwork} disabled={!grantNet.client_id || !grantNet.network_id || revokingNet} style={{ flex: "1 1 220px", minHeight: 44 }}>
                  {revokingNet ? "Removendo..." : "Remover rede"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {adminTab === "registros" && (
        <div className="grid">
          <div className="col-6 card page-section-card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div className="h2" style={{ marginBottom: 6 }}>Usuários</div>
                <div className="small">Consulte perfis e pendências de senha.</div>
              </div>
              <input className="input" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar usuário" style={{ maxWidth: 240 }} />
            </div>
            <div className="sep" />
            <div style={{ display: "grid", gap: 9, maxHeight: 680, overflow: "auto", paddingRight: 2 }}>
              {filteredUsers.slice().sort((a: any, b: any) => String(a?.username || "").localeCompare(String(b?.username || ""))).map((u: any) => {
                const r = pickUserPrimaryRole(u);
                return (
                  <div key={u.id} className="card" style={{ padding: 12, background: "rgba(255,255,255,0.035)", borderRadius: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900 }}>{u.username}</div>
                      <span className={roleBadgeClass(r)}>{roleLabel(r)}</span>
                      {u.must_change_password && <span className="badge warn">Troca pendente</span>}
                    </div>
                    <div className="small wrap-anywhere" style={{ marginTop: 6, opacity: 0.78 }}>{u.id}</div>
                  </div>
                );
              })}
              {filteredUsers.length === 0 && <div className="small">Nenhum usuário encontrado.</div>}
            </div>
          </div>

          <div className="col-6 card page-section-card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div className="h2" style={{ marginBottom: 6 }}>Lojas</div>
                <div className="small">Edite loja, CNPJ, status e vínculo de rede.</div>
              </div>
              <input className="input" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} placeholder="Buscar loja" style={{ maxWidth: 240 }} />
            </div>
            <div className="sep" />
            <div style={{ display: "grid", gap: 9, maxHeight: 680, overflow: "auto", paddingRight: 2 }}>
              {filteredStores.slice().sort((a: any, b: any) => String(a?.name || "").localeCompare(String(b?.name || ""))).map((s: any) => {
                const inactive = s?.active === false;
                const netName = getStoreNetworkName(s);
                return (
                  <div key={s.id} className="card" style={{ padding: 12, background: "rgba(255,255,255,0.035)", borderRadius: 16 }}>
                    <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ fontWeight: 900, opacity: inactive ? 0.62 : 1 }}>{s.name}</div>
                          {inactive && <span className="badge warn">Inativa</span>}
                          {netName ? <span className="badge">{netName}</span> : <span className="badge warn">Sem rede</span>}
                        </div>
                        <div className="small" style={{ marginTop: 6 }}>CNPJ: <b>{s.cnpj}</b></div>
                        <div className="small wrap-anywhere" style={{ marginTop: 3, opacity: 0.72 }}>{s.id}</div>
                      </div>
                      <button className="btn" onClick={() => openEdit(s)} disabled={loading}>Editar</button>
                    </div>
                  </div>
                );
              })}
              {filteredStores.length === 0 && <div className="small">Nenhuma loja encontrada.</div>}
            </div>
          </div>

          <div className="col-12 card page-section-card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div className="h2" style={{ marginBottom: 6 }}>Redes cadastradas</div>
                <div className="small">Lista de agrupamentos disponíveis para lojas e permissões.</div>
              </div>
              <button className="btn" onClick={() => setAdminTab("cadastros")}>Criar rede</button>
            </div>
            <div className="sep" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {networksSorted.map((n: any) => (
                <div key={String(n?.id ?? n?.name)} className="card" style={{ padding: 12, background: "rgba(255,255,255,0.035)", borderRadius: 16 }}>
                  <div style={{ fontWeight: 900 }}>{String(n?.name || "—")}</div>
                  <div className="small wrap-anywhere" style={{ marginTop: 6 }}>{String(n?.id ?? "").slice(0, 18)}</div>
                </div>
              ))}
              {networksSorted.length === 0 && <div className="small">Nenhuma rede cadastrada.</div>}
            </div>
          </div>
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
            background: "rgba(0,0,0,0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ width: "min(720px, 100%)", borderRadius: 22, padding: 16, background: "rgba(19,29,44,0.98)", border: "1px solid rgba(160,174,196,0.18)" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 200 }}>
                <div className="h2" style={{ margin: 0 }}>Editar loja</div>
                <div className="small wrap-anywhere" style={{ marginTop: 4, opacity: 0.85 }}>{editStoreId}</div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn" onClick={closeEdit} disabled={savingEdit}>Cancelar</button>
                <button className="btn primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Salvando..." : "Salvar"}</button>
              </div>
            </div>
            <div className="sep" />
            <div className="grid">
              <div className="col-12">
                <label>Nome</label>
                <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome da loja" />
              </div>
              <div className="col-12">
                <label>CNPJ</label>
                <input className="input" value={editCnpj} onChange={(e) => setEditCnpj(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" />
              </div>
              <div className="col-12">
                <label>Rede</label>
                <FancySelect value={editNetworkId} onChange={setEditNetworkId} placeholder="Sem rede" options={networksSorted.map((n: any) => ({ value: String(n?.id), label: String(n?.name || "—") }))} />
                <div className="small" style={{ marginTop: 6 }}>Atualiza o vínculo da loja com a rede.</div>
              </div>
              <div className="col-12">
                <div style={miniCardStyle}>
                  <label style={{ margin: 0, color: "rgba(233,240,255,0.92)" }}>
                    <input type="checkbox" checked={!!editActive} onChange={(e) => setEditActive(e.target.checked)} />
                    <span style={{ marginLeft: 10, fontWeight: 800 }}>Loja ativa</span>
                  </label>
                  <div className="small" style={{ marginTop: 6 }}>Lojas inativas saem do fluxo normal do sistema.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
