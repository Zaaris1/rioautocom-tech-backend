import React from "react";
import { useParams } from "react-router-dom";
import { assignTicket, closeTicket, commentTicket, getTicket, pendTicket, startTicket, Ticket, TicketUpdate } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";

function badgeStatus(s: string){
  if (s === "CONCLUIDO") return <span className="badge ok">CONCLUÍDO</span>;
  if (s === "PENDENTE") return <span className="badge warn">PENDENTE</span>;
  if (s === "EM_ATENDIMENTO") return <span className="badge">EM ATENDIMENTO</span>;
  if (s === "ATRIBUIDO") return <span className="badge">ATRIBUÍDO</span>;
  return <span className="badge">ABERTO</span>;
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const { role } = useAuth();
  const { show, Toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [updates, setUpdates] = React.useState<TicketUpdate[]>([]);
  const [comment, setComment] = React.useState("");
  const [pendMsg, setPendMsg] = React.useState("");
  const [parecer, setParecer] = React.useState("");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try { const data = await getTicket(id); setTicket(data.ticket); setUpdates(data.updates || []); }
    catch (err:any) { show(err?.message || "Erro ao carregar", "error"); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, [id]);

  const doAssign = async () => { if (!id) return;
    try { setTicket(await assignTicket(id)); show("Ticket atribuído!", "success"); await load(); }
    catch (err:any) { show(err?.message || "Erro", "error"); }
  };
  const doStart = async () => { if (!id) return;
    try { setTicket(await startTicket(id)); show("Atendimento iniciado!", "success"); await load(); }
    catch (err:any) { show(err?.message || "Erro", "error"); }
  };
  const doPend = async () => { if (!id) return;
    try { setTicket(await pendTicket(id, pendMsg)); setPendMsg(""); show("Ticket pendenciado!", "success"); await load(); }
    catch (err:any) { show(err?.message || "Erro", "error"); }
  };
  const doComment = async () => { if (!id) return;
    if (!comment.trim()) return show("Digite um comentário.", "error");
    try { await commentTicket(id, comment.trim()); setComment(""); show("Comentário enviado!", "success"); await load(); }
    catch (err:any) { show(err?.message || "Erro", "error"); }
  };
  const doClose = async () => { if (!id) return;
    if (!parecer.trim()) return show("Parecer é obrigatório para concluir.", "error");
    try { setTicket(await closeTicket(id, parecer.trim())); show("Ticket concluído!", "success"); await load(); }
    catch (err:any) { show(err?.message || "Erro", "error"); }
  };

  return (
    <div className="grid">
      <div className="col-12 card">
        {loading || !ticket ? <div className="small">Carregando...</div> :
          <>
            <div className="row" style={{ justifyContent:"space-between" }}>
              <div><div className="h2">Ticket</div><div className="small">{ticket.id}</div></div>
              <div className="row">
                {badgeStatus(ticket.status)}
                <span className={"badge " + (ticket.priority === "URGENTE" ? "danger" : "")}>{ticket.priority}</span>
                <span className="badge">{ticket.type}</span>
              </div>
            </div>

            <div className="sep" />

            <div className="grid">
              <div className="col-6">
                <div className="small">Loja</div>
                <div style={{ fontWeight:800, fontSize:16 }}>{ticket.store_name || ticket.store_id}</div>
                <div className="small">Solicitante: <b>{ticket.requester_name}</b></div>
              </div>
              <div className="col-6">
                <div className="small">Atribuído para</div>
                <div style={{ fontWeight:800, fontSize:16 }}>{ticket.assigned_to || "—"}</div>
                <div className="small">Status: <b>{ticket.status}</b></div>
              </div>
              <div className="col-12">
                <div className="small">Local</div>
                <div style={{ fontWeight:800 }}>{ticket.local}</div>
              </div>
              <div className="col-12">
                <div className="small">Problema</div>
                <div style={{ whiteSpace:"pre-wrap" }}>{ticket.problem}</div>
              </div>
            </div>

            <div className="sep" />

            <div className="row" style={{ flexWrap:"wrap", gap:10 }}>
              {(role === "TECH" || role === "ADMIN") && <>
                <button className="btn primary" onClick={doAssign}>Assumir</button>
                <button className="btn primary" onClick={doStart}>Iniciar</button>
                <button className="btn" onClick={doPend}>Pendenciar</button>
              </>}
              <button className="btn" onClick={load}>Recarregar</button>
            </div>

            {(role === "TECH" || role === "ADMIN") && <>
              <div className="sep" />
              <div className="grid">
                <div className="col-6">
                  <div className="h2">Pendência</div>
                  <label>Mensagem (opcional)</label>
                  <textarea className="input" rows={4} value={pendMsg} onChange={(e)=>setPendMsg(e.target.value)} placeholder="Ex: aguardando peça / autorização / retorno..." />
                  <div style={{ marginTop:10 }}><button className="btn" onClick={doPend}>Pendenciar</button></div>
                </div>

                <div className="col-6">
                  <div className="h2">Concluir (parecer obrigatório)</div>
                  <label>Parecer</label>
                  <textarea className="input" rows={4} value={parecer} onChange={(e)=>setParecer(e.target.value)} placeholder="Descreva o que foi feito, testes e resultado final..." />
                  <div style={{ marginTop:10 }}><button className="btn primary" onClick={doClose}>Concluir</button></div>
                  <div className="small" style={{ marginTop:8 }}>O sistema bloqueia conclusão sem parecer.</div>
                </div>
              </div>

              <div className="sep" />

              <div className="col-12">
                <div className="h2">Comentário</div>
                <label>Mensagem</label>
                <textarea className="input" rows={3} value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Ex: cheguei ao local, iniciando diagnóstico..." />
                <div style={{ marginTop:10 }}><button className="btn" onClick={doComment}>Enviar comentário</button></div>
              </div>
            </>}
          </>
        }
      </div>

      <div className="col-12 card">
        <div className="h2">Histórico</div>
        {updates.length === 0 ? <div className="small">Sem atualizações ainda.</div> :
          <div style={{ display:"grid", gap:10 }}>
            {updates.map(u => (
              <div key={u.id} className="card" style={{ padding:12, background:"rgba(0,0,0,0.18)" }}>
                <div className="row" style={{ justifyContent:"space-between" }}>
                  <div className="badge">{u.action}</div>
                  <div className="small">{u.created_at ? new Date(u.created_at).toLocaleString("pt-BR") : ""}</div>
                </div>
                {u.actor && <div className="small">por <b>{u.actor}</b></div>}
                {u.message && <div style={{ marginTop:8, whiteSpace:"pre-wrap" }}>{u.message}</div>}
              </div>
            ))}
          </div>
        }
      </div>

      <Toast />
    </div>
  );
}
