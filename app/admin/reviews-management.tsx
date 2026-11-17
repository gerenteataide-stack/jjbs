"use client";
/* eslint-disable react-hooks/set-state-in-effect -- avaliações são carregadas após autenticação. */
import { useEffect, useState } from "react";
import { revealEditor } from "../../lib/editor-navigation";

type Review = {
  id: string;
  clientName: string;
  serviceName: string | null;
  serviceQuality: number;
  resultRating: number;
  punctuality: number;
  environmentRating: number;
  overallRating: number;
  comment: string | null;
  status: string;
  adminResponse: string | null;
  featured: boolean;
  createdAt: string;
};

const labels: Record<string, string> = {
  pending: "Aguardando",
  approved: "Aprovada",
  hidden: "Oculta",
};

export default function ReviewsManagement() {
  const [items, setItems] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState<Review | null>(null);
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("approved");
  const [featured, setFeatured] = useState(false);

  async function load() {
    const result = await fetch("/api/admin/reviews", { cache: "no-store" });
    const data = await result.json();
    if (!result.ok) throw new Error(data.message);
    setItems(data.reviews ?? []);
  }

  useEffect(() => {
    void load().catch((cause) => setError(cause.message));
  }, []);

  function edit(item: Review) {
    revealEditor(".reviews-admin-grid aside");
    setEditing(item);
    setResponse(item.adminResponse ?? "");
    setStatus(item.status);
    setFeatured(item.featured);
  }

  async function save() {
    if (!editing) return;
    const result = await fetch("/api/admin/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        status,
        featured,
        adminResponse: response,
      }),
    });
    const data = await result.json();
    if (!result.ok) {
      setError(data.message);
      return;
    }
    setFeedback(data.message);
    setEditing(null);
    await load();
  }

  return (
    <section className="reviews-admin">
      <div className="admin-panel-heading">
        <div>
          <span>Reputação</span>
          <h2>Avaliações das clientes</h2>
        </div>
        <p>Aprove, responda, oculte ou destaque avaliações reais.</p>
      </div>
      {feedback && <p className="admin-feedback">{feedback}</p>}
      {error && <p className="admin-feedback error">{error}</p>}
      <div className="reviews-admin-grid">
        {editing && (
          <aside className="admin-service-form">
            <div className="finance-form-title">
              <span>Moderação</span>
              <h3>{editing.clientName}</h3>
            </div>
            {editing.comment ? (
              <p className="review-comment">“{editing.comment}”</p>
            ) : (
              <p className="review-comment">Avaliação enviada sem comentário.</p>
            )}
            <label>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Resposta do studio
              <textarea
                value={response}
                onChange={(event) => setResponse(event.target.value)}
              />
            </label>
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={featured}
                onChange={(event) => setFeatured(event.target.checked)}
              />
              Destacar no site
            </label>
            <button
              className="button button-gold"
              type="button"
              onClick={() => void save()}
            >
              <span>Salvar moderação</span>
              <b aria-hidden="true">→</b>
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
          </aside>
        )}
        <div className="admin-panel review-list">
          {items.length ? (
            items.map((item) => (
              <article key={item.id}>
                <div>
                  <span>
                    {labels[item.status] ?? item.status} ·{" "}
                    {item.serviceName ?? "Atendimento"}
                  </span>
                  <h3>{item.clientName}</h3>
                  <div className="review-stars" aria-label={`${item.overallRating} de 5 estrelas`}>
                    {"★".repeat(item.overallRating)}
                    {"☆".repeat(5 - item.overallRating)}
                  </div>
                  {item.comment ? (
                    <p>“{item.comment}”</p>
                  ) : (
                    <p>Avaliação enviada sem comentário.</p>
                  )}
                  <small>
                    Atendimento {item.serviceQuality} · Resultado {item.resultRating} ·
                    Pontualidade {item.punctuality} · Ambiente {item.environmentRating}
                  </small>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => edit(item)}
                >
                  Moderar
                </button>
              </article>
            ))
          ) : (
            <p className="admin-empty-state">Nenhuma avaliação enviada.</p>
          )}
        </div>
      </div>
    </section>
  );
}
