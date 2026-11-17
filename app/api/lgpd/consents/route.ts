import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { clients, lgpdConsents, salonSettings } from "../../../../db/schema";
import { getCurrentUser } from "../../../../lib/auth";

const defaultPolicyText = "Seus dados são utilizados apenas para atendimento, agendamento e comunicação autorizada com o studio.";
function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
async function currentPolicy(db: Awaited<ReturnType<typeof getDb>>) {
  const [settings] = await db.select({ privacyPolicy: salonSettings.privacyPolicy }).from(salonSettings).where(eq(salonSettings.id, "studio")).limit(1);
  const policyText = settings?.privacyPolicy || defaultPolicyText;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(policyText));
  const policyVersion = `sha256-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return { policyText, policyVersion };
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para consultar suas preferências." }, 401);
  if (user.role !== "client") return noStore({ message: "Esta área é exclusiva da conta da cliente." }, 403);
  try {
    const db = await getDb();
    const { policyVersion } = await currentPolicy(db);
    const rows = await db.select({ purpose: lgpdConsents.purpose, granted: lgpdConsents.granted, policyVersion: lgpdConsents.policyVersion, policyText: lgpdConsents.policyText, recordedAt: lgpdConsents.recordedAt })
      .from(lgpdConsents).where(eq(lgpdConsents.userId, user.id)).orderBy(desc(lgpdConsents.recordedAt)).limit(100);
    return noStore({ history: rows, policyVersion });
  } catch {
    return noStore({ message: "Não foi possível carregar o histórico de consentimentos." }, 500);
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para alterar suas preferências." }, 401);
  if (user.role !== "client") return noStore({ message: "Esta área é exclusiva da conta da cliente." }, 403);
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) return noStore({ message: "Revise suas preferências." }, 400);
    const values = body as Record<string, unknown>;
    if (typeof values.marketingConsent !== "boolean" || typeof values.photoConsent !== "boolean") return noStore({ message: "Informe as duas preferências de forma válida." }, 400);
    const db = await getDb();
    const [client] = await db.select({ id: clients.id, marketingConsent: clients.marketingConsent, photoConsent: clients.photoConsent }).from(clients).where(eq(clients.userId, user.id)).limit(1);
    if (!client) return noStore({ message: "Seu acesso ainda não está vinculado ao cadastro do studio." }, 409);
    const { policyText, policyVersion } = await currentPolicy(db);
    await db.batch([
      db.update(clients).set({ marketingConsent: values.marketingConsent, photoConsent: values.photoConsent, updatedAt: new Date() }).where(eq(clients.id, client.id)),
      db.insert(lgpdConsents).values([
        { id: crypto.randomUUID(), userId: user.id, clientId: client.id, purpose: "marketing", granted: values.marketingConsent, policyVersion, policyText },
        { id: crypto.randomUUID(), userId: user.id, clientId: client.id, purpose: "photo_publication", granted: values.photoConsent, policyVersion, policyText },
      ]),
    ]);
    return noStore({ marketingConsent: values.marketingConsent, photoConsent: values.photoConsent, message: "Preferências atualizadas." });
  } catch {
    return noStore({ message: "Não foi possível salvar suas preferências." }, 500);
  }
}
