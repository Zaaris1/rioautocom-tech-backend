import React from "react";
import { adminCreateStore, adminCreateUser, adminGrantStore, adminListStores, adminListUsers } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";

export default function AdminPage() {
  const { role } = useAuth();
  const { show, Toast } = useToast();

  const [users, setUsers] = React.useState<any[]>([]);
  const [stores, setStores] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [newUser, setNewUser] = React.useState({ username:"", role:"TECH", password:"", must_change_password:true });
  const [newStore, setNewStore] = React.useState({ name:"", cnpj:"" });
  const [grant, setGrant] = React.useState({ client_id:"", store_id:"" });

  const load = async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([adminListUsers(), adminListStores()]);
      setUsers(u); setStores(s);
    } catch (err:any) {
      show(err?.message || "Erro ao carregar admin", "error");
    } finally { setLoading(false); }
  };

  React.useEffect(() => { if (role === "ADMIN") load(); }, [role]);

  if (role !== "ADMIN") return <div className="card"><div className="h2">Admin</div><div className="small">Acesso restrito.</div></div>;

  const createUser = async () => {
    try {
      await adminCreateUser({
        username: newUser.username.trim(),
        role: newUser.role as any,
        password: newUser.password,
        must_change_password: !!newUser.must_change_password
      });
      show("Usuário criado!", "success");
      setNewUser({ username:"", role:"TECH", password:"", must_change_password:true });
      await load();
    } catch (err:any) { show(err?.message || "Erro ao criar usuário", "error"); }
  };

  const createStore = async () => {
    try {
      await adminCreateStore({ name: newStore.name.trim(), cnpj: newStore.cnpj.trim() });
      show("Loja criada!", "success");
      setNewStore({ name:"", cnpj:"" });
      await load();
    } catch (err:any) { show(err?.message || "Erro ao criar loja", "error"); }
  };

  const doGrant = async () => {
    try { await adminGrantStore(grant.client_id.trim(), grant.store_id.trim()); show("Acesso liberado!", "success"); }
    catch (err:any) { show(err?.message || "Erro ao liberar acesso", "error"); }
  };

  return (
    <div className="grid">
      <div className="col-12 card">
        <div className="row" style={{ justifyContent:"space-between" }}>
          <div><div className="h2">Admin</div><div className="small">Gerencie usuários e lojas.</div></div>
          <button className="btn" onClick={load} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
        </div>
      </div>

      <div className="col-6 card">
        <div className="h2">Criar usuário</div>
        <div className="grid">
          <div className="col-12">
            <label>username</label>
            <input className="input" value={newUser.username} onChange={(e)=>setNewUser({ ...newUser, username:e.target.value })} />
          </div>
          <div className="col-6">
            <label>role</label>
            <select value={newUser.role} onChange={(e)=>setNewUser({ ...newUser, role:e.target.value })}>
              <option value="TECH">TECH</option>
              <option value="CLIENT">CLIENT</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="col-6">
            <label>senha</label>
            <input className="input" type="password" value={newUser.password} onChange={(e)=>setNewUser({ ...newUser, password:e.target.value })} />
          </div>
          <div className="col-12">
            <label>
              <input type="checkbox" checked={!!newUser.must_change_password} onChange={(e)=>setNewUser({ ...newUser, must_change_password:e.target.checked })}/>
              <span style={{ marginLeft: 8 }}>Forçar troca no primeiro login</span>
            </label>
          </div>
          <div className="col-12">
            <button className="btn primary" onClick={createUser} disabled={!newUser.username || !newUser.password}>Criar</button>
          </div>
        </div>
      </div>

      <div className="col-6 card">
        <div className="h2">Criar loja</div>
        <div className="grid">
          <div className="col-12">
            <label>Nome</label>
            <input className="input" value={newStore.name} onChange={(e)=>setNewStore({ ...newStore, name:e.target.value })} />
          </div>
          <div className="col-12">
            <label>CNPJ</label>
            <input className="input" value={newStore.cnpj} onChange={(e)=>setNewStore({ ...newStore, cnpj:e.target.value })} />
          </div>
          <div className="col-12">
            <button className="btn primary" onClick={createStore} disabled={!newStore.name || !newStore.cnpj}>Criar</button>
          </div>
        </div>
      </div>

      <div className="col-12 card">
        <div className="h2">Vincular cliente → loja</div>
        <div className="small">Use IDs listados abaixo.</div>
        <div className="grid" style={{ marginTop: 10 }}>
          <div className="col-4">
            <label>client_id</label>
            <input className="input" value={grant.client_id} onChange={(e)=>setGrant({ ...grant, client_id:e.target.value })} />
          </div>
          <div className="col-4">
            <label>store_id</label>
            <input className="input" value={grant.store_id} onChange={(e)=>setGrant({ ...grant, store_id:e.target.value })} />
          </div>
          <div className="col-4" style={{ display:"flex", alignItems:"end" }}>
            <button className="btn" onClick={doGrant} disabled={!grant.client_id || !grant.store_id}>Liberar acesso</button>
          </div>
        </div>
      </div>

      <div className="col-6 card">
        <div className="h2">Usuários</div>
        <div className="small">ID / username / role</div>
        <div className="sep" />
        <div style={{ display:"grid", gap:10 }}>
          {users.map(u => (
            <div key={u.id} className="card" style={{ padding:12, background:"rgba(0,0,0,0.18)" }}>
              <div style={{ fontWeight:800 }}>{u.username} <span className="badge" style={{ marginLeft:8 }}>{u.role}</span></div>
              <div className="small">{u.id}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="col-6 card">
        <div className="h2">Lojas</div>
        <div className="small">ID / nome / CNPJ</div>
        <div className="sep" />
        <div style={{ display:"grid", gap:10 }}>
          {stores.map(s => (
            <div key={s.id} className="card" style={{ padding:12, background:"rgba(0,0,0,0.18)" }}>
              <div style={{ fontWeight:800 }}>{s.name}</div>
              <div className="small">{s.id}</div>
              <div className="small">CNPJ: {s.cnpj}</div>
            </div>
          ))}
        </div>
      </div>

      <Toast />
    </div>
  );
}
