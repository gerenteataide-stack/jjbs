import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, lgpdRequests, users } from "../../../../../db/schema";
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
    return noStore({ requests });
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
    if (!id || !["in_review", "completed", "denied"].includes(status) || note.length > 1000)
      return noStore({ message: "Informe um status válido e uma observação de até 1.000 caracteres." }, 400);
    const db = await getDb();
    const [existing] = await db.select({ id: lgpdRequests.id }).from(lgpdRequests).where(eq(lgpdRequests.id, id)).limit(1);
    if (!existing) return noStore({ message: "Solicitação não encontrada." }, 404);
    const resolved = status === "completed" || status === "denied";
    await db.batch([
      db.update(lgpdRequests).set({ status, resolutionNote: note || null, resolvedBy: resolved ? admin.id : null, resolvedAt: resolved ? new Date() : null, updatedAt: new Date() }).where(eq(lgpdRequests.id, id)),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), userId: admin.id, action: "lgpd.request.updated", entity: "lgpd_request", entityId: id, metadata: { status } }),
    ]);
    return noStore({ message: "Solicitação atualizada." });
  } catch {
    return noStore({ message: "Não foi possível atualizar a solicitação." }, 500);
  }
}
