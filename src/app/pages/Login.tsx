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
  const [loadingHint, setLoadingHint] = React.useState("");

  React.useEffect(() => {
    if (auth?.access_token) {
      nav("/inicio", { replace: true });
    }
  }, [auth?.access_token, nav]);

  React.useEffect(() => {
    if (!loading) {
      setLoadingHint("");
      return;
    }

    setLoadingHint("Conectando ao servidor...");

    const t1 = window.setTimeout(() => {
      setLoadingHint("Validando acesso...");
    }, 1200);

    const t2 = window.setTimeout(() => {
      setLoadingHint("Servidor iniciando, aguarde...");
    }, 5000);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [loading]);

  const canSubmit = !!username.trim() && !!password && !loading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);

    try {
      const cleanUsername = username.trim();
      const data = await login(cleanUsername, password);

      setAuthState({ ...data, username: cleanUsername });
      show("Login realizado!", "success");
      nav("/inicio", { replace: true });
    } catch (err: any) {
      show(err?.message || "Falha no login", "error");
    } finally {
      setLoading(false);
    }
  };

  const fillAdmin = () => {
    if (loading) return;
    setUsername("admin");
    setPassword("040126");
  };

  return (
    <div className="container auth-shell" style={{ maxWidth: 1080, paddingTop: 16, paddingBottom: 16 }}>
      <div className="auth-panel">
        <div className="auth-side">
          <div className="auth-brand">
            <div className="auth-logo" aria-hidden>
              <img
                src="/logo.png"
                alt="RioAutocom"
                style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 12 }}
              />
            </div>

            <div>
              <div className="h1" style={{ marginBottom: 6 }}>
                RioAutocom Tech
              </div>
              <div className="small" style={{ maxWidth: 420 }}>
                Chamados, monitoramento e gestão técnica em uma plataforma integrada.
              </div>
            </div>
          </div>

          <div className="sep" style={{ marginTop: 18, marginBottom: 18 }} />

          <div className="page-chip-row">
            <span className="badge accent">Operação</span>
            <span className="badge accentB">Monitoramento</span>
          </div>

          <div className="auth-bullets">
            <div className="auth-bullet">
              <div className="auth-bullet__title">Gestão por perfil</div>
              <div className="small">Permissões separadas para cliente, técnico e administrador.</div>
            </div>

            <div className="auth-bullet">
              <div className="auth-bullet__title">Painéis operacionais</div>
              <div className="small">Tickets, lojas, backups e certificados em uma única visão.</div>
            </div>

            <div className="auth-bullet">
              <div className="auth-bullet__title">Acesso do cliente</div>
              <div className="small">
                Usuários de cliente acessam com CNPJ e senha inicial definida pela operação.
              </div>
            </div>
          </div>
        </div>

        <div className="auth-form">
          <div className="page-section-head" style={{ marginBottom: 18 }}>
            <div>
              <h2 className="page-section-title">Entrar no painel</h2>
              <div className="page-section-sub">Informe suas credenciais para continuar.</div>
            </div>
            <span className="badge">RioAutocom</span>
          </div>

          <form onSubmit={onSubmit} className="grid">
            <div className="col-12">
              <label>Usuário</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: admin"
                autoComplete="username"
                inputMode="text"
                disabled={loading}
              />
            </div>

            <div className="col-12">
              <label>Senha</label>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                type="password"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {loading && (
              <div className="col-12">
                <div className="page-inline-note">{loadingHint || "Conectando..."}</div>
              </div>
            )}

            <div className="col-12" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
              <button className="btn primary" disabled={!canSubmit} type="submit" style={{ flex: "1 1 220px", minHeight: 46 }}>
                {loading ? "Entrando..." : "Acessar"}
              </button>

              <button
                className="btn"
                type="button"
                onClick={fillAdmin}
                disabled={loading}
                style={{ flex: "1 1 160px", minHeight: 46, borderColor: "rgba(255,138,0,0.25)" }}
              >
                Preencher admin
              </button>
            </div>

            <div className="col-12">
              <div className="highlight-note warn">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Acesso rápido</div>
                <div className="small" style={{ color: "rgba(233,240,255,0.88)" }}>
                  No celular, adicione à tela inicial para abrir como aplicativo.
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      <Toast />
    </div>
  );
}
