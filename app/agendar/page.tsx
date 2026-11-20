"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- o preview usa links nativos nas páginas públicas. */
/* eslint-disable react-hooks/set-state-in-effect -- disponibilidade é carregada de forma assíncrona. */

import { useEffect, useMemo, useRef, useState } from "react";
import { formatWhatsapp, normalizeWhatsapp } from "../../lib/masks";
import { whatsappHref } from "../../lib/public-links";
import { PublicBrand, usePublicSettings } from "../public-settings";
import CalendarMonths from "../calendar-months";
import { todayInFortaleza } from "../../lib/scheduling";

type Service = {
  id: string;
  category: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number | null;
  priceType: string;
};
type Professional = { id: string; name: string; title: string | null };
type ClientData = { name: string; phone: string; email: string; notes: string };
type AppliedCoupon = {
  id: string;
  title: string;
  couponCode: string;
  discountType: string;
  discountValue: number;
  discountCents: number;
  comboDescription: string | null;
};

const fallbackServices: Service[] = [
  {
    id: "corte-finalizacao",
    category: "Cabelos & cortes",
    name: "Corte + finalização",
    description: "Um corte pensado para o seu rosto e para a sua rotina.",
    durationMinutes: 90,
    priceCents: 15000,
    priceType: "fixed",
  },
  {
    id: "morena-iluminada",
    category: "Coloração & mechas",
    name: "Morena iluminada",
    description: "Dimensão, brilho e uma cor que parece sua.",
    durationMinutes: 180,
    priceCents: 42000,
    priceType: "starting_at",
  },
  {
    id: "hidratacao-profunda",
    category: "Tratamentos",
    name: "Hidratação profunda",
    description: "Cuidado intenso para devolver maciez e luminosidade.",
    durationMinutes: 90,
    priceCents: 16000,
    priceType: "fixed",
  },
  {
    id: "penteado-social",
    category: "Produções",
    name: "Penteado social",
    description: "Uma finalização especial para celebrar o seu momento.",
    durationMinutes: 120,
    priceCents: 18000,
    priceType: "starting_at",
  },
  {
    id: "avaliacao",
    category: "Primeira conversa",
    name: "Avaliação personalizada",
    description: "Vamos entender seu cabelo e indicar o melhor cuidado.",
    durationMinutes: 30,
    priceCents: null,
    priceType: "consultation",
  },
];
const fallbackProfessional: Professional = {
  id: "",
  name: "A confirmar",
  title: null,
};
const steps = [
  "Data",
  "Horário",
  "Serviço",
  "Profissional",
  "Seus dados",
  "Promoção",
  "Revisão",
];

function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Fortaleza",
  })
    .format(date)
    .replace(".", "");
}
function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 === 0
    ? `${minutes / 60}h`
    : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}
function priceLabel(service: Service) {
  if (service.priceCents === null) return "Sob consulta";
  return `${service.priceType === "starting_at" ? "A partir de " : ""}${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(service.priceCents / 100)}`;
}
export default function BookingPage() {
  const settings = usePublicSettings();
  const [openDates, setOpenDates] = useState<string[]>([]);
  const [today] = useState(todayInFortaleza);
  const [datesLoading, setDatesLoading] = useState(true);
  const [datesError, setDatesError] = useState("");
  const dateOptions = useMemo(
    () => openDates.map((value) => ({ value, label: dateLabel(value) })),
    [openDates],
  );
  const [services, setServices] = useState(fallbackServices);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [availableServiceIds, setAvailableServiceIds] = useState<string[]>([]);
  const [serviceIdsBySlot, setServiceIdsBySlot] = useState<Record<string, string[]>>({});
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState(fallbackProfessional.id);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [client, setClient] = useState<ClientData>({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [error, setError] = useState("");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rescheduleId, setRescheduleId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    null,
  );
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const timeSelectionRef = useRef<HTMLFieldSetElement>(null);

  const selectedService =
    services.find((item) => item.id === serviceId) ?? services[0];
  const selectedProfessional =
    professionals.find((item) => item.id === professionalId) ??
    fallbackProfessional;
  const selectedDate =
    dateOptions.find((item) => item.value === date)?.label ??
    "Escolha uma data";
  const dateServices = services.filter((service) =>
    availableServiceIds.includes(service.id) && (serviceIdsBySlot[time] ?? []).includes(service.id),
  );

  function chooseDate(value: string) {
    if (value !== date) {
      setTime("");
      setAvailableServiceIds([]);
      setServiceIdsBySlot({});
      setProfessionals([]);
      if (date) {
        setServiceId("");
        setProfessionalId("");
        setCouponCode("");
        setAppliedCoupon(null);
      }
    }
    setDate(value);
    setStep(2);
    setError("");
  }

  useEffect(() => {
    let active = true;
    const search = new URLSearchParams(window.location.search);
    const requestedServiceId = search.get("service")?.trim() ?? "";
    const requestedProfessionalId = search.get("professional")?.trim() ?? "";
    const requestedDate = search.get("date")?.trim() ?? "";
    setRescheduleId(search.get("reschedule")?.trim() ?? "");
    if (requestedProfessionalId) setProfessionalId(requestedProfessionalId);

    void fetch("/api/booking-dates", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(result.dates)) {
          throw new Error("Não foi possível carregar as datas liberadas.");
        }
        const nextDates = result.dates.filter(
          (value: unknown): value is string =>
            typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
        );
        if (!active) return;
        setOpenDates(nextDates);
        setDatesError("");
        if (requestedDate && nextDates.includes(requestedDate)) {
          setDate(requestedDate);
          setStep(2);
        }
      })
      .catch(() => {
        if (active) setDatesError("Não foi possível carregar as datas liberadas. Tente novamente em instantes.");
      })
      .finally(() => {
        if (active) setDatesLoading(false);
      });

    void fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.user && active) {
          const account = result.user as {
            name?: string;
            phone?: string | null;
            email?: string;
          };
          setClient((current) => ({
            ...current,
            name: account.name ?? current.name,
            phone: formatWhatsapp(account.phone ?? current.phone),
            email: account.email ?? current.email,
          }));
        }
      })
      .catch(() => undefined);

    void fetch("/api/booking-options", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (
          response.ok &&
          Array.isArray(result.services) &&
          active
        ) {
          const nextServices = result.services as Service[];
          if (nextServices.length) setServices(nextServices);
          setServicesError("");
          setServiceId((current) =>
            requestedServiceId &&
            nextServices.some((service) => service.id === requestedServiceId)
              ? requestedServiceId
              : nextServices.some((service) => service.id === current)
                ? current
                : "",
          );
        } else if (active) {
          setServicesError("Não foi possível carregar os serviços agora. Tente novamente.");
        }
      })
      .catch(() => {
        if (active) setServicesError("Não foi possível carregar os serviços agora. Tente novamente.");
      })
      .finally(() => {
        if (active) setServicesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (step !== 2 || !date) return;
    const timer = window.setTimeout(() => {
      timeSelectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [date, step]);

  useEffect(() => {
    let active = true;
    if (!date || (step !== 2 && step !== 4)) {
      setAvailabilityNote("");
      setAvailabilityLoading(false);
      return () => {
        active = false;
      };
    }

    setSlots([]);
    setAvailabilityNote("");
    setAvailabilityLoading(true);
    const queryParams = new URLSearchParams({ date });
    const choosingDateAndTime = step === 2;
    if (step === 4) {
      queryParams.set("serviceId", serviceId);
      queryParams.set("time", time);
      if (professionalId) queryParams.set("professionalId", professionalId);
    }
    const query = queryParams.toString();
    void fetch(`/api/availability?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!active) return;
        setAvailabilityLoading(false);
        if (!response.ok) {
          setAvailabilityNote(
            typeof result.message === "string"
              ? result.message
              : "A disponibilidade será confirmada pelo studio.",
          );
          return;
        }
        const nextProfessionals = Array.isArray(result.professionals)
          ? (result.professionals as Professional[])
          : [];

        const nextSlots = Array.isArray(result.slots)
          ? (result.slots as string[])
          : [];

        if (choosingDateAndTime) {
          const nextServiceIds = Array.isArray(result.serviceIds)
            ? result.serviceIds.filter((value: unknown): value is string => typeof value === "string")
            : [];
          setAvailableServiceIds(nextServiceIds);
          const nextServiceIdsBySlot = result.serviceIdsBySlot && typeof result.serviceIdsBySlot === "object"
            ? Object.fromEntries(Object.entries(result.serviceIdsBySlot as Record<string, unknown>).map(([slot, ids]) => [
                slot,
                Array.isArray(ids) ? ids.filter((value): value is string => typeof value === "string") : [],
              ]))
            : {};
          setServiceIdsBySlot(nextServiceIdsBySlot);
          setProfessionals([]);
          setSlots(nextSlots);
          if (serviceId && !nextServiceIds.includes(serviceId)) {
            setServiceId("");
            setProfessionalId("");
            setCouponCode("");
            setAppliedCoupon(null);
          }
          if (!nextSlots.length) setAvailabilityNote("Não há horários de início livres nesta data.");
          return;
        }

        if (nextProfessionals.length) {
          setProfessionals(nextProfessionals);
          setProfessionalId((current) => {
            if (nextProfessionals.some((professional) => professional.id === current))
              return current;
            return "";
          });
        } else {
          setProfessionals([]);
          setProfessionalId("");
          setAvailabilityNote("Nenhuma profissional atende este serviço neste horário. Volte e escolha outro horário.");
          setSlots([]);
          return;
        }

        if (!professionalId) {
          setSlots([]);
          setAvailabilityNote("");
          return;
        }

        setSlots(nextSlots);
        if (time && !nextSlots.includes(time)) {
          setAvailabilityNote("Este horário não está disponível com esta profissional para o serviço escolhido. Volte e selecione outro horário ou profissional.");
        } else if (!nextSlots.length) {
          setAvailabilityNote(
            "Não há horários livres nesta data para este serviço e profissional.",
          );
        } else {
          setAvailabilityNote("");
          if (step === 4) setStep(5);
        }
      })
      .catch(() => {
        if (active) {
          setAvailabilityLoading(false);
          setAvailabilityNote("A agenda será confirmada pelo studio.");
        }
      });
    return () => {
      active = false;
    };
  }, [serviceId, date, professionalId, step, time]);

  function updateClient(field: keyof ClientData, value: string) {
    setClient((current) => ({ ...current, [field]: value }));
    setError("");
  }
  async function applyCoupon() {
    const normalized = couponCode.trim().toUpperCase().replace(/\s+/g, "");
    if (!normalized)
      return setError("Digite o código do cupom ou continue sem cupom.");
    setValidatingCoupon(true);
    setError("");
    setAppliedCoupon(null);
    try {
      const response = await fetch("/api/promotions/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponCode: normalized, serviceId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof result.message === "string"
            ? result.message
            : "Cupom inválido.",
        );
      setCouponCode(normalized);
      setAppliedCoupon(result.promotion as AppliedCoupon);
    } catch (couponError) {
      setError(
        couponError instanceof Error
          ? couponError.message
          : "Não foi possível validar o cupom.",
      );
    } finally {
      setValidatingCoupon(false);
    }
  }
  function goNext() {
    setError("");
    if (step === 5 && !client.name.trim())
      return setError("Informe seu nome para continuar.");
    if (step === 5 && !normalizeWhatsapp(client.phone))
      return setError("Informe um WhatsApp válido para continuar.");
    if (step === 6 && couponCode.trim() && !appliedCoupon)
      return setError(
        "Clique em aplicar para validar o cupom ou apague o código para continuar sem cupom.",
      );
    setStep((current) => Math.min(current + 1, steps.length));
  }
  function goBack() {
    setError("");
    setStep((current) => Math.max(1, current - 1));
  }
  async function submitBooking() {
    if (!acceptedPolicy)
      return setError("Aceite a política de cancelamento para finalizar.");
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          professionalId,
          appointmentDate: date,
          startTime: time,
          client,
          couponCode: appliedCoupon?.couponCode,
          rescheduleId: rescheduleId || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof result.message === "string"
            ? result.message
            : "Não foi possível registrar o agendamento agora.",
        );
      setSubmitted(true);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Não foi possível registrar o agendamento agora.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted)
    return (
      <main className="booking-page">
        <header className="site-header">
          <PublicBrand />
          <a className="header-cta" href="/contato">
            Falar com o studio <span>↗</span>
          </a>
        </header>
        <section className="booking-success" aria-live="polite">
          <p className="eyebrow">
            Pedido recebido <span>✦</span>
          </p>
          <h1>
            Seu momento
            <br />
            <em>começa a ser cuidado.</em>
          </h1>
          <p>
            Recebemos sua solicitação para{" "}
            <strong>{selectedService.name}</strong> com{" "}
            <strong>{selectedProfessional.name}</strong>, em{" "}
            <strong>{selectedDate}</strong>, às <strong>{time}</strong>. A
            confirmação definitiva será feita pelo studio. Se você estiver na
            sua conta e com notificações ativadas, também avisaremos por lá
            quando o horário for confirmado.
          </p>
          <div className="booking-success-card">
            <span>Próximo passo</span>
            <strong>Vamos confirmar seu horário pelo WhatsApp.</strong>
            <a
              className="button button-gold"
              href={whatsappHref(settings.whatsapp)}
              target="_blank"
              rel="noreferrer"
            >
              Abrir WhatsApp <span>↗</span>
            </a>
          </div>
          <a className="text-link" href="/">
            Voltar para o início <span>→</span>
          </a>
        </section>
      </main>
    );

  return (
    <main className="booking-page">
      <header className="site-header">
        <PublicBrand />
        <nav className="main-nav" aria-label="Navegação principal">
          <a href="/">Início</a>
          <a href="/servicos">Serviços</a>
          <a href="/trabalhos">Trabalhos</a>
          <a href="/#studio">O studio</a>
          <a href="/contato">Contato</a>
          <a href="/minha-conta">Minha conta</a>
        </nav>
        <span className="booking-header-label">Agendamento</span>
      </header>
      <section className="booking-shell">
        <div className="booking-intro">
          <p className="eyebrow">
            Seu próximo cuidado <span>✦</span>
          </p>
          <h1>
            Vamos encontrar
            <br />
            <em>o seu horário.</em>
          </h1>
          <p>Escolha a data, o horário, o serviço e a profissional. Cada escolha leva à próxima etapa.</p>
          <div className="booking-steps" aria-label="Etapas do agendamento">
            {steps.map((label, index) => (
              <div
                className={`booking-step ${step === index + 1 ? "current" : ""} ${step > index + 1 ? "complete" : ""}`}
                key={label}
              >
                <span>{step > index + 1 ? "✓" : `0${index + 1}`}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="booking-layout">
          <section
            className="booking-panel"
            aria-labelledby="booking-panel-title"
          >
            <div className="booking-panel-top">
              <span>Etapa 0{step}</span>
              <span>{steps[step - 1]}</span>
            </div>
            {step === 1 && (
              <div>
                <h2 id="booking-panel-title">Escolha uma data</h2>
                <p className="booking-helper">
                  Toque em uma data para ver os horários de início disponíveis.
                </p>
                {datesLoading ? (
                  <p className="booking-helper">Carregando a agenda do studio…</p>
                ) : openDates.length ? (
                  <CalendarMonths days={openDates} today={today} selectedDate={date} onSelectDate={chooseDate} />
                ) : (
                  <p className="booking-helper" role="status">
                    {datesError || "Não há datas liberadas para agendamento no momento."}
                  </p>
                )}
              </div>
            )}
            {step === 2 && (
              <div>
                <h2 id="booking-panel-title">Escolha um horário</h2>
                <p className="booking-helper">
                  Horários de início disponíveis em <strong>{selectedDate}</strong>.
                </p>
                <fieldset className="booking-fieldset" ref={timeSelectionRef} tabIndex={-1}>
                  <legend>Horários de início disponíveis</legend>
                  {availabilityLoading ? (
                    <p className="booking-helper">Carregando horários para esta data…</p>
                  ) : slots.length ? (
                    <div className="booking-time-grid">
                      {slots.map((slot) => (
                        <button
                          className={`booking-time-option ${slot === time ? "selected" : ""}`}
                          type="button"
                          key={slot}
                          aria-pressed={slot === time}
                          onClick={() => {
                            setTime(slot);
                            setError("");
                            setStep(3);
                          }}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="booking-helper" role="status">
                      {availabilityNote || "Não há horários de início livres nesta data."}
                    </p>
                  )}
                </fieldset>
              </div>
            )}
            {step === 3 && (
              <div>
                <h2 id="booking-panel-title">Agora escolha seu serviço</h2>
                <p className="booking-helper">
                  Início selecionado: <strong>{selectedDate}, às {time}</strong>. Mostramos apenas serviços liberados para esta data.
                </p>
                {servicesLoading ? <p className="booking-helper">Carregando os serviços liberados para esta data…</p> : servicesError ? <p className="booking-helper" role="status">{servicesError}</p> : dateServices.length ? <div className="booking-service-grid">
                  {dateServices.map((service) => (
                    <button
                      className={`booking-service-option ${service.id === serviceId ? "selected" : ""}`}
                      type="button"
                      key={service.id}
                      aria-pressed={service.id === serviceId}
                      onClick={() => {
                        if (service.id !== serviceId) {
                          setServiceId(service.id);
                          setProfessionals([]);
                          setProfessionalId("");
                          setCouponCode("");
                          setAppliedCoupon(null);
                        }
                        setError("");
                        setStep(4);
                      }}
                    >
                      <span className="booking-option-check" aria-hidden="true">
                        {service.id === serviceId ? "✓" : ""}
                      </span>
                      <small>{service.category}</small>
                      <strong>{service.name}</strong>
                      <span>
                        {durationLabel(service.durationMinutes)} ·{" "}
                        {priceLabel(service)}
                      </span>
                    </button>
                  ))}
                </div> : <p className="booking-helper" role="status">Nenhum serviço está disponível nesta data. Volte e escolha outra data.</p>}
              </div>
            )}
            {step === 4 && (
              <div>
                <h2 id="booking-panel-title">Escolha a profissional</h2>
                <p className="booking-helper">
                  Serviço: <strong>{selectedService.name}</strong> · {selectedDate}, às {time}. Escolha uma profissional disponível neste horário.
                </p>
                <fieldset className="booking-fieldset">
                  <legend>Profissionais disponíveis</legend>
                  {availabilityLoading ? (
                    <p className="booking-helper">Confirmando a disponibilidade deste horário…</p>
                  ) : professionals.length ? (
                    <div className="booking-date-grid">
                      {professionals.map((professional) => (
                        <button
                          className={`booking-date-option ${professional.id === professionalId ? "selected" : ""}`}
                          type="button"
                          key={professional.id}
                          aria-pressed={professional.id === professionalId}
                          onClick={() => {
                            setProfessionalId(professional.id);
                            setAvailabilityNote("Confirmando a disponibilidade do horário…");
                            setError("");
                          }}
                        >
                          <strong>{professional.name}</strong>
                          <small>{professional.title ?? "Profissional do studio"}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="booking-helper" role="status">
                      {availabilityNote || "Nenhuma profissional atende este serviço nesta data."}
                    </p>
                  )}
                </fieldset>
                {!availabilityLoading && availabilityNote && (
                  <p className="booking-helper" role="status">{availabilityNote}</p>
                )}
              </div>
            )}
            {step === 5 && (
              <div>
                <h2 id="booking-panel-title">Como podemos falar com você?</h2>
                <p className="booking-helper">
                  Usaremos estes dados somente para confirmar seu atendimento.
                </p>
                <div className="booking-form-grid">
                  <label>
                    Nome completo
                    <input
                      value={client.name}
                      onChange={(event) =>
                        updateClient("name", event.target.value)
                      }
                      placeholder="Como você prefere ser chamada?"
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    WhatsApp <span>(obrigatório)</span>
                    <input
                      type="tel"
                      value={client.phone}
                      onChange={(event) =>
                        updateClient(
                          "phone",
                          formatWhatsapp(event.target.value),
                        )
                      }
                      placeholder="(85) 99999-0000"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={15}
                      required
                      aria-required="true"
                    />
                  </label>
                  <label className="booking-full-field">
                    E-mail <span>(opcional)</span>
                    <input
                      value={client.email}
                      onChange={(event) =>
                        updateClient("email", event.target.value)
                      }
                      placeholder="voce@email.com"
                      autoComplete="email"
                      type="email"
                    />
                  </label>
                  <label className="booking-full-field">
                    Alguma observação? <span>(opcional)</span>
                    <textarea
                      value={client.notes}
                      onChange={(event) =>
                        updateClient("notes", event.target.value)
                      }
                      placeholder="Conte algo importante para o seu atendimento"
                      rows={4}
                    />
                  </label>
                </div>
              </div>
            )}
            {step === 6 && (
              <div>
                <h2 id="booking-panel-title">Você tem um cupom?</h2>
                <p className="booking-helper">
                  Digite o código da promoção. Se não tiver, pode continuar normalmente.
                </p>
                <div className="booking-coupon-box">
                  <label htmlFor="booking-coupon">Cupom de promoção</label>
                  <div>
                    <input
                      id="booking-coupon"
                      value={couponCode}
                      onChange={(event) => {
                        setCouponCode(event.target.value.toUpperCase());
                        setAppliedCoupon(null);
                        setError("");
                      }}
                      placeholder="Ex.: BELEZA10"
                      maxLength={40}
                      autoComplete="off"
                    />
                    <button className="button button-gold" type="button" onClick={() => void applyCoupon()} disabled={validatingCoupon}>
                      {validatingCoupon ? "Validando..." : "Aplicar"}
                    </button>
                  </div>
                  {appliedCoupon && <p className="booking-coupon-success"><strong>✓ {appliedCoupon.title}</strong><span>Cupom {appliedCoupon.couponCode} aplicado ao agendamento.</span></p>}
                </div>
              </div>
            )}
            {step === 7 && (
              <div>
                <h2 id="booking-panel-title">Está tudo certo?</h2>
                <p className="booking-helper">
                  Revise os detalhes antes de enviar sua solicitação.
                </p>
                <div className="booking-summary">
                  <div>
                    <span>Serviço</span>
                    <strong>{selectedService.name}</strong>
                    <small>
                      {durationLabel(selectedService.durationMinutes)} ·{" "}
                      {priceLabel(selectedService)}
                    </small>
                  </div>
                  <div>
                    <span>Data e horário</span>
                    <strong>{selectedDate}</strong>
                    <small>
                      {time} · {selectedProfessional.name}
                    </small>
                  </div>
                  <div>
                    <span>Cliente</span>
                    <strong>{client.name}</strong>
                    <small>
                      {client.phone}
                      {client.email ? ` · ${client.email}` : ""}
                    </small>
                  </div>
                  {appliedCoupon && <div><span>Promoção</span><strong>{appliedCoupon.title}</strong><small>Cupom {appliedCoupon.couponCode}{appliedCoupon.discountCents > 0 ? ` · desconto de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(appliedCoupon.discountCents / 100)}` : ""}</small></div>}
                </div>
                <label className="booking-policy">
                  <input
                    type="checkbox"
                    checked={acceptedPolicy}
                    onChange={(event) => {
                      setAcceptedPolicy(event.target.checked);
                      setError("");
                    }}
                  />
                  <span>
                    Li e aceito a{" "}
                    <a href="/contato">política de cancelamento</a> de {settings.salonName}.
                  </span>
                </label>
                <p className="booking-policy-copy">{settings.cancellationPolicy}</p>
              </div>
            )}
            {error && (
              <p className="booking-error" role="alert">
                {error}
              </p>
            )}
            <div className="booking-actions-row">
              {step > 1 ? (
                <button className="text-button" type="button" onClick={goBack}>
                  ← Voltar
                </button>
              ) : (
                <a className="text-button" href="/servicos">
                  Ver serviços
                </a>
              )}
              {step >= 5 && step < steps.length ? (
                <button
                  className="button button-gold"
                  type="button"
                  onClick={goNext}
                >
                  Continuar <span>↗</span>
                </button>
              ) : step === steps.length ? (
                <button
                  className="button button-gold"
                  type="button"
                  onClick={submitBooking}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Enviando..." : "Solicitar horário"}{" "}
                  <span>↗</span>
                </button>
              ) : null}
            </div>
          </section>
          <aside className="booking-aside">
            <div className="booking-aside-card">
              <span className="contact-card-label">Seu cuidado</span>
              <h2>{serviceId ? selectedService.name : "Seu horário"}</h2>
              <p>{serviceId ? selectedService.description : "Escolha uma data e um horário de início para começar."}</p>
              {date && time && (
                <div className="booking-aside-detail">
                  <span>Data e início</span>
                  <strong>{selectedDate}, {time}</strong>
                </div>
              )}
              {serviceId && (
                <>
                  <div className="booking-aside-detail">
                    <span>Profissional</span>
                    <strong>{professionalId ? selectedProfessional.name : "A escolher"}</strong>
                  </div>
                  <div className="booking-aside-detail">
                    <span>Duração estimada</span>
                    <strong>{durationLabel(selectedService.durationMinutes)}</strong>
                  </div>
                  <div className="booking-aside-detail">
                    <span>Investimento</span>
                    <strong>{priceLabel(selectedService)}</strong>
                  </div>
                </>
              )}
            </div>
            <div className="booking-aside-note">
              <span>✦</span>
              <p>
                Se o serviço precisar de avaliação, a equipe confirma os
                detalhes com você antes de reservar. {settings.depositPercent > 0 ? `Para confirmar, o sinal é de ${settings.depositPercent}%. ` : ""}A tolerância de atraso é de {settings.toleranceMinutes} minutos.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
