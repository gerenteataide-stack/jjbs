import { getActivePrivacyPolicy } from "../../lib/lgpd";
import { getPublicSettings } from "../../lib/public-settings";

/* eslint-disable @next/next/no-html-link-for-pages -- navegação pública preserva o padrão visual existente. */
export default async function PrivacyPage() {
  const settings = await getPublicSettings();
  let publishedPolicy: Awaited<ReturnType<typeof getActivePrivacyPolicy>> = null;
  try {
    publishedPolicy = await getActivePrivacyPolicy();
  } catch {
    // A política atualmente configurada permanece disponível se a nova tabela ainda não existir.
  }
  const content = publishedPolicy?.content ?? settings.privacyPolicy;
  return <main className="legal-page"><a href="/">← Voltar ao início</a><p className="eyebrow">Transparência e cuidado</p><h1>Política de <em>privacidade.</em></h1>
    {publishedPolicy && <p>Versão {publishedPolicy.version} · publicada em {publishedPolicy.publishedAt.toLocaleDateString("pt-BR")}</p>}
    <div style={{ whiteSpace: "pre-wrap" }}>{content}</div>
    <p>Para solicitar acesso, exportação, correção, anonimização, exclusão dos seus dados ou revogar consentimentos, use a <a href="/minha-conta/privacidade">central de privacidade</a> ou entre em contato diretamente com {settings.salonName}.</p>
  </main>;
}
