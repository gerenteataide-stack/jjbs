import { and, count, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { clients, lgpdRequestEvents, lgpdRequests } from "../../../../db/schema";
import { getCurrentUser } from "../../../../lib/auth";

const requestTypes = new Set(["access", "export", "correction", "deletion", "revoke_consent", "other"]);
function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para consultar suas solicitações." }, 401);
  if (user.role !== "client") return noStore({ message: "Esta área é exclusiva da conta da cliente." }, 403);
  try {
    const db = await getDb();
    const rows = await db.select({ id: lgpdRequests.id, type: lgpdRequests.type, status: lgpdRequests.status, details: lgpdRequests.details, resolutionNote: lgpdRequests.resolutionNote, createdAt: lgpdRequests.createdAt, updatedAt: lgpdRequests.updatedAt })
      .from(lgpdRequests).where(eq(lgpdRequests.userId, user.id)).orderBy(desc(lgpdRequests.createdAt)).limit(50);
    const [client] = await db.select({ marketingConsent: clients.marketingConsent, photoConsent: clients.photoConsent }).from(clients).where(eq(clients.userId, user.id)).limit(1);
    return noStore({ requests: rows, consents: client ?? { marketingConsent: false, photoConsent: false } });
  } catch {
    return noStore({ message: "Não foi possível carregar seus dados de privacidade." }, 500);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para enviar uma solicitação." }, 401);
  if (user.role !== "client") return noStore({ message: "Esta área é exclusiva da conta da cliente." }, 403);
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) return noStore({ message: "Revise a solicitação." }, 400);
    const values = body as Record<string, unknown>;
    const type = typeof values.type === "string" ? values.type : "";
    const details = typeof values.details === "string" ? values.details.trim() : "";
    if (!requestTypes.has(type) || details.length > 500) return noStore({ message: "Escolha um direito e limite os detalhes a 500 caracteres." }, 400);
    const db = await getDb();
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.userId, user.id)).limit(1);
    if (!client) return noStore({ message: "Seu acesso ainda não está vinculado ao cadastro do studio." }, 409);
    const [recent] = await db.select({ total: count() }).from(lgpdRequests).where(and(eq(lgpdRequests.userId, user.id), gte(lgpdRequests.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))));
    if ((recent?.total ?? 0) >= 3) return noStore({ message: "Você já enviou três solicitações nas últimas 24 horas." }, 429);
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(lgpdRequests).values({ id, userId: user.id, clientId: client.id, type, details: details || null }),
      db.insert(lgpdRequestEvents).values({ id: crypto.randomUUID(), requestId: id, actorUserId: user.id, eventType: "created", toStatus: "pending" }),
    ]);
    return noStore({ id, message: "Solicitação registrada para análise do studio." }, 201);
  } catch {
    return noStore({ message: "Não foi possível registrar sua solicitação." }, 500);
  }
}
