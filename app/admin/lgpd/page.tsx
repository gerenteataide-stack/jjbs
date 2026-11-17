"use client";

import { useCallback, useEffect, useState } from "react";

type RequestRow = {
  id: string;
  type: string;
  status: string;
  details: string | null;
  resolutionNote: string | null;
  createdAt: string;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
};
const typeLabels: Record<string, string> = { access: "Acesso", correction: "Correção", deletion: "Exclusão ou anonimização", revoke_consent: "Revogação de consentimento" };
const statusLabels: Record<string, string> = { pending: "Recebida", in_review: "Em análise", completed: "Concluída", denied: "Não atendida" };

export default function AdminPrivacyRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const response = await fetch("/api/admin/lgpd/requests", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Acesso administrativo necessário.");
      setRows(result.requests ?? []);
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível carregar a fila.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function update(row: RequestRow, status: string) {
    setSavingId(row.id); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/admin/lgpd/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, status, resolutionNote: notes[row.id] ?? row.resolutionNote ?? "" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível atualizar a solicitação.");
      setMessage(result.message); await load();
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível atualizar a solicitação.");
    } finally { setSavingId(""); }
  }

  return <main className="admin-page">
    <header className="site-header"><a href="/admin">← Voltar ao painel</a><span className="booking-header-label">Privacidade</span></header>
    <section className="admin-shell">
      <div className="admin-heading"><div><p className="eyebrow">Dados pessoais</p><h1>Solicitações de privacidade</h1><p>Revise cada pedido, confirme a identidade da cliente e registre a resposta.</p></div><button className="text-button" type="button" onClick={() => void load()} disabled={loading}>Atualizar</button></div>
      <p className="admin-feedback">Esta fila registra e acompanha pedidos. Exportação, correção e exclusão dos dados precisam ser executadas e verificadas pela equipe antes de marcar o pedido como concluído.</p>
      {message && <p className={`admin-feedback ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{message}</p>}
      {loading ? <p className="admin-loading">Carregando solicitações…</p> : error ? null : rows.length ? <div className="admin-service-list">
        {rows.map((row) => <article key={row.id}>
          <div><span>{typeLabels[row.type] ?? row.type} · {statusLabels[row.status] ?? row.status}</span><h2>{row.requesterName ?? "Conta indisponível"}</h2><p>{row.requesterEmail ?? "Sem e-mail"}{row.requesterPhone ? ` · ${row.requesterPhone}` : ""}</p><small>{new Date(row.createdAt).toLocaleString("pt-BR")}</small>{row.details && <p>{row.details}</p>}</div>
          <div><label>Registro da análise<textarea maxLength={1000} value={notes[row.id] ?? row.resolutionNote ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))} /></label><div className="admin-header-actions"><button className="text-button" type="button" disabled={Boolean(savingId)} onClick={() => void update(row, "in_review")}>Em análise</button><button className="text-button" type="button" disabled={Boolean(savingId)} onClick={() => void update(row, "denied")}>Não atendida</button><button className="button button-gold" type="button" disabled={Boolean(savingId)} onClick={() => void update(row, "completed")}>{savingId === row.id ? "Salvando…" : "Concluir"}</button></div></div>
        </article>)}
      </div> : <p className="admin-empty">Nenhuma solicitação registrada.</p>}
    </section>
  </main>;
}
