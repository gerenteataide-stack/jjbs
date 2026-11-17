import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  appointmentServices,
  appointments,
  clients,
  reviews,
  services,
} from "../../../../db/schema";
import { getCurrentUser } from "../../../../lib/auth";

function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return noStore({ message: "Faça login para avaliar." }, 401);
    const db = await getDb();
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.userId, user.id))
      .limit(1);
    if (!client) return noStore({ eligible: [], reviews: [] });

    const [appointmentRows, reviewRows, completedRows] = await Promise.all([
      db
        .select({
          id: appointments.id,
          appointmentDate: appointments.appointmentDate,
          serviceName: services.name,
        })
        .from(appointments)
        .leftJoin(
          appointmentServices,
          eq(appointmentServices.appointmentId, appointments.id),
        )
        .leftJoin(services, eq(services.id, appointmentServices.serviceId))
        .where(eq(appointments.clientId, client.id))
        .orderBy(desc(appointments.appointmentDate))
        .limit(100),
      db
        .select()
        .from(reviews)
        .where(eq(reviews.clientId, client.id))
        .orderBy(desc(reviews.createdAt))
        .limit(100),
      db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.clientId, client.id),
            eq(appointments.status, "completed"),
          ),
        ),
    ]);

    const reviewed = new Set(reviewRows.map((item) => item.appointmentId));
    const completed = new Set(completedRows.map((item) => item.id));
    const uniqueAppointments = [
      ...new Map(appointmentRows.map((item) => [item.id, item])).values(),
    ];
    return noStore({
      eligible: uniqueAppointments.filter(
        (item) => completed.has(item.id) && !reviewed.has(item.id),
      ),
      reviews: reviewRows,
    });
  } catch {
    return noStore({ message: "Não foi possível carregar suas avaliações." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return noStore({ message: "Faça login novamente." }, 401);
    const body: unknown = await request.json();
    if (!isRecord(body)) return noStore({ message: "Dados inválidos." }, 400);

    const appointmentId =
      typeof body.appointmentId === "string" ? body.appointmentId : "";
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const ratings = [
      body.serviceQuality,
      body.resultRating,
      body.punctuality,
      body.environmentRating,
      body.overallRating,
    ];
    if (
      !appointmentId ||
      comment.length > 1500 ||
      ratings.some(
        (value) =>
          !Number.isInteger(value) || Number(value) < 1 || Number(value) > 5,
      )
    ) {
      return noStore(
        { message: "Escolha um atendimento e uma nota de 1 a 5 estrelas." },
        400,
      );
    }

    const db = await getDb();
    const [appointment, owner] = await Promise.all([
      db
        .select({
          id: appointments.id,
          clientId: appointments.clientId,
          status: appointments.status,
        })
        .from(appointments)
        .innerJoin(clients, eq(clients.id, appointments.clientId))
        .where(eq(appointments.id, appointmentId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.userId, user.id))
        .limit(1)
        .then((rows) => rows[0]),
    ]);
    if (
      !appointment ||
      !owner ||
      appointment.clientId !== owner.id ||
      appointment.status !== "completed"
    ) {
      return noStore(
        { message: "Somente atendimentos concluídos podem ser avaliados." },
        403,
      );
    }

    const status = comment ? "pending" : "approved";
    const [review] = await db
      .insert(reviews)
      .values({
        id: crypto.randomUUID(),
        appointmentId,
        clientId: owner.id,
        serviceQuality: Number(body.serviceQuality),
        resultRating: Number(body.resultRating),
        punctuality: Number(body.punctuality),
        environmentRating: Number(body.environmentRating),
        overallRating: Number(body.overallRating),
        comment: comment || null,
        status,
      })
      .returning();

    return noStore(
      {
        review,
        message: comment
          ? "Avaliação enviada. O texto ficará visível após a revisão do studio."
          : "Avaliação publicada na página principal. Obrigada!",
      },
      201,
    );
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message.includes("reviews_appointment_unique")
        ? "Este atendimento já foi avaliado."
        : "Não foi possível enviar sua avaliação.";
    return noStore({ message }, 500);
  }
}
