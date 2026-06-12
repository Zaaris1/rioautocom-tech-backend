import React from "react";
import { changePassword } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";

function roleLabel(role?: string) {
  if (!role) return "—";
  if (role === "ADMIN") return "Admin";
  if (role === "TECH") return "Técnico";
  if (role === "CLIENT") return "Cliente";
  return role;
}

export default function MePage() {
  const { auth, setAuthState } = useAuth();
  const { show, Toast } = useToast();

  const [oldPass, setOldPass] = React.useState("");
  const [newPass, setNewPass] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const newPassOk = newPass.trim().length >= 8;

  const onChange = async () => {
    if (!oldPass || !newPass) return;
    if (!newPassOk) return show("A nova senha deve ter pelo menos 8 caracteres.", "error");

    setLoading(true);
    try {
      await changePassword(oldPass, newPass);
      show("Senha alterada com sucesso.", "success");
      setOldPass("");
      setNewPass("");
      if (auth) setAuthState({ ...auth, must_change_password: false });
    } catch (err: any) {
      show(err?.message || "Erro ao trocar senha", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="card page-hero profile-hero">
        <div className="profile-identity">
          <div>
            <h1 className="page-hero__title">Minha conta</h1>
            <div className="page-hero__sub">Dados de acesso e segurança da conta.</div>
          </div>
          <div className="profile-badges">
            <span className="badge accent">👤 {auth?.username || "—"}</span>
            <span className="badge">🔐 {roleLabel(auth?.role)}</span>
          </div>
        </div>

        {auth?.must_change_password ? (
          <div className="highlight-note warn">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>⚠️ Troca de senha obrigatória</div>
            <div className="small" style={{ color: "rgba(233,240,255,0.90)" }}>
              No primeiro acesso, você precisa definir uma senha nova antes de continuar usando normalmente.
            </div>
          </div>
        ) : (
          <div className="highlight-note ok" style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content" }}>
            ✅ Conta OK
          </div>
        )}
      </div>

      <div className="card page-section-card">
        <div className="page-section-head">
          <div>
            <h2 className="page-section-title">Trocar senha</h2>
            <div className="page-section-sub">Atualize sua senha sempre que precisar.</div>
          </div>
          {newPass ? (
            <span className={"badge " + (newPassOk ? "ok" : "warn")}>{newPassOk ? "Boa" : "Curta"}</span>
          ) : (
            <span className="badge" style={{ opacity: 0.85 }}>Segurança</span>
          )}
        </div>

        <div className="page-soft-grid">
          <div className="col-6 page-soft-card" style={{ minWidth: 0 }}>
            <div className="page-label">Senha atual</div>
            <input
              className="input"
              type="password"
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
              autoComplete="current-password"
              placeholder="Digite sua senha atual"
            />
          </div>

          <div className="col-6 page-soft-card" style={{ minWidth: 0 }}>
            <div className="page-label">Nova senha</div>
            <input
              className="input"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              style={{
                borderColor: newPass ? (newPassOk ? "rgba(46,204,113,0.35)" : "rgba(241,196,15,0.35)") : undefined,
              }}
            />
            {newPass && !newPassOk && (
              <div className="small" style={{ marginTop: 6 }}>
                A nova senha está curta — tente 8+ caracteres.
              </div>
            )}
          </div>
        </div>

        <div className="sep" />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div className="small" style={{ maxWidth: 620 }}>
            Dica: combine letras, números e um símbolo para aumentar a segurança da conta.
          </div>
          <button
            className="btn primary"
            disabled={loading || !oldPass || !newPass || !newPassOk}
            onClick={onChange}
            style={{ minHeight: 46, minWidth: 210 }}
          >
            {loading ? "Salvando..." : "Alterar senha"}
          </button>
        </div>
      </div>

      <Toast />
    </div>
  );
}
