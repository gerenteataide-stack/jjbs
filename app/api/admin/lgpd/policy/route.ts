import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, lgpdPolicyVersions, salonSettings } from "../../../../../db/schema";
import { requireAdmin } from "../../../../../lib/admin";

function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return noStore({ message: "Acesso restrito à administração." }, 403);
  try {
    const db = await getDb();
    const [activePolicy] = await db.select({ version: lgpdPolicyVersions.version, content: lgpdPolicyVersions.content, publishedAt: lgpdPolicyVersions.publishedAt })
      .from(lgpdPolicyVersions).where(eq(lgpdPolicyVersions.active, true)).limit(1);
    const [settings] = await db.select({ privacyPolicy: salonSettings.privacyPolicy }).from(salonSettings).where(eq(salonSettings.id, "studio")).limit(1);
    const history = await db.select({ version: lgpdPolicyVersions.version, active: lgpdPolicyVersions.active, publishedAt: lgpdPolicyVersions.publishedAt })
      .from(lgpdPolicyVersions).orderBy(desc(lgpdPolicyVersions.publishedAt)).limit(50);
    return noStore({ activePolicy: activePolicy ?? null, history, initialDraft: activePolicy?.content ?? settings?.privacyPolicy ?? "" });
  } catch {
    return noStore({ message: "Não foi possível carregar as versões da política." }, 500);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return noStore({ message: "Acesso restrito à administração." }, 403);
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return noStore({ message: "Revise a versão e o texto da política." }, 400);
    const version = typeof body.version === "string" ? body.version.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(version) || content.length < 40 || content.length > 20000 || body.confirmedReviewed !== true) {
      return noStore({ message: "Informe uma versão válida, um texto entre 40 e 20.000 caracteres e confirme a revisão jurídica." }, 400);
    }

    const db = await getDb();
    const [alreadyPublished] = await db.select({ version: lgpdPolicyVersions.version }).from(lgpdPolicyVersions).where(eq(lgpdPolicyVersions.version, version)).limit(1);
    if (alreadyPublished) return noStore({ message: "Essa versão já foi publicada. Use um identificador novo para preservar o histórico." }, 409);
    const now = new Date();
    await db.batch([
      db.update(lgpdPolicyVersions).set({ active: false }).where(eq(lgpdPolicyVersions.active, true)),
      db.insert(lgpdPolicyVersions).values({ version, content, active: true, publishedBy: admin.id, publishedAt: now }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), userId: admin.id, action: "lgpd.policy.published", entity: "lgpd_policy_version", entityId: version, metadata: { version } }),
    ]);
    return noStore({ version, publishedAt: now, message: "Nova versão da política publicada." }, 201);
  } catch {
    return noStore({ message: "Não foi possível publicar a versão. Verifique se o identificador já está em uso." }, 500);
  }
}
