import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { lgpdPolicyVersions } from "../db/schema";

export async function getPrivacyPolicyDigest(content: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return `sha256-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function getActivePrivacyPolicy() {
  const db = await getDb();
  const [policy] = await db
    .select({ version: lgpdPolicyVersions.version, content: lgpdPolicyVersions.content, publishedAt: lgpdPolicyVersions.publishedAt })
    .from(lgpdPolicyVersions)
    .where(eq(lgpdPolicyVersions.active, true))
    .limit(1);
  return policy ?? null;
}
