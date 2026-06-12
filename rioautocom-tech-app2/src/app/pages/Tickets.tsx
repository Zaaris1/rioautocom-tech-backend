import React from "react";
import { Link } from "react-router-dom";
import { Ticket, listTickets } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";

function statusBadge(s: string){
  if (s === "CONCLUIDO") return <span className="badge ok">CONCLUÍDO</span>;
  if (s === "PENDENTE") return <span className="badge warn">PENDENTE</span>;
  if (s === "EM_ATENDIMENTO") return <span className="badge">EM ATENDIMENTO</span>;
  if (s === "ATRIBUIDO") return <span className="badge">ATRIBUÍDO</span>;
  return <span className="badge">ABERTO</span>;
}

export default function TicketsPage() {
  const { role } = useAuth();
  const { show, Toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [filter, setFilter] = React.useState<string>("");

  const load = async () => {
    setLoading(true);
    try { setTickets(await listTickets(filter ? { status: filter } : undefined)); }
    catch (err: any) { show(err?.message || "Erro ao carregar tickets", "error"); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { load(); }, [filter]);

  return (
    <div className="grid">
      <div className="col-12 card">
        <div className="row" style={{ justifyContent:"space-between" }}>
          <div>
            <div className="h2">Tickets</div>
            <div className="small">
              {role === "TECH" ? "Você vê e assume tickets abertos, e gerencia o atendimento."
              : role === "CLIENT" ? "Você consulta seus tickets e histórico."
              : "Admin vê tudo e pode criar tickets."}
            </div>
          </div>

          <div className="row">
            <select value={filter} onChange={(e)=>setFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="ABERTO">ABERTO</option>
              <option value="ATRIBUIDO">ATRIBUIDO</option>
              <option value="EM_ATENDIMENTO">EM_ATENDIMENTO</option>
              <option value="PENDENTE">PENDENTE</option>
              <option value="CONCLUIDO">CONCLUIDO</option>
            </select>
            <button className="btn" onClick={load} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
          </div>
        </div>
      </div>

      <div className="col-12 card">
        {loading ? <div className="small">Carregando...</div> :
         tickets.length === 0 ? <div className="small">Nenhum ticket encontrado.</div> :
          <table className="table">
            <thead>
              <tr>
                <th>Status</th><th>Loja</th><th>Tipo</th><th>Prioridade</th><th>Local</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id}>
                  <td>{statusBadge(t.status)}</td>
                  <td><div style={{ fontWeight:800 }}>{t.store_name || t.store_id}</div><div className="small">{t.requester_name}</div></td>
                  <td><span className="badge">{t.type}</span></td>
                  <td><span className={"badge " + (t.priority === "URGENTE" ? "danger" : "")}>{t.priority}</span></td>
                  <td><div style={{ fontWeight:650 }}>{t.local}</div><div className="small" style={{ maxWidth:360, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.problem}</div></td>
                  <td style={{ textAlign:"right" }}><Link className="btn primary" to={`/tickets/${t.id}`}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      <Toast />
    </div>
  );
}
