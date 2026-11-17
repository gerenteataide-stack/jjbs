"use client";

import { FormEvent, useEffect, useState } from "react";

type PrivacyRequest = { id: string; type: string; status: string; details: string | null; resolutionNote: string | null; createdAt: string };
type ConsentRecord = { purpose: string; granted: boolean; policyVersion: string; policyText: string; recordedAt: string };
const typeLabels: Record<string, string> = { access: "Acesso aos dados", correction: "Correção de dados", deletion: "Exclusão ou anonimização", revoke_consent: "Revogação de consentimento" };
const statusLabels: Record<string, string> = { pending: "Recebida", in_review: "Em análise", completed: "Concluída", denied: "Não atendida" };
const purposeLabels: Record<string, string> = { marketing: "Comunicações e promoções", photo_publication: "Publicação de imagens" };

export default function PrivacyCenterPage() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [consentHistory, setConsentHistory] = useState<ConsentRecord[]>([]);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [type, setType] = useState("access");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [requestResponse, consentResponse] = await Promise.all([
        fetch("/api/lgpd/requests", { cache: "no-store" }),
        fetch("/api/lgpd/consents", { cache: "no-store" }),
      ]);
      const [result, consentResult] = await Promise.all([requestResponse.json(), consentResponse.json()]);
      if (!requestResponse.ok || !consentResponse.ok) throw new Error(result.message ?? consentResult.message ?? "Entre na sua conta para acessar a central.");
      setRequests(result.requests ?? []);
      setMarketingConsent(result.consents?.marketingConsent === true);
      setPhotoConsent(result.consents?.photoConsent === true);
      setConsentHistory(consentResult.history ?? []);
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Não foi possível carregar a central.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function saveConsents() {
    setSaving(true); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/lgpd/consents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marketingConsent, photoConsent }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível salvar.");
      setMessage(result.message); await load();
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/lgpd/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, details }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível enviar.");
      setDetails(""); setMessage(result.message); await load();
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : "Não foi possível enviar."); }
    finally { setSaving(false); }
  }

  return <main className="legal-page">
    <a href="/minha-conta">← Voltar para minha conta</a>
    <p className="eyebrow">Privacidade e dados pessoais</p>
    <h1>Central de <em>privacidade.</em></h1>
    <p>Consulte ou altere suas preferências e envie uma solicitação sobre seus dados. Solicitações são analisadas pela administração após confirmação da identidade.</p>
    <p><a href="/privacidade">Leia a política de privacidade atual</a></p>
    {message && <p role={error ? "alert" : "status"}>{message}</p>}
    {loading ? <p>Carregando…</p> : <>
      <section aria-labelledby="privacy-consents">
        <h2 id="privacy-consents">Suas preferências</h2>
        <label><input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} /> Aceito receber comunicações e promoções do studio.</label>
        <label><input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} /> Autorizo o uso de imagens minhas em materiais e canais do studio.</label>
        <button className="button button-gold" type="button" disabled={saving} onClick={() => void saveConsents()}>{saving ? "Salvando…" : "Salvar preferências"}</button>
      </section>
      <section aria-labelledby="privacy-request">
        <h2 id="privacy-request">Solicitar atendimento dos meus direitos</h2>
        <form onSubmit={submitRequest}>
          <label>O que deseja solicitar?
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Observação (opcional, até 500 caracteres)
            <textarea value={details} maxLength={500} onChange={(event) => setDetails(event.target.value)} placeholder="Não inclua dados sensíveis ou informações de saúde." />
          </label>
          <button className="button button-gold" type="submit" disabled={saving}>{saving ? "Enviando…" : "Enviar solicitação"}</button>
        </form>
      </section>
      <section aria-labelledby="privacy-consent-history">
        <h2 id="privacy-consent-history">Histórico de preferências</h2>
        {consentHistory.length ? consentHistory.map((item, index) => <article key={`${item.purpose}-${item.recordedAt}-${index}`}><p>{purposeLabels[item.purpose] ?? item.purpose}: {item.granted ? "autorizado" : "revogado"} · {new Date(item.recordedAt).toLocaleString("pt-BR")} · política {item.policyVersion.slice(0, 19)}</p><details><summary>Política registrada no consentimento</summary><p>{item.policyText}</p></details></article>) : <p>O histórico passa a ser registrado quando você salvar suas preferências nesta central.</p>}
      </section>
      <section aria-labelledby="privacy-history">
        <h2 id="privacy-history">Minhas solicitações</h2>
        {requests.length ? requests.map((item) => <article key={item.id}>
          <h3>{typeLabels[item.type] ?? item.type} · {statusLabels[item.status] ?? item.status}</h3>
          <p>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</p>
          {item.details && <p>{item.details}</p>}
          {item.resolutionNote && <p>Retorno do studio: {item.resolutionNote}</p>}
        </article>) : <p>Nenhuma solicitação enviada ainda.</p>}
      </section>
    </>}
  </main>;
}
