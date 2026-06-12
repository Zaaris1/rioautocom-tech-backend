import React from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";

export default function LoginPage() {
  const nav = useNavigate();
  const { auth, setAuthState } = useAuth();
  const { show, Toast } = useToast();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => { if (auth?.access_token) nav("/tickets"); }, [auth, nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(username.trim(), password);
      setAuthState({ ...data, username: username.trim() });
      show("Login realizado!", "success");
      nav("/tickets");
    } catch (err: any) {
      show(err?.message || "Falha no login", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 40 }}>
      <div className="card">
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <div className="logo" style={{ width:48, height:48, borderRadius:16 }}>RA</div>
          <div>
            <div className="h1">RioAutocom tech</div>
            <div className="small">App único — login define o que você vê (cliente / técnico / admin).</div>
          </div>
        </div>

        <div className="sep" />

        <form onSubmit={onSubmit} className="grid">
          <div className="col-12">
            <label>Usuário</label>
            <input className="input" value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="ex: admin" autoComplete="username"/>
          </div>

          <div className="col-12">
            <label>Senha</label>
            <input className="input" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••" type="password" autoComplete="current-password"/>
          </div>

          <div className="col-12" style={{ display:"flex", gap:10 }}>
            <button className="btn primary" disabled={loading || !username || !password} type="submit">
              {loading ? "Entrando..." : "Entrar"}
            </button>
            <button className="btn" type="button" onClick={()=>{ setUsername("admin"); setPassword("040126"); }}>
              Usar admin
            </button>
          </div>

          <div className="col-12 small">
            Se for seu primeiro acesso como <b>CLIENTE</b>, o padrão é CNPJ + senha <b>402365</b>.
          </div>
        </form>
      </div>
      <Toast />
    </div>
  );
}
