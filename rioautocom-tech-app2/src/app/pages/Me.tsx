import React from "react";
import { changePassword } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";

export default function MePage() {
  const { auth, setAuthState } = useAuth();
  const { show, Toast } = useToast();
  const [oldPass, setOldPass] = React.useState("");
  const [newPass, setNewPass] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const onChange = async () => {
    setLoading(true);
    try {
      await changePassword(oldPass, newPass);
      show("Senha alterada com sucesso.", "success");
      setOldPass(""); setNewPass("");
      if (auth) setAuthState({ ...auth, must_change_password: false });
    } catch (err: any) {
      show(err?.message || "Erro ao trocar senha", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid">
      <div className="col-12 card">
        <div className="h2">Minha conta</div>
        <div className="small">Usuário: <b>{auth?.username}</b> • Perfil: <b>{auth?.role}</b></div>
        {auth?.must_change_password ? (
          <div style={{ marginTop: 10 }} className="badge warn">⚠️ Você precisa trocar a senha no primeiro acesso.</div>
        ) : (
          <div style={{ marginTop: 10 }} className="badge ok">✅ Conta OK</div>
        )}
      </div>

      <div className="col-12 card">
        <div className="h2">Trocar senha</div>
        <div className="grid">
          <div className="col-6">
            <label>Senha atual</label>
            <input className="input" type="password" value={oldPass} onChange={(e)=>setOldPass(e.target.value)} />
          </div>
          <div className="col-6">
            <label>Nova senha</label>
            <input className="input" type="password" value={newPass} onChange={(e)=>setNewPass(e.target.value)} />
          </div>
          <div className="col-12">
            <button className="btn primary" disabled={loading || !oldPass || !newPass} onClick={onChange}>
              {loading ? "Salvando..." : "Alterar senha"}
            </button>
          </div>
          <div className="col-12 small">Dica: use uma senha com pelo menos 8 caracteres.</div>
        </div>
      </div>
      <Toast />
    </div>
  );
}
