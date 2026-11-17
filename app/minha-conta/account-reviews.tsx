"use client";
/* eslint-disable react-hooks/set-state-in-effect -- avaliações elegíveis são carregadas após a autenticação. */
import { FormEvent, useEffect, useState } from "react";

type Eligible = {
  id: string;
  appointmentDate: string;
  serviceName: string | null;
};

export default function AccountReviews() {
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [appointmentId, setAppointmentId] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/account/reviews", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setEligible(data.eligible ?? []);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appointmentId || rating < 1 || rating > 5) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          serviceQuality: rating,
          resultRating: rating,
          punctuality: rating,
          environmentRating: rating,
          overallRating: rating,
          comment: comment.trim(),
        }),
      });
      const data = await response.json();
      setMessage(data.message);
      if (response.ok) {
        setAppointmentId("");
        setRating(0);
        setComment("");
        await load();
      }
    } catch {
      setMessage("Não foi possível enviar sua avaliação. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article
      id="avaliacoes"
      className="account-card account-review-card"
      aria-labelledby="account-review-title"
    >
      <span className="account-card-label" id="account-review-title">
        Avalie sua experiência
      </span>
      {eligible.length ? (
        <form onSubmit={submit}>
          <label>
            Atendimento
            <select
              value={appointmentId}
              onChange={(event) => setAppointmentId(event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.appointmentDate.split("-").reverse().join("/")} ·{" "}
                  {item.serviceName ?? "Atendimento"}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="account-review-rating">
            <legend>Nota geral</legend>
            <div className="account-review-stars">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`${value} estrela${value > 1 ? "s" : ""}`}
                  aria-pressed={rating === value}
                  onClick={() => setRating(value)}
                >
                  {value <= rating ? "★" : "☆"}
                </button>
              ))}
            </div>
            <small>
              {rating
                ? `${rating} estrela${rating > 1 ? "s" : ""}`
                : "Escolha de 1 a 5 estrelas."}
            </small>
          </fieldset>
          <label>
            Comentário <span>(opcional)</span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={1500}
              placeholder="Se quiser, conte como foi sua experiência."
            />
          </label>
          <button
            className="text-button"
            type="submit"
            disabled={saving || !appointmentId || rating === 0}
          >
            {saving ? "Enviando..." : "Enviar avaliação"}
          </button>
        </form>
      ) : (
        <p className="account-empty">
          Após um atendimento concluído, você poderá avaliar sua experiência aqui.
        </p>
      )}
      {message && <small role="status">{message}</small>}
    </article>
  );
}
