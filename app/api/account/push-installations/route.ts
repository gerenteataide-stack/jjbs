import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { clients, lgpdConsents, lgpdPolicyVersions, pushInstallations, salonSettings } from "../../../../db/schema";
import { getCurrentUser } from "../../../../lib/auth";
import { internalRoles } from "../../../../lib/permissions";
import { getPrivacyPolicyDigest } from "../../../../lib/lgpd";
import { defaultPublicSettings } from "../../../../lib/public-settings";

function noStore(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para configurar notificações." }, 401);
  try {
    const db = await getDb();
    const [client] = user.role === "client"
      ? await db.select({ marketingConsent: clients.marketingConsent }).from(clients).where(eq(clients.userId, user.id)).limit(1)
      : [];
    return noStore({
      ready: Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY && process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      marketingConsent: client?.marketingConsent ?? false,
    });
  } catch {
    return noStore({ message: "Não foi possível carregar as preferências de notificações." }, 500);
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para configurar promoções." }, 401);
  if (user.role !== "client") return noStore({ message: "Esta preferência é exclusiva da conta da cliente." }, 403);
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.marketingConsent !== "boolean") return noStore({ message: "Revise a preferência de promoções." }, 400);
    const db = await getDb();
    const [client] = await db.select({ id: clients.id, marketingConsent: clients.marketingConsent }).from(clients).where(eq(clients.userId, user.id)).limit(1);
    if (!client) return noStore({ message: "Sua conta ainda não está vinculada ao cadastro de clientes do studio." }, 409);
    const [activePolicy] = await db.select({ version: lgpdPolicyVersions.version, content: lgpdPolicyVersions.content }).from(lgpdPolicyVersions).where(eq(lgpdPolicyVersions.active, true)).limit(1);
    if (body.marketingConsent && !client.marketingConsent && !activePolicy) return noStore({ message: "A administração ainda precisa publicar e revisar a política de privacidade antes de registrar novas autorizações." }, 409);
    const [settings] = await db.select({ privacyPolicy: salonSettings.privacyPolicy }).from(salonSettings).where(eq(salonSettings.id, "studio")).limit(1);
    const policyText = activePolicy?.content ?? settings?.privacyPolicy ?? defaultPublicSettings.privacyPolicy;
    const policyVersion = activePolicy?.version ?? await getPrivacyPolicyDigest(policyText);
    await db.batch([
      db.update(clients).set({ marketingConsent: body.marketingConsent, updatedAt: new Date() }).where(eq(clients.id, client.id)),
      ...(body.marketingConsent !== client.marketingConsent ? [db.insert(lgpdConsents).values({ id: crypto.randomUUID(), userId: user.id, clientId: client.id, purpose: "marketing", granted: body.marketingConsent, policyVersion, policyText })] : []),
    ]);
    return noStore({ marketingConsent: body.marketingConsent });
  } catch {
    return noStore({ message: "Não foi possível salvar sua preferência." }, 500);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para ativar notificações." }, 401);
  try {
    const body: unknown = await request.json();
    const fid = isRecord(body) && typeof body.fid === "string" ? body.fid.trim() : "";
    if (fid.length < 8 || fid.length > 256) return noStore({ message: "O identificador do dispositivo é inválido." }, 400);
    if (user.role !== "client" && !internalRoles.includes(user.role as (typeof internalRoles)[number])) return noStore({ message: "Acesso restrito." }, 403);
    const db = await getDb();
    await db.insert(pushInstallations).values({ id: crypto.randomUUID(), userId: user.id, fid })
      .onConflictDoUpdate({ target: pushInstallations.fid, set: { userId: user.id, updatedAt: new Date() } });
    return noStore({ message: "Notificações ativadas neste dispositivo." }, 201);
  } catch {
    return noStore({ message: "Não foi possível ativar as notificações." }, 500);
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore({ message: "Entre na sua conta para desativar notificações." }, 401);
  try {
    const body: unknown = await request.json();
    const fid = isRecord(body) && typeof body.fid === "string" ? body.fid.trim() : "";
    if (fid.length < 8 || fid.length > 256) return noStore({ message: "O identificador do dispositivo é inválido." }, 400);
    const db = await getDb();
    await db.delete(pushInstallations).where(and(eq(pushInstallations.userId, user.id), eq(pushInstallations.fid, fid)));
    return noStore({ message: "Notificações desativadas neste dispositivo." });
  } catch {
    return noStore({ message: "Não foi possível desativar as notificações." }, 500);
  }
}
