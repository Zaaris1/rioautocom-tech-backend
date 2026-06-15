import React from "react";
import { billingMySubscription, MySubscription } from "../api";
import { useAuth } from "../auth";

function formatDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("pt-BR");
}

function BlockedClientScreen({ sub, onLogout }: { sub: MySubscription; onLogout: () => void }) {
  return (
    <div className="container" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div className="card" style={{ width: "min(760px, 100%)", borderRadius: 24, padding: 22 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div className="logo" aria-hidden="true"><img src="/logo.png" alt="" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Acesso temporariamente bloqueado</h1>
            <div className="small" style={{ marginTop: 6 }}>Portal do Cliente RioAutocom Tech</div>
          </div>
        </div>

        <div className="sep" />

        <div className="card" style={{ padding: 14, background: "rgba(255,70,70,0.10)", border: "1px solid rgba(255,70,70,0.22)", borderRadius: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Pendência administrativa</div>
          <div style={{ lineHeight: 1.6 }}>
            {sub?.message || "O acesso da sua empresa está temporariamente bloqueado. Entre em contato com a RioAutocom para regularização."}
          </div>
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <div className="col-4">
            <div className="page-kpi">
              <div className="page-kpi__label">Status</div>
              <div className="page-kpi__value" style={{ fontSize: 20 }}>{sub?.status || "BLOQUEADO"}</div>
              <div className="page-kpi__hint">Controle de mensalidade</div>
            </div>
          </div>
          <div className="col-4">
            <div className="page-kpi">
              <div className="page-kpi__label">Plano</div>
              <div className="page-kpi__value" style={{ fontSize: 20 }}>{sub?.plan_name || "—"}</div>
              <div className="page-kpi__hint">Contrato atual</div>
            </div>
          </div>
          <div className="col-4">
            <div className="page-kpi">
              <div className="page-kpi__label">Vencimento</div>
              <div className="page-kpi__value" style={{ fontSize: 20 }}>{formatDate(sub?.next_due_date)}</div>
              <div className="page-kpi__hint">Próxima referência</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn danger" onClick={onLogout}>Sair</button>
          <div className="small" style={{ alignSelf: "center" }}>
            Técnicos e administradores continuam com acesso normal.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingGate({ children }: { children: React.ReactNode }) {
  const { role, logout, auth } = useAuth();
  const [sub, setSub] = React.useState<MySubscription | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    async function run() {
      if (role !== "CLIENT" || !auth?.access_token) {
        setSub(null);
        return;
      }
      setLoading(true);
      try {
        const data = await billingMySubscription();
        if (alive) setSub(data);
      } catch {
        // Não bloqueia o usuário se a verificação de mensalidade falhar por rede/backend.
        if (alive) setSub(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => { alive = false; };
  }, [role, auth?.access_token]);

  if (role === "CLIENT" && loading && !sub) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="card">Verificando acesso do cliente...</div>
      </div>
    );
  }

  if (role === "CLIENT" && sub?.blocked) {
    return <BlockedClientScreen sub={sub} onLogout={logout} />;
  }

  return <>{children}</>;
}
