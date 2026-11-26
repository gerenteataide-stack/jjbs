"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatHairServicePrice, hairSizes, isHairSize, type HairSize, type HairSizePrices } from "../lib/hair-sizes";

type Service = { id: string; name: string; priceCents: number | null; priceType: string; sizePrices: HairSizePrices | null };
type Catalog = { services: Service[]; dates: string[] };

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Consulta indisponível");
  return response.json();
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Fortaleza" });

function AssistantOptions() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [serviceId, setServiceId] = useState("");
  const [size, setSize] = useState<HairSize | "">("");
  const [date, setDate] = useState("");
  const [lookup, setLookup] = useState<{ date: string; slots: Record<string, string[]> | null } | null>(null);
  const [time, setTime] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void Promise.all([
      getJson<{ services: Service[] }>("/api/booking-options", signal),
      getJson<{ dates: string[] }>("/api/booking-dates", signal),
    ]).then(([{ services }, { dates }]) => {
      if (!signal.aborted) setCatalog({ services, dates });
    }).catch(() => {
      if (!signal.aborted) setCatalogError(true);
    });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    const { signal } = controller;
    const query = new URLSearchParams({ date });
    void getJson<{ serviceIdsBySlot: Record<string, string[]> }>(`/api/availability?${query}`, signal)
      .then(({ serviceIdsBySlot }) => {
        if (!signal.aborted) setLookup({ date, slots: serviceIdsBySlot ?? {} });
      })
      .catch(() => {
        if (!signal.aborted) setLookup({ date, slots: null });
      });
    return () => controller.abort();
  }, [date, attempt]);

  if (catalogError) return <><p role="status">Não foi possível carregar os serviços e as datas.</p><button type="button" onClick={() => { setCatalogError(false); setAttempt(attempt + 1); }}>Tentar novamente</button></>;
  if (!catalog) return <p role="status">Consultando serviços e datas…</p>;
  if (!catalog.services.length) return <p role="status">O catálogo está sem serviços disponíveis.</p>;

  const service = catalog.services.find((item) => item.id === serviceId);
  const result = lookup?.date === date ? lookup : null;
  const slots = Object.entries(result?.slots ?? {}).filter(([, ids]) => ids.includes(serviceId)).map(([slot]) => slot).sort();
  const bookingQuery = new URLSearchParams({ service: serviceId, hairSize: size, date, time });

  return <div className="studio-assistant-fields">
    <p>Olá! Qual serviço você gostaria de consultar?</p>
    <label>Serviço
      <select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setTime(""); }}>
        <option value="">Escolha um serviço</option>
        {catalog.services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {service && <label>Tamanho do cabelo
      <select value={size} onChange={(event) => {
        const value = event.target.value;
        setSize(isHairSize(value) ? value : "");
        setTime("");
      }}>
        <option value="">Escolha o comprimento</option>
        <option value="P">P — Pequeno</option>
        <option value="M">M — Médio</option>
        <option value="G">G — Grande</option>
        <option value="EX">EX — Extra grande</option>
      </select>
    </label>}
    {service && size && <>
      <p role="status"><strong>{formatHairServicePrice(service, size)}</strong></p>
      {catalog.dates.length ? <label>Data
        <select value={date} onChange={(event) => { setLookup(null); setDate(event.target.value); setTime(""); }}>
          <option value="">Escolha uma data</option>
          {catalog.dates.map((day) => <option key={day} value={day}>{dateFormat.format(new Date(`${day}T12:00:00Z`))}</option>)}
        </select>
      </label> : <p>Sem datas disponíveis. <Link href="/lista-de-espera">Entrar na lista de espera</Link></p>}
      {date && !result && <p role="status">Consultando horários…</p>}
      {result?.slots === null && <><p role="status">Não foi possível consultar os horários.</p><button type="button" onClick={() => { setLookup(null); setAttempt(attempt + 1); }}>Tentar novamente</button></>}
      {result?.slots && (slots.length ? <label>Horário
        <select value={time} onChange={(event) => setTime(event.target.value)}>
          <option value="">Escolha um horário</option>
          {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </select>
      </label> : <p role="status">Não há horários para este serviço nesta data. Escolha outro dia.</p>)}
      {slots.includes(time) && <Link className="home-button" href={`/agendar?${bookingQuery}`}>Continuar para agendar <span aria-hidden="true">↗</span></Link>}
    </>}
  </div>;
}

export default function StudioAssistant({ contactHref }: { contactHref: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  return <div className="studio-assistant">
    <button className="home-button studio-assistant-launch" type="button" onClick={() => { dialog.current?.showModal(); setOpen(true); }} aria-haspopup="dialog">Fale com o Studio</button>
    <dialog ref={dialog} className="studio-assistant-dialog" aria-labelledby="studio-assistant-title" onClose={() => setOpen(false)}>
      <header>
        <h2 id="studio-assistant-title">Atendimento do Studio</h2>
        <button type="button" aria-label="Fechar atendimento" onClick={() => dialog.current?.close()}>×</button>
      </header>
      {open && <AssistantOptions />}
      <footer>
        <a href={contactHref}>{contactHref === "/contato" ? "Falar com a equipe" : "Falar com a equipe pelo WhatsApp"}</a>
      </footer>
    </dialog>
  </div>;
}
