"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type RequestEvent = { id: string; requestId: string; eventType: string; fromStatus: string | null; toStatus: string | null; createdAt: string };
type RequestRow = {
  id: string; type: string; status: string; details: string | null; resolutionNote: string | null;
  createdAt: string; requesterName: string | null; requesterEmail: string | null; requesterPhone: string | null;
};
type PolicyVersion = { version: string; active: boolean; publishedAt: string };
type ActivePolicy = PolicyVersion & { content: string };
type Incident = { id: string; summary: string; severity: string; status: string; detectedAt: string; impact: string | null; containment: string | null; closedAt: string | null };
type IncidentDraft = { status: string; impact: string; containment: string };

const typeLabels: Record<string, string> = { access: "Acesso", export: "Exportação", correction: "Correção", deletion: "Exclusão ou anonimização", revoke_consent: "Revogação de consentimento", other: "Outro direito" };
const statusLabels: Record<string, string> = { pending: "Recebida", in_review: "Em análise", completed: "Concluída", denied: "Não atendida" };
const incidentStatusLabels: Record<string, string> = { investigating: "Em investigação", contained: "Contido", closed: "Encerrado" };
const severityLabels: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" };
const eventLabels: Record<string, string> = { created: "Solicitação recebida", status_updated: "Status atualizado" };

function localDateTimeValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function AdminPrivacyRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [policy, setPolicy] = useState<ActivePolicy | null>(null);
  const [policyHistory, setPolicyHistory] = useState<PolicyVersion[]>([]);
  const [policyVersion, setPolicyVersion] = useState("");
  const [policyContent, setPolicyContent] = useState("");
  const [policyReviewed, setPolicyReviewed] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentDrafts, setIncidentDrafts] = useState<Record<string, IncidentDraft>>({});
  const [incidentForm, setIncidentForm] = useState({ summary: "", severity: "medium", detectedAt: localDateTimeValue(), impact: "", containment: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [requestResponse, policyResponse, incidentResponse] = await Promise.all([
        fetch("/api/admin/lgpd/requests", { cache: "no-store" }),
        fetch("/api/admin/lgpd/policy", { cache: "no-store" }),
        fetch("/api/admin/lgpd/incidents", { cache: "no-store" }),
      ]);
      const [requestResult, policyResult, incidentResult] = await Promise.all([requestResponse.json(), policyResponse.json(), incidentResponse.json()]);
      if (!requestResponse.ok || !policyResponse.ok || !incidentResponse.ok) throw new Error(requestResult.message ?? policyResult.message ?? incidentResult.message ?? "Acesso administrativo necessário.");
      setRows(requestResult.requests ?? []); setEvents(requestResult.events ?? []);
      setPolicy(policyResult.activePolicy ?? null); setPolicyHistory(policyResult.history ?? []);
      setPolicyContent((current) => current || policyResult.initialDraft || "");
      const nextIncidents: Incident[] = incidentResult.incidents ?? [];
      setIncidents(nextIncidents);
      setIncidentDrafts(Object.fromEntries(nextIncidents.map((incident) => [incident.id, { status: incident.status, impact: incident.impact ?? "", containment: incident.containment ?? "" }])));
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível carregar a área de privacidade.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function updateRequest(row: RequestRow, status: string) {
    setSavingId(row.id); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/admin/lgpd/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, status, resolutionNote: notes[row.id] ?? row.resolutionNote ?? "" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível atualizar a solicitação.");
      setMessage(result.message); await load();
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível atualizar a solicitação."); }
    finally { setSavingId(""); }
  }

  async function publishPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingId("policy"); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/admin/lgpd/policy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: policyVersion, content: policyContent, confirmedReviewed: policyReviewed }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível publicar a política.");
      setPolicyVersion(""); setPolicyReviewed(false); setMessage(result.message); await load();
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível publicar a política."); }
    finally { setSavingId(""); }
  }

  async function createIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingId("incident"); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/admin/lgpd/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...incidentForm, detectedAt: new Date(incidentForm.detectedAt).toISOString() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível registrar o incidente.");
      setIncidentForm({ summary: "", severity: "medium", detectedAt: localDateTimeValue(), impact: "", containment: "" });
      setMessage(result.message); await load();
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível registrar o incidente."); }
    finally { setSavingId(""); }
  }

  async function updateIncident(incident: Incident) {
    const draft = incidentDrafts[incident.id];
    if (!draft) return;
    setSavingId(incident.id); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/admin/lgpd/incidents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: incident.id, ...draft }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível atualizar o incidente.");
      setMessage(result.message); await load();
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível atualizar o incidente."); }
    finally { setSavingId(""); }
  }

  return <main className="admin-page">
    <header className="site-header"><a href="/admin">← Voltar ao painel</a><span className="booking-header-label">Privacidade</span></header>
    <section className="admin-shell">
      <div className="admin-heading"><div><p className="eyebrow">Dados pessoais</p><h1>Privacidade e LGPD</h1><p>Políticas, solicitações de titulares e registro de incidentes.</p></div><button className="text-button" type="button" onClick={() => void load()} disabled={loading}>Atualizar</button></div>
      {message && <p className={`admin-feedback ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{message}</p>}
      {loading ? <p className="admin-loading">Carregando área de privacidade…</p> : error ? null : <>
        <section className="admin-service-list" aria-labelledby="privacy-policy-heading">
          <article><div><p className="eyebrow">Publicação controlada</p><h2 id="privacy-policy-heading">Política de privacidade</h2>
            {policy ? <p>Versão ativa: <strong>{policy.version}</strong> · publicada em {new Date(policy.publishedAt).toLocaleString("pt-BR")}</p> : <p>Nenhuma versão revisada foi publicada. As autorizações novas ficam bloqueadas até a publicação.</p>}
            <p>O texto só passa a ser a versão ativa depois de uma revisão jurídica e da publicação explícita.</p>
            {policyHistory.length > 0 && <p>Histórico: {policyHistory.map((item) => `${item.version}${item.active ? " (ativa)" : ""}`).join(" · ")}</p>}
          </div><form onSubmit={publishPolicy}>
            <label>Nova versão<input value={policyVersion} onChange={(event) => setPolicyVersion(event.target.value)} maxLength={40} required placeholder="ex.: 2026-11-v1" /></label>
            <label>Texto da política<textarea value={policyContent} onChange={(event) => setPolicyContent(event.target.value)} maxLength={20000} required /></label>
            <label><input type="checkbox" checked={policyReviewed} onChange={(event) => setPolicyReviewed(event.target.checked)} /> Confirmo que o texto foi revisado e está pronto para publicação.</label>
            <button className="button button-gold" type="submit" disabled={Boolean(savingId) || !policyReviewed}>{savingId === "policy" ? "Publicando…" : "Publicar nova versão"}</button>
          </form></article>
        </section>

        <div className="admin-heading"><div><p className="eyebrow">Direitos das titulares</p><h2>Solicitações de privacidade</h2><p>Confirme a identidade e execute o pedido antes de registrá-lo como concluído.</p></div></div>
        <p className="admin-feedback">Esta fila registra e acompanha pedidos. Confirme a identidade da titular, execute e verifique qualquer exportação, correção ou exclusão antes de concluir; registre a ação ou justificativa no campo abaixo.</p>
        {rows.length ? <div className="admin-service-list">{rows.map((row) => <article key={row.id}>
          <div><span>{typeLabels[row.type] ?? row.type} · {statusLabels[row.status] ?? row.status}</span><h3>{row.requesterName ?? "Conta indisponível"}</h3><p>{row.requesterEmail ?? "Sem e-mail"}{row.requesterPhone ? ` · ${row.requesterPhone}` : ""}</p><small>{new Date(row.createdAt).toLocaleString("pt-BR")}</small>{row.details && <p>{row.details}</p>}
            {events.some((entry) => entry.requestId === row.id) && <p><strong>Histórico:</strong> {events.filter((entry) => entry.requestId === row.id).slice().reverse().map((entry) => `${eventLabels[entry.eventType] ?? entry.eventType}${entry.toStatus ? ` (${statusLabels[entry.toStatus] ?? entry.toStatus})` : ""} · ${new Date(entry.createdAt).toLocaleString("pt-BR")}`).join(" → ")}</p>}
          </div>
          <div><label>Registro da análise<textarea maxLength={1000} value={notes[row.id] ?? row.resolutionNote ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))} /></label><div className="admin-header-actions"><button className="text-button" type="button" disabled={Boolean(savingId)} onClick={() => void updateRequest(row, "in_review")}>Em análise</button><button className="text-button" type="button" disabled={Boolean(savingId)} onClick={() => void updateRequest(row, "denied")}>Não atendida</button><button className="button button-gold" type="button" disabled={Boolean(savingId)} onClick={() => void updateRequest(row, "completed")}>{savingId === row.id ? "Salvando…" : "Concluir"}</button></div></div>
        </article>)}</div> : <p className="admin-empty">Nenhuma solicitação registrada.</p>}

        <div className="admin-heading"><div><p className="eyebrow">Resposta a incidentes</p><h2>Registro de incidentes de segurança</h2><p>Registre apenas informações operacionais; não inclua senhas, tokens ou dados pessoais desnecessários.</p></div></div>
        <section className="admin-service-list"><article><form onSubmit={createIncident}>
          <label>Resumo do incidente<textarea value={incidentForm.summary} maxLength={2000} minLength={10} required onChange={(event) => setIncidentForm((value) => ({ ...value, summary: event.target.value }))} /></label>
          <label>Gravidade<select value={incidentForm.severity} onChange={(event) => setIncidentForm((value) => ({ ...value, severity: event.target.value }))}>{Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Data e hora da detecção<input type="datetime-local" value={incidentForm.detectedAt} required onChange={(event) => setIncidentForm((value) => ({ ...value, detectedAt: event.target.value }))} /></label>
          <label>Impacto conhecido<textarea value={incidentForm.impact} maxLength={2000} onChange={(event) => setIncidentForm((value) => ({ ...value, impact: event.target.value }))} /></label>
          <label>Contenção e medidas adotadas<textarea value={incidentForm.containment} maxLength={2000} onChange={(event) => setIncidentForm((value) => ({ ...value, containment: event.target.value }))} /></label>
          <button className="button button-gold" type="submit" disabled={Boolean(savingId)}>{savingId === "incident" ? "Registrando…" : "Registrar incidente"}</button>
        </form></article>
          {incidents.map((incident) => { const draft = incidentDrafts[incident.id]; return <article key={incident.id}>
            <div><span>{severityLabels[incident.severity] ?? incident.severity} · {incidentStatusLabels[incident.status] ?? incident.status}</span><h3>{incident.summary}</h3><p>Detectado em {new Date(incident.detectedAt).toLocaleString("pt-BR")}</p>{incident.closedAt && <p>Encerrado em {new Date(incident.closedAt).toLocaleString("pt-BR")}</p>}</div>
            {draft && <div><label>Status<select value={draft.status} onChange={(event) => setIncidentDrafts((current) => ({ ...current, [incident.id]: { ...draft, status: event.target.value } }))}>{Object.entries(incidentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Impacto<textarea maxLength={2000} value={draft.impact} onChange={(event) => setIncidentDrafts((current) => ({ ...current, [incident.id]: { ...draft, impact: event.target.value } }))} /></label><label>Contenção e medidas adotadas<textarea maxLength={2000} value={draft.containment} onChange={(event) => setIncidentDrafts((current) => ({ ...current, [incident.id]: { ...draft, containment: event.target.value } }))} /></label><button className="text-button" type="button" disabled={Boolean(savingId)} onClick={() => void updateIncident(incident)}>{savingId === incident.id ? "Salvando…" : "Salvar acompanhamento"}</button></div>}
          </article>; })}
        </section>
      </>}
    </section>
  </main>;
}
