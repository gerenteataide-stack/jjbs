import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, lgpdRequestEvents, lgpdRequests, users } from "../../../../../db/schema";
import { requireAdmin } from "../../../../../lib/admin";

function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return noStore({ message: "Acesso restrito à administração." }, 403);
  try {
    const db = await getDb();
    const requests = await db.select({ id: lgpdRequests.id, userId: lgpdRequests.userId, clientId: lgpdRequests.clientId, type: lgpdRequests.type, status: lgpdRequests.status, details: lgpdRequests.details, resolutionNote: lgpdRequests.resolutionNote, resolvedAt: lgpdRequests.resolvedAt, createdAt: lgpdRequests.createdAt, updatedAt: lgpdRequests.updatedAt, requesterName: users.name, requesterEmail: users.email, requesterPhone: users.phone })
      .from(lgpdRequests).leftJoin(users, eq(users.id, lgpdRequests.userId)).orderBy(desc(lgpdRequests.createdAt)).limit(200);
    const events = requests.length ? await db.select({ id: lgpdRequestEvents.id, requestId: lgpdRequestEvents.requestId, eventType: lgpdRequestEvents.eventType, fromStatus: lgpdRequestEvents.fromStatus, toStatus: lgpdRequestEvents.toStatus, createdAt: lgpdRequestEvents.createdAt })
      .from(lgpdRequestEvents).orderBy(desc(lgpdRequestEvents.createdAt)).limit(1000) : [];
    return noStore({ requests, events });
  } catch {
    return noStore({ message: "Não foi possível carregar a fila de privacidade." }, 500);
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return noStore({ message: "Acesso restrito à administração." }, 403);
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) return noStore({ message: "Revise os dados da solicitação." }, 400);
    const values = body as Record<string, unknown>;
    const id = typeof values.id === "string" ? values.id : "";
    const status = typeof values.status === "string" ? values.status : "";
    const note = typeof values.resolutionNote === "string" ? values.resolutionNote.trim() : "";
    if (!id || !["in_review", "completed", "denied"].includes(status) || note.length > 1000 || ((status === "completed" || status === "denied") && note.length < 10))
      return noStore({ message: "Informe um status válido; para concluir ou não atender, registre ao menos 10 caracteres de justificativa, com limite de 1.000." }, 400);
    const db = await getDb();
    const [existing] = await db.select({ id: lgpdRequests.id, status: lgpdRequests.status }).from(lgpdRequests).where(eq(lgpdRequests.id, id)).limit(1);
    if (!existing) return noStore({ message: "Solicitação não encontrada." }, 404);
    const resolved = status === "completed" || status === "denied";
    const now = new Date();
    await db.batch([
      db.update(lgpdRequests).set({ status, resolutionNote: note || null, resolvedBy: resolved ? admin.id : null, resolvedAt: resolved ? now : null, updatedAt: now }).where(eq(lgpdRequests.id, id)),
      db.insert(lgpdRequestEvents).values({ id: crypto.randomUUID(), requestId: id, actorUserId: admin.id, eventType: "status_updated", fromStatus: existing.status, toStatus: status }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), userId: admin.id, action: "lgpd.request.updated", entity: "lgpd_request", entityId: id, metadata: { status } }),
    ]);
    return noStore({ message: "Solicitação atualizada." });
  } catch {
    return noStore({ message: "Não foi possível atualizar a solicitação." }, 500);
  }
}
