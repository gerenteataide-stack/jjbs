import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, lgpdSecurityIncidents } from "../../../../../db/schema";
import { requireAdmin } from "../../../../../lib/admin";

function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const severities = new Set(["low", "medium", "high", "critical"]);
const statuses = new Set(["investigating", "contained", "closed"]);

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return noStore({ message: "Acesso restrito à administração." }, 403);
  try {
    const db = await getDb();
    const incidents = await db.select().from(lgpdSecurityIncidents).orderBy(desc(lgpdSecurityIncidents.detectedAt)).limit(100);
    return noStore({ incidents });
  } catch {
    return noStore({ message: "Não foi possível carregar o registro de incidentes." }, 500);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return noStore({ message: "Acesso restrito à administração." }, 403);
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return noStore({ message: "Revise os dados do incidente." }, 400);
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    const severity = typeof body.severity === "string" ? body.severity : "";
    const detectedAt = typeof body.detectedAt === "string" ? new Date(body.detectedAt) : new Date(Number.NaN);
    const impact = typeof body.impact === "string" ? body.impact.trim() : "";
    const containment = typeof body.containment === "string" ? body.containment.trim() : "";
    if (summary.length < 10 || summary.length > 2000 || !severities.has(severity) || Number.isNaN(detectedAt.getTime()) || impact.length > 2000 || containment.length > 2000)
      return noStore({ message: "Informe resumo, gravidade, data válida e notas de até 2.000 caracteres." }, 400);

    const db = await getDb();
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(lgpdSecurityIncidents).values({ id, summary, severity, detectedAt, impact: impact || null, containment: containment || null, reportedBy: admin.id }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), userId: admin.id, action: "lgpd.incident.created", entity: "lgpd_security_incident", entityId: id, metadata: { severity } }),
    ]);
    return noStore({ id, message: "Incidente registrado. Faça a avaliação e o acompanhamento necessários." }, 201);
  } catch {
    return noStore({ message: "Não foi possível registrar o incidente." }, 500);
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return noStore({ message: "Acesso restrito à administração." }, 403);
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return noStore({ message: "Revise os dados do incidente." }, 400);
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";
    const impact = typeof body.impact === "string" ? body.impact.trim() : "";
    const containment = typeof body.containment === "string" ? body.containment.trim() : "";
    if (!id || !statuses.has(status) || impact.length > 2000 || containment.length > 2000) return noStore({ message: "Informe um status válido e notas de até 2.000 caracteres." }, 400);
    const db = await getDb();
    const [existing] = await db.select({ id: lgpdSecurityIncidents.id }).from(lgpdSecurityIncidents).where(eq(lgpdSecurityIncidents.id, id)).limit(1);
    if (!existing) return noStore({ message: "Incidente não encontrado." }, 404);
    const now = new Date();
    await db.batch([
      db.update(lgpdSecurityIncidents).set({ status, impact: impact || null, containment: containment || null, closedAt: status === "closed" ? now : null, updatedAt: now }).where(eq(lgpdSecurityIncidents.id, id)),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), userId: admin.id, action: "lgpd.incident.updated", entity: "lgpd_security_incident", entityId: id, metadata: { status } }),
    ]);
    return noStore({ message: "Registro do incidente atualizado." });
  } catch {
    return noStore({ message: "Não foi possível atualizar o incidente." }, 500);
  }
}
