import React from "react";
import {
  BillingPlan,
  ClientSubscription,
  billingCreatePlan,
  billingListPlans,
  billingListSubscriptions,
  billingUpdatePlan,
  billingUpsertSubscription,
} from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";
import FancySelect from "../components/FancySelect";

const STATUSES = [
  { value: "TRIAL", label: "Teste" },
  { value: "ATIVO", label: "Ativo" },
  { value: "ATRASADO", label: "Em atraso" },
  { value: "BLOQUEADO", label: "Bloqueado" },
  { value: "CANCELADO", label: "Cancelado" },
];

function moneyFromCents(cents?: number | null) {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function centsFromReais(value: string) {
  const clean = String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const num = Number(clean || 0);
  return Math.round(num * 100);
}

function reaisFromCents(cents?: number | null) {
  const value = Number(cents || 0) / 100;
  return value.toFixed(2).replace(".", ",");
}

function dateInputValue(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toIsoDateOrNull(v?: string | null) {
  if (!v) return null;
  return `${v}T00:00:00.000Z`;
}

function statusLabel(status?: string) {
  if (!status) return "—";
  if (status === "SEM_CADASTRO") return "Sem mensalidade";
  return STATUSES.find((s) => s.value === status)?.label || status;
}

function statusBadgeClass(status?: string) {
  if (status === "ATIVO") return "badge accentB";
  if (status === "TRIAL") return "badge accent";
  if (status === "ATRASADO") return "badge warn";
  if (status === "BLOQUEADO" || status === "CANCELADO") return "badge danger";
  return "badge";
}

function parseFeatures(raw?: string | null) {
  const text = String(raw || "").trim();
  if (!text) return [] as string[];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return text
    .split(/[\n,;]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function BillingPage() {
  const { role, roles } = useAuth();
  const { show, Toast } = useToast();
  const canAdmin = role === "ADMIN" || (roles || []).includes("ADMIN");

  const [plans, setPlans] = React.useState<BillingPlan[]>([]);
  const [subs, setSubs] = React.useState<ClientSubscription[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const [planForm, setPlanForm] = React.useState({
    name: "",
    description: "",
    price: "",
    max_stores: "",
    max_users: "",
    features: "",
  });

  const [editPlanId, setEditPlanId] = React.useState("");
  const [editPlanPrice, setEditPlanPrice] = React.useState("");
  const [editPlanActive, setEditPlanActive] = React.useState(true);

  const [subForm, setSubForm] = React.useState({
    client_user_id: "",
    plan_id: "",
    status: "ATIVO",
    price: "",
    due_day: "",
    next_due_date: "",
    trial_until: "",
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([billingListPlans(), billingListSubscriptions()]);
      setPlans(p || []);
      setSubs(s || []);
    } catch (err: any) {
      show(err?.message || "Erro ao carregar planos e mensalidades", "error");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (canAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin]);

  React.useEffect(() => {
    if (!subForm.plan_id || subForm.price) return;
    const p = plans.find((x) => x.id === subForm.plan_id);
    if (p) setSubForm((v) => ({ ...v, price: reaisFromCents(p.monthly_price_cents) }));
  }, [subForm.plan_id, subForm.price, plans]);

  if (!canAdmin) {
    return (
      <div className="card page-hero">
        <h1 className="page-hero__title">Planos e mensalidades</h1>
        <div className="page-hero__sub">Somente administradores.</div>
      </div>
    );
  }

  const activePlans = plans.filter((p) => p.active !== false);
  const blocked = subs.filter((s) => s.status === "BLOQUEADO" || s.status === "CANCELADO").length;
  const overdue = subs.filter((s) => s.status === "ATRASADO").length;
  const active = subs.filter((s) => s.status === "ATIVO" || s.status === "TRIAL").length;
  const recurringCents = subs
    .filter((s) => s.status === "ATIVO" || s.status === "TRIAL" || s.status === "ATRASADO")
    .reduce((acc, s) => acc + Number(s.monthly_price_cents || 0), 0);

  const filteredSubs = subs.filter((s) => {
    const text = [s.client_username, s.plan_name, s.status, s.notes]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");
    const okQ = !q.trim() || text.includes(q.trim().toLowerCase());
    const okStatus = !statusFilter || s.status === statusFilter;
    return okQ && okStatus;
  });

  const createPlan = async () => {
    try {
      if (!planForm.name.trim()) return show("Informe o nome do plano.", "error");
      setSaving(true);
      await billingCreatePlan({
        name: planForm.name.trim(),
        description: planForm.description.trim() || undefined,
        monthly_price_cents: centsFromReais(planForm.price),
        max_stores: planForm.max_stores ? Number(planForm.max_stores) : null,
        max_users: planForm.max_users ? Number(planForm.max_users) : null,
        features_json: JSON.stringify(
          planForm.features
            .split(/[\n,;]/g)
            .map((x) => x.trim())
            .filter(Boolean)
        ),
        active: true,
      });
      show("Plano criado.", "success");
      setPlanForm({ name: "", description: "", price: "", max_stores: "", max_users: "", features: "" });
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao criar plano", "error");
    } finally {
      setSaving(false);
    }
  };

  const savePlanQuickEdit = async () => {
    try {
      if (!editPlanId) return show("Selecione um plano.", "error");
      setSaving(true);
      await billingUpdatePlan(editPlanId, {
        monthly_price_cents: centsFromReais(editPlanPrice),
        active: editPlanActive,
      } as any);
      show("Plano atualizado.", "success");
      setEditPlanId("");
      setEditPlanPrice("");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao atualizar plano", "error");
    } finally {
      setSaving(false);
    }
  };

  const selectSub = (s: ClientSubscription) => {
    setSubForm({
      client_user_id: s.client_user_id,
      plan_id: s.plan_id || "",
      status: s.status === "SEM_CADASTRO" ? "ATIVO" : String(s.status || "ATIVO"),
      price: reaisFromCents(s.monthly_price_cents),
      due_day: s.due_day ? String(s.due_day) : "",
      next_due_date: dateInputValue(s.next_due_date),
      trial_until: dateInputValue(s.trial_until),
      notes: s.notes || "",
    });
  };

  const saveSubscription = async () => {
    try {
      if (!subForm.client_user_id) return show("Selecione um cliente.", "error");
      setSaving(true);
      await billingUpsertSubscription(subForm.client_user_id, {
        plan_id: subForm.plan_id || null,
        status: subForm.status,
        monthly_price_cents: centsFromReais(subForm.price),
        due_day: subForm.due_day ? Number(subForm.due_day) : null,
        next_due_date: toIsoDateOrNull(subForm.next_due_date),
        trial_until: toIsoDateOrNull(subForm.trial_until),
        notes: subForm.notes.trim() || null,
      });
      show("Mensalidade do cliente atualizada.", "success");
      await load();
    } catch (err: any) {
      show(err?.message || "Erro ao salvar mensalidade", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="card page-hero">
        <div className="page-hero__head">
          <div>
            <h1 className="page-hero__title">Planos e mensalidades</h1>
            <div className="page-hero__sub">
              Controle planos comerciais, vencimentos e bloqueio de clientes sem afetar técnicos ou administradores.
            </div>
          </div>
          <div className="page-hero__actions">
            <span className="badge accent">💳 Comercial</span>
            <button className="btn" onClick={load} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
          </div>
        </div>

        <div className="page-kpis">
          <div className="page-kpi">
            <div className="page-kpi__label">Receita mensal prevista</div>
            <div className="page-kpi__value">{moneyFromCents(recurringCents)}</div>
            <div className="page-kpi__hint">Clientes ativos, teste e atraso.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Clientes liberados</div>
            <div className="page-kpi__value">{active}</div>
            <div className="page-kpi__hint">Ativos ou em teste.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Em atraso</div>
            <div className="page-kpi__value">{overdue}</div>
            <div className="page-kpi__hint">Acesso ainda liberado.</div>
          </div>
          <div className="page-kpi">
            <div className="page-kpi__label">Bloqueados</div>
            <div className="page-kpi__value">{blocked}</div>
            <div className="page-kpi__hint">Cliente perde acesso ao portal.</div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="col-5 card page-section-card">
          <div className="page-section-head">
            <div>
              <div className="h2">Criar plano</div>
              <div className="small">Defina preço, limites e recursos comerciais.</div>
            </div>
            <span className="badge accent">Planos</span>
          </div>
          <div className="sep" />
          <div className="grid">
            <div className="col-12">
              <label>Nome do plano</label>
              <input className="input" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="ex: Profissional" />
            </div>
            <div className="col-12">
              <label>Descrição</label>
              <input className="input" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} placeholder="Resumo comercial do plano" />
            </div>
            <div className="col-4">
              <label>Mensalidade</label>
              <input className="input" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} placeholder="299,90" inputMode="decimal" />
            </div>
            <div className="col-4">
              <label>Limite lojas</label>
              <input className="input" value={planForm.max_stores} onChange={(e) => setPlanForm({ ...planForm, max_stores: e.target.value })} placeholder="10" inputMode="numeric" />
            </div>
            <div className="col-4">
              <label>Limite usuários</label>
              <input className="input" value={planForm.max_users} onChange={(e) => setPlanForm({ ...planForm, max_users: e.target.value })} placeholder="8" inputMode="numeric" />
            </div>
            <div className="col-12">
              <label>Recursos</label>
              <textarea className="input" value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} placeholder="Um recurso por linha" rows={4} />
            </div>
            <div className="col-12">
              <button className="btn primary" onClick={createPlan} disabled={saving || !planForm.name.trim()} style={{ width: "100%", minHeight: 44 }}>
                Criar plano
              </button>
            </div>
          </div>
        </div>

        <div className="col-7 card page-section-card">
          <div className="page-section-head">
            <div>
              <div className="h2">Planos cadastrados</div>
              <div className="small">Os planos são usados nas mensalidades dos clientes.</div>
            </div>
            <span className="badge">{plans.length} planos</span>
          </div>
          <div className="sep" />
          <div style={{ display: "grid", gap: 10 }}>
            {plans.map((p) => {
              const features = parseFeatures(p.features_json);
              return (
                <div key={p.id} className="card" style={{ padding: 14, background: "rgba(0,0,0,0.16)", borderRadius: 18 }}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>{p.name}</div>
                        <span className={p.active ? "badge accentB" : "badge warn"}>{p.active ? "Ativo" : "Inativo"}</span>
                      </div>
                      <div className="small" style={{ marginTop: 4 }}>{p.description || "Sem descrição."}</div>
                      <div className="small" style={{ marginTop: 8 }}>
                        Limites: {p.max_stores ?? "ilimitado"} loja(s) · {p.max_users ?? "ilimitado"} usuário(s)
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 1000, fontSize: 20 }}>{moneyFromCents(p.monthly_price_cents)}</div>
                      <button className="btn" style={{ marginTop: 8 }} onClick={() => { setEditPlanId(p.id); setEditPlanPrice(reaisFromCents(p.monthly_price_cents)); setEditPlanActive(!!p.active); }}>
                        Editar preço/status
                      </button>
                    </div>
                  </div>
                  {features.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {features.map((f) => <span key={f} className="badge">✓ {f}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
            {plans.length === 0 && <div className="small">Nenhum plano cadastrado.</div>}
          </div>

          {editPlanId && (
            <div className="card" style={{ marginTop: 12, padding: 14, background: "rgba(255,138,0,0.08)", borderRadius: 18 }}>
              <div className="h2">Edição rápida do plano</div>
              <div className="grid" style={{ marginTop: 10 }}>
                <div className="col-5">
                  <label>Preço</label>
                  <input className="input" value={editPlanPrice} onChange={(e) => setEditPlanPrice(e.target.value)} inputMode="decimal" />
                </div>
                <div className="col-4">
                  <label>Status</label>
                  <FancySelect value={editPlanActive ? "1" : "0"} onChange={(v) => setEditPlanActive(v === "1")} options={[{ value: "1", label: "Ativo" }, { value: "0", label: "Inativo" }]} />
                </div>
                <div className="col-3" style={{ display: "flex", alignItems: "end" }}>
                  <button className="btn primary" onClick={savePlanQuickEdit} disabled={saving} style={{ width: "100%" }}>Salvar</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="col-12 card page-section-card">
          <div className="page-section-head">
            <div>
              <div className="h2">Mensalidades dos clientes</div>
              <div className="small">Aplique plano, vencimento e bloqueio. Bloqueio afeta apenas perfil Cliente.</div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente/plano..." style={{ width: 230 }} />
              <FancySelect value={statusFilter} onChange={setStatusFilter} placeholder="Todos" options={STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
            </div>
          </div>
          <div className="sep" />

          <div className="grid">
            <div className="col-5">
              <div className="card" style={{ padding: 14, background: "rgba(0,0,0,0.16)", borderRadius: 18, position: "sticky", top: 12 }}>
                <div className="h2">Editar mensalidade</div>
                <div className="small" style={{ marginTop: 4 }}>Selecione um cliente na lista ou preencha manualmente.</div>
                <div className="sep" />
                <div className="grid">
                  <div className="col-12">
                    <label>Cliente</label>
                    <FancySelect
                      value={subForm.client_user_id}
                      onChange={(value) => {
                        const s = subs.find((x) => x.client_user_id === value);
                        if (s) selectSub(s);
                        else setSubForm((v) => ({ ...v, client_user_id: value }));
                      }}
                      placeholder="Selecione..."
                      options={subs.map((s) => ({ value: s.client_user_id, label: s.client_username || s.client_user_id, hint: statusLabel(s.status) }))}
                    />
                  </div>
                  <div className="col-12">
                    <label>Plano</label>
                    <FancySelect
                      value={subForm.plan_id}
                      onChange={(value) => setSubForm((v) => ({ ...v, plan_id: value, price: reaisFromCents(plans.find((p) => p.id === value)?.monthly_price_cents) }))}
                      placeholder="Sem plano"
                      options={activePlans.map((p) => ({ value: p.id, label: p.name, hint: moneyFromCents(p.monthly_price_cents) }))}
                    />
                  </div>
                  <div className="col-6">
                    <label>Status</label>
                    <FancySelect value={subForm.status} onChange={(value) => setSubForm((v) => ({ ...v, status: value }))} options={STATUSES} />
                  </div>
                  <div className="col-6">
                    <label>Mensalidade</label>
                    <input className="input" value={subForm.price} onChange={(e) => setSubForm((v) => ({ ...v, price: e.target.value }))} placeholder="299,90" inputMode="decimal" />
                  </div>
                  <div className="col-4">
                    <label>Dia venc.</label>
                    <input className="input" value={subForm.due_day} onChange={(e) => setSubForm((v) => ({ ...v, due_day: e.target.value }))} placeholder="10" inputMode="numeric" />
                  </div>
                  <div className="col-4">
                    <label>Próx. venc.</label>
                    <input className="input" type="date" value={subForm.next_due_date} onChange={(e) => setSubForm((v) => ({ ...v, next_due_date: e.target.value }))} />
                  </div>
                  <div className="col-4">
                    <label>Teste até</label>
                    <input className="input" type="date" value={subForm.trial_until} onChange={(e) => setSubForm((v) => ({ ...v, trial_until: e.target.value }))} />
                  </div>
                  <div className="col-12">
                    <label>Observações internas</label>
                    <textarea className="input" rows={4} value={subForm.notes} onChange={(e) => setSubForm((v) => ({ ...v, notes: e.target.value }))} placeholder="Ex: cliente avisado sobre atraso..." />
                  </div>
                  {subForm.status === "BLOQUEADO" && (
                    <div className="col-12">
                      <div className="card" style={{ padding: 12, background: "rgba(255,70,70,0.10)", border: "1px solid rgba(255,70,70,0.20)", borderRadius: 16 }}>
                        <b>Atenção:</b> cliente bloqueado não acessa portal, chamados, lojas, relatórios ou monitoramento.
                      </div>
                    </div>
                  )}
                  <div className="col-12">
                    <button className="btn primary" onClick={saveSubscription} disabled={saving || !subForm.client_user_id} style={{ width: "100%", minHeight: 44 }}>
                      Salvar mensalidade
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-7">
              <div style={{ display: "grid", gap: 10, maxHeight: 860, overflow: "auto", paddingRight: 2 }}>
                {filteredSubs.map((s) => (
                  <button
                    key={s.client_user_id}
                    className="card"
                    onClick={() => selectSub(s)}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      background: subForm.client_user_id === s.client_user_id ? "rgba(255,138,0,0.10)" : "rgba(0,0,0,0.16)",
                      borderRadius: 18,
                      cursor: "pointer",
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ fontWeight: 1000 }}>{s.client_username || s.client_user_id}</div>
                          <span className={statusBadgeClass(String(s.status))}>{statusLabel(String(s.status))}</span>
                          {s.plan_name && <span className="badge">{s.plan_name}</span>}
                        </div>
                        <div className="small" style={{ marginTop: 6 }}>
                          Vencimento: {dateInputValue(s.next_due_date) || "—"} · Dia: {s.due_day || "—"}
                        </div>
                        {s.notes && <div className="small" style={{ marginTop: 6 }}>{s.notes}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 1000, fontSize: 18 }}>{s.monthly_price_cents != null ? moneyFromCents(s.monthly_price_cents) : "—"}</div>
                        {s.blocked_at && <div className="small" style={{ marginTop: 4 }}>Bloq.: {dateInputValue(s.blocked_at)}</div>}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredSubs.length === 0 && <div className="small">Nenhum cliente encontrado.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Toast />
    </div>
  );
}
