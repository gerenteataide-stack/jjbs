import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { clients, lgpdConsents, lgpdPolicyVersions, salonSettings } from "../../../../db/schema";
import { getCurrentUser } from "../../../../lib/auth";
import { getPrivacyPolicyDigest } from "../../../../lib/lgpd";
import { defaultPublicSettings } from "../../../../lib/public-settings";
function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para consultar suas preferências." }, 401);
  if (user.role !== "client") return noStore({ message: "Esta área é exclusiva da conta da cliente." }, 403);
  try {
    const db = await getDb();
    const [activePolicy] = await db.select({ version: lgpdPolicyVersions.version }).from(lgpdPolicyVersions).where(eq(lgpdPolicyVersions.active, true)).limit(1);
    const [settings] = await db.select({ privacyPolicy: salonSettings.privacyPolicy }).from(salonSettings).where(eq(salonSettings.id, "studio")).limit(1);
    const policyText = settings?.privacyPolicy ?? defaultPublicSettings.privacyPolicy;
    const policyVersion = activePolicy?.version ?? await getPrivacyPolicyDigest(policyText);
    const rows = await db.select({ purpose: lgpdConsents.purpose, granted: lgpdConsents.granted, policyVersion: lgpdConsents.policyVersion, policyText: lgpdConsents.policyText, recordedAt: lgpdConsents.recordedAt })
      .from(lgpdConsents).where(eq(lgpdConsents.userId, user.id)).orderBy(desc(lgpdConsents.recordedAt)).limit(100);
    return noStore({ history: rows, policyVersion, policyReviewRequired: !activePolicy });
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
    if (typeof values.photoConsent !== "boolean") return noStore({ message: "Informe a preferência de publicação de imagens." }, 400);
    const db = await getDb();
    const [client] = await db.select({ id: clients.id, photoConsent: clients.photoConsent }).from(clients).where(eq(clients.userId, user.id)).limit(1);
    if (!client) return noStore({ message: "Seu acesso ainda não está vinculado ao cadastro do studio." }, 409);
    const [activePolicy] = await db.select({ version: lgpdPolicyVersions.version, content: lgpdPolicyVersions.content }).from(lgpdPolicyVersions).where(eq(lgpdPolicyVersions.active, true)).limit(1);
    const hasNewGrant = values.photoConsent && !client.photoConsent;
    if (hasNewGrant && !activePolicy) return noStore({ message: "A administração ainda precisa publicar e revisar a política de privacidade antes de registrar novas autorizações." }, 409);
    const [settings] = await db.select({ privacyPolicy: salonSettings.privacyPolicy }).from(salonSettings).where(eq(salonSettings.id, "studio")).limit(1);
    const policyText = activePolicy?.content ?? settings?.privacyPolicy ?? defaultPublicSettings.privacyPolicy;
    const consentVersion = activePolicy?.version ?? await getPrivacyPolicyDigest(policyText);
    const consentChanges = [
      ...(values.photoConsent !== client.photoConsent ? [{ purpose: "photo_publication", granted: values.photoConsent }] : []),
    ];
    await db.batch([
      db.update(clients).set({ photoConsent: values.photoConsent, updatedAt: new Date() }).where(eq(clients.id, client.id)),
      ...(consentChanges.length ? [db.insert(lgpdConsents).values(consentChanges.map((consent) => ({ id: crypto.randomUUID(), userId: user.id, clientId: client.id, ...consent, policyVersion: consentVersion, policyText })))] : []),
    ]);
    return noStore({ marketingConsent: values.marketingConsent, photoConsent: values.photoConsent, message: "Preferências atualizadas." });
  } catch {
    return noStore({ message: "Não foi possível salvar suas preferências." }, 500);
  }
}
