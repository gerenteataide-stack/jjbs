import { and, eq, gt, inArray, lt, ne, notInArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appointmentServices, appointments, blockedTimes, businessHours, clients, notifications, openScheduleDates, professionalServices, services } from "../../../../db/schema";
import { requireAdmin } from "../../../../lib/admin";
import { sendAppointmentPush } from "../../../../lib/firebase-push";
import { ADMIN_OPEN_REQUIRED_FROM, addMinutes, isClockTime, rangesOverlap, timeToMinutes, todayInFortaleza, weekdayForDate } from "../../../../lib/scheduling";

const validStatuses = new Set(["pending_confirmation", "confirmed", "in_service", "completed", "cancelled_by_client", "cancelled_by_salon", "no_show", "rescheduled"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return Response.json({ message: "Acesso restrito ao painel administrativo." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.id !== "string" || !validStatuses.has(String(body.status))) {
      return Response.json({ message: "Revise o status do agendamento." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const db = await getDb();
    const [existing] = await db.select({
      id: appointments.id,
      clientId: appointments.clientId,
      professionalId: appointments.professionalId,
      status: appointments.status,
      appointmentDate: appointments.appointmentDate,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      clientUserId: clients.userId,
      serviceName: services.name,
    }).from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
      .leftJoin(services, eq(services.id, appointmentServices.serviceId))
      .where(eq(appointments.id, body.id))
      .limit(1);
    if (!existing) return Response.json({ message: "Agendamento não encontrado." }, { status: 404, headers: { "Cache-Control": "no-store" } });

    const nextStatus = String(body.status);
    const nextDate = typeof body.appointmentDate === "string" ? body.appointmentDate.trim() : "";
    const nextStartTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
    if (body.serviceId !== undefined && typeof body.serviceId !== "string") {
      return Response.json({ message: "Escolha um serviço válido para o reagendamento." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const nextServiceId = typeof body.serviceId === "string" ? body.serviceId.trim() : "";
    let nextService: { id: string; durationMinutes: number; priceCents: number | null } | null = null;
    let nextEndTime = existing.endTime;
    if (nextDate || nextStartTime) {
      const professionalId = existing.professionalId;
      if (!professionalId) {
        return Response.json({ message: "Este agendamento não tem uma profissional associada e não pode ser reagendado." }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate < todayInFortaleza() || !isClockTime(nextStartTime)) {
        return Response.json({ message: "Escolha uma nova data e um horário válidos." }, { status: 400, headers: { "Cache-Control": "no-store" } });
      }
      if (nextServiceId) {
        const [service] = await db.select({ id: services.id, durationMinutes: services.durationMinutes, priceCents: services.priceCents }).from(services)
          .innerJoin(professionalServices, eq(professionalServices.serviceId, services.id))
          .where(and(eq(services.id, nextServiceId), eq(services.active, true), eq(professionalServices.professionalId, professionalId)))
          .limit(1);
        if (!service) return Response.json({ message: "Este serviço não está ativo para a profissional escolhida." }, { status: 409, headers: { "Cache-Control": "no-store" } });
        nextService = service;
      }
      const duration = nextService?.durationMinutes ?? timeToMinutes(existing.endTime) - timeToMinutes(existing.startTime);
      nextEndTime = addMinutes(nextStartTime, duration);
      if (!isClockTime(nextEndTime)) return Response.json({ message: "O atendimento não cabe nesse horário." }, { status: 409, headers: { "Cache-Control": "no-store" } });

      const [dateOverride] = await db.select({ serviceIds: openScheduleDates.serviceIds }).from(openScheduleDates)
        .where(and(eq(openScheduleDates.professionalId, professionalId), eq(openScheduleDates.date, nextDate))).limit(1);
      const linkedServices = nextServiceId
        ? [{ serviceId: nextServiceId }]
        : await db.select({ serviceId: appointmentServices.serviceId }).from(appointmentServices)
          .where(eq(appointmentServices.appointmentId, existing.id));
      if (!dateOverride && nextDate >= ADMIN_OPEN_REQUIRED_FROM) {
        return Response.json({ message: "Essa data ainda não foi liberada pela administração." }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      if (dateOverride && dateOverride.serviceIds !== null && linkedServices.some((item) => !dateOverride.serviceIds?.includes(item.serviceId))) {
        return Response.json({ message: "O serviço deste agendamento não está liberado para essa data." }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      if (!dateOverride && linkedServices.length) {
        const serviceRelations = await db.select({ serviceId: professionalServices.serviceId }).from(professionalServices)
          .where(and(eq(professionalServices.professionalId, professionalId), inArray(professionalServices.serviceId, linkedServices.map((item) => item.serviceId))));
        if (serviceRelations.length !== linkedServices.length) return Response.json({ message: "A profissional não atende esse serviço na data escolhida." }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      const periods = await db.select({ startTime: businessHours.startTime, endTime: businessHours.endTime, breakStart: businessHours.breakStart, breakEnd: businessHours.breakEnd }).from(businessHours)
        .where(and(eq(businessHours.professionalId, professionalId), eq(businessHours.weekday, weekdayForDate(nextDate)), eq(businessHours.active, true)));
      const insideWorkPeriod = periods.some((period) => nextStartTime === period.startTime && nextEndTime <= period.endTime
        && !(period.breakStart && period.breakEnd && rangesOverlap({ startTime: nextStartTime, endTime: nextEndTime }, { startTime: period.breakStart, endTime: period.breakEnd })));
      if (!insideWorkPeriod) return Response.json({ message: "Esse horário não está disponível no expediente da profissional." }, { status: 409, headers: { "Cache-Control": "no-store" } });
      const [blocked] = await db.select({ id: blockedTimes.id }).from(blockedTimes).where(and(
        eq(blockedTimes.professionalId, professionalId), eq(blockedTimes.blockDate, nextDate),
        lt(blockedTimes.startTime, nextEndTime), gt(blockedTimes.endTime, nextStartTime),
      )).limit(1);
      if (blocked) return Response.json({ message: "Esse horário está bloqueado pelo studio." }, { status: 409, headers: { "Cache-Control": "no-store" } });
      const [conflict] = await db.select({ id: appointments.id }).from(appointments).where(and(
        eq(appointments.professionalId, professionalId), eq(appointments.appointmentDate, nextDate),
        notInArray(appointments.status, ["cancelled_by_client", "cancelled_by_salon", "rescheduled"]),
        lt(appointments.startTime, nextEndTime), gt(appointments.endTime, nextStartTime), ne(appointments.id, existing.id),
      )).limit(1);
      if (conflict) return Response.json({ message: "Esse horário acabou de ser ocupado. Escolha outro." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const update = db.update(appointments)
      .set(nextDate ? {
        appointmentDate: nextDate,
        startTime: nextStartTime,
        endTime: nextEndTime,
        ...(nextService ? { totalEstimatedCents: nextService.priceCents, promotionId: null, couponCode: null, discountCents: 0 } : {}),
        updatedAt: new Date(),
      } : { status: nextStatus, updatedAt: new Date() })
      .where(and(eq(appointments.id, existing.id), eq(appointments.status, existing.status)))
      .returning({ id: appointments.id, status: appointments.status });
    const updateResults = await db.batch([
      update,
      ...(nextService ? [
        db.delete(appointmentServices).where(eq(appointmentServices.appointmentId, existing.id)),
        db.insert(appointmentServices).values({
          id: crypto.randomUUID(),
          appointmentId: existing.id,
          serviceId: nextService.id,
          priceCents: nextService.priceCents,
          durationMinutes: nextService.durationMinutes,
        }),
      ] : []),
    ]);
    const [updated] = updateResults[0] as { id: string; status: string }[];
    if (!updated) return Response.json({ message: "O agendamento foi atualizado em outro acesso. Recarregue a agenda." }, { status: 409, headers: { "Cache-Control": "no-store" } });

    if (nextStatus === "confirmed" && existing.status !== "confirmed" && existing.clientUserId) {
      const title = "Agendamento confirmado";
      const message = `Seu atendimento${existing.serviceName ? ` de ${existing.serviceName}` : ""} em ${existing.appointmentDate.split("-").reverse().join("/")}, às ${existing.startTime}, foi confirmado pelo studio.`;
      try {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          userId: existing.clientUserId,
          appointmentId: existing.id,
          title,
          message,
          type: "confirmation",
          channel: "in_app",
          status: "sent",
          sentAt: new Date(),
          createdBy: admin.id,
        });
      } catch (error) {
        console.error("[notifications] appointment confirmation record failed", {
          message: error instanceof Error ? error.message : "Unknown notification error",
        });
      }
      await sendAppointmentPush([existing.clientUserId], {
        title,
        body: message,
        url: "/minha-conta#notificacoes",
      });
    }

    if (nextStatus === "completed" && existing.status !== "completed" && existing.clientUserId) {
      const title = "Avalie seu atendimento";
      const message = `Seu atendimento${existing.serviceName ? ` de ${existing.serviceName}` : ""} foi concluído. Conte como foi sua experiência com uma nota de 1 a 5 estrelas.`;
      try {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          userId: existing.clientUserId,
          appointmentId: existing.id,
          title,
          message,
          type: "review_request",
          channel: "in_app",
          status: "sent",
          sentAt: new Date(),
          createdBy: admin.id,
        });
      } catch (error) {
        console.error("[notifications] review request record failed", {
          message: error instanceof Error ? error.message : "Unknown notification error",
        });
      }
      try {
        await sendAppointmentPush([existing.clientUserId], {
          title,
          body: message,
          url: "/minha-conta#avaliacoes",
        });
      } catch (error) {
        console.error("[notifications] review request push failed", {
          message: error instanceof Error ? error.message : "Unknown push error",
        });
      }
    }

    return Response.json({ appointment: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ message: "Não foi possível atualizar o agendamento." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
