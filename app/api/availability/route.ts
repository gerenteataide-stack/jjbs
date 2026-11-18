import { and, asc, eq, notInArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { appointments, blockedTimes, businessHours, openScheduleDates, professionalServices, professionals, services } from "../../../db/schema";
import { buildConfiguredStartSlots, todayInFortaleza, weekdayForDate } from "../../../lib/scheduling";

const cancelledStatuses = ["cancelled_by_client", "cancelled_by_salon"];

function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId")?.trim() ?? "";
  const appointmentDate = url.searchParams.get("date")?.trim() ?? "";
  const professionalId = url.searchParams.get("professionalId")?.trim() ?? "";

  if (!serviceId && !appointmentDate) return noStore({ message: "Escolha uma data para ver os horários disponíveis." }, 400);
  if (appointmentDate && (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) || appointmentDate < todayInFortaleza())) {
    return noStore({ message: "Escolha uma data válida para o agendamento." }, 400);
  }

  try {
    const db = await getDb();
    if (!serviceId) {
      const [eligiblePairs, openDates, hours, blockRows, appointmentRows] = await Promise.all([
        db.select({ professionalId: professionals.id, serviceId: services.id, durationMinutes: services.durationMinutes })
          .from(professionalServices)
          .innerJoin(professionals, eq(professionals.id, professionalServices.professionalId))
          .innerJoin(services, eq(services.id, professionalServices.serviceId))
          .where(and(eq(professionals.active, true), eq(services.active, true))),
        db.select({ professionalId: openScheduleDates.professionalId, serviceIds: openScheduleDates.serviceIds })
          .from(openScheduleDates).innerJoin(professionals, eq(professionals.id, openScheduleDates.professionalId))
          .where(and(eq(openScheduleDates.date, appointmentDate), eq(professionals.active, true))),
        db.select({ professionalId: businessHours.professionalId, startTime: businessHours.startTime, endTime: businessHours.endTime, breakStart: businessHours.breakStart, breakEnd: businessHours.breakEnd })
          .from(businessHours)
          .innerJoin(professionals, eq(professionals.id, businessHours.professionalId))
          .where(and(eq(businessHours.weekday, weekdayForDate(appointmentDate)), eq(businessHours.active, true), eq(professionals.active, true))),
        db.select({ professionalId: blockedTimes.professionalId, startTime: blockedTimes.startTime, endTime: blockedTimes.endTime })
          .from(blockedTimes)
          .where(eq(blockedTimes.blockDate, appointmentDate)),
        db.select({ professionalId: appointments.professionalId, startTime: appointments.startTime, endTime: appointments.endTime })
          .from(appointments)
          .where(and(eq(appointments.appointmentDate, appointmentDate), notInArray(appointments.status, cancelledStatuses))),
      ]);

      const openDatesByProfessional = new Map(openDates.map(row => [row.professionalId, row.serviceIds]));
      const workingProfessionalIds = [...new Set(hours.map(row => row.professionalId))];
      const slots = new Set<string>();
      const serviceIds = new Set<string>();
      for (const professionalId of workingProfessionalIds) {
        const hasDateOverride = openDatesByProfessional.has(professionalId);
        const openServiceIds = openDatesByProfessional.get(professionalId);
        const dateServices = !hasDateOverride
          ? eligiblePairs.filter(pair => pair.professionalId === professionalId)
          : openServiceIds?.length
            ? eligiblePairs.filter(pair => pair.professionalId === professionalId && openServiceIds.includes(pair.serviceId))
            : [];
        for (const service of dateServices) serviceIds.add(service.id);
        const durations = dateServices.map((service) => service.durationMinutes).filter((duration) => duration > 0);
        if (!durations.length) continue;
        const unavailable = [
          ...blockRows.filter((row) => row.professionalId === professionalId),
          ...appointmentRows.filter((row) => row.professionalId === professionalId),
        ];
        const serviceSlots = buildConfiguredStartSlots(
          hours.filter((row) => row.professionalId === professionalId),
          Math.min(...durations),
          unavailable,
        );
        for (const slot of serviceSlots) slots.add(slot);
      }
      return noStore({ professionals: [], slots: [...slots].sort(), serviceIds: [...serviceIds] });
    }

    const [service] = await db.select({ id: services.id, durationMinutes: services.durationMinutes })
      .from(services).where(and(eq(services.id, serviceId), eq(services.active, true))).limit(1);
    if (!service) return noStore({ message: "Este serviço não está disponível para agendamento." }, 404);

    const availableProfessionals = await db.select({ id: professionals.id, name: professionals.name, title: professionals.title })
      .from(professionalServices)
      .innerJoin(professionals, eq(professionals.id, professionalServices.professionalId))
      .where(and(eq(professionalServices.serviceId, service.id), eq(professionals.active, true)))
      .orderBy(asc(professionals.displayOrder), asc(professionals.name));

    let dateProfessionals = availableProfessionals;
    if (appointmentDate) {
      const openDates = await db.select({ id: professionals.id, name: professionals.name, title: professionals.title, serviceIds: openScheduleDates.serviceIds })
        .from(openScheduleDates).innerJoin(professionals, eq(professionals.id, openScheduleDates.professionalId))
        .where(and(eq(openScheduleDates.date, appointmentDate), eq(professionals.active, true)))
        .orderBy(asc(professionals.displayOrder), asc(professionals.name));
      const overrides = new Map(openDates.map(professional => [professional.id, professional.serviceIds]));
      dateProfessionals = availableProfessionals.filter(professional => {
        if (!overrides.has(professional.id)) return true;
        return overrides.get(professional.id)?.includes(service.id) ?? false;
      })
        .map(({ id, name, title }) => ({ id, name, title }));
    }

    if (!professionalId || !appointmentDate) return noStore({ professionals: dateProfessionals, slots: [] });
    if (!appointmentDate && !availableProfessionals.some((professional) => professional.id === professionalId)) {
      return noStore({ message: "Esta profissional não atende o serviço selecionado." }, 400);
    }
    if (!dateProfessionals.some((professional) => professional.id === professionalId)) return noStore({ professionals: dateProfessionals, slots: [] });
    const hours = await db.select({ startTime: businessHours.startTime, endTime: businessHours.endTime, breakStart: businessHours.breakStart, breakEnd: businessHours.breakEnd })
      .from(businessHours)
      .where(and(eq(businessHours.professionalId, professionalId), eq(businessHours.weekday, weekdayForDate(appointmentDate)), eq(businessHours.active, true)))
      .orderBy(asc(businessHours.startTime));
    if (!hours.length) return noStore({ professionals: dateProfessionals, slots: [] });

    const [blockRows, appointmentRows] = await Promise.all([
      db.select({ startTime: blockedTimes.startTime, endTime: blockedTimes.endTime }).from(blockedTimes)
        .where(and(eq(blockedTimes.professionalId, professionalId), eq(blockedTimes.blockDate, appointmentDate))),
      db.select({ startTime: appointments.startTime, endTime: appointments.endTime }).from(appointments)
        .where(and(eq(appointments.professionalId, professionalId), eq(appointments.appointmentDate, appointmentDate), notInArray(appointments.status, cancelledStatuses))),
    ]);

    const unavailable = [...blockRows, ...appointmentRows];
    const slots = buildConfiguredStartSlots(hours, service.durationMinutes, unavailable);
    return noStore({ professionals: dateProfessionals, slots });
  } catch {
    return noStore({ message: "A agenda ainda não está configurada neste ambiente." }, 503);
  }
}
