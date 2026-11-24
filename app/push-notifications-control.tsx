"use client";

/* eslint-disable react-hooks/set-state-in-effect -- a preferência depende da sessão e do suporte do navegador. */

import { useCallback, useEffect, useState } from "react";
import {
  registerPushInstallation,
  unregisterPushInstallation,
} from "../lib/firebase-web";

type Props = { audience: "studio" | "client" };

export default function PushNotificationsControl({ audience }: Props) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notificationConsent, setNotificationConsent] = useState(false);
  const [fid, setFid] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);

  const activate = useCallback(async (requestPermission: boolean) => {
    setWorking(true);
    try {
      if (!("Notification" in window)) throw new Error("Este navegador não oferece notificações push.");
      let currentPermission = Notification.permission;
      if (requestPermission && currentPermission === "default") currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
      if (currentPermission === "denied") throw new Error("As notificações estão bloqueadas nas permissões do navegador.");
      if (currentPermission !== "granted") throw new Error("Permita as notificações do site para ativá-las.");
      const installationId = await registerPushInstallation(requestPermission);
      setFid(installationId);
      setNotificationConsent(true);
      setFeedback("Notificações ativadas neste dispositivo.");
      setIsError(false);
    } finally {
      setWorking(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    void fetch("/api/account/push-installations", { cache: "no-store" })
      .then(async (response) => {
        const result: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Não foi possível carregar as preferências de notificações.");
        if (disposed || typeof result !== "object" || !result) return;
        setReady("ready" in result && result.ready === true);
        const consent = "marketingConsent" in result && result.marketingConsent === true;
        setNotificationConsent(consent || ("hasInstallation" in result && result.hasInstallation === true));
        setLoading(false);
        if ("ready" in result && result.ready === true && "Notification" in window && Notification.permission === "granted" && (audience === "studio" || consent)) {
          void activate(false).catch(() => undefined);
        }
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setFeedback(reason instanceof Error ? reason.message : "Não foi possível carregar as preferências.");
          setIsError(true);
          setLoading(false);
        }
      });
    return () => { disposed = true; };
  }, [activate, audience]);

  useEffect(() => {
    if (!fid) return;
    let disposed = false;
    let stopForeground: (() => void) | undefined;
    void import("../lib/firebase-web").then(({ listenForForegroundPush }) =>
      listenForForegroundPush((notice) => {
        if (disposed) return;
        setFeedback(`${notice.title}: ${notice.body}`);
        setIsError(false);
        window.dispatchEvent(new Event("jbs:notifications-updated"));
      }),
    ).then((unsubscribe) => { if (disposed) unsubscribe(); else stopForeground = unsubscribe; }).catch(() => undefined);
    return () => { disposed = true; stopForeground?.(); };
  }, [fid]);

  async function deactivate() {
    setWorking(true);
    setFeedback("");
    try {
      if (audience === "client") {
        const response = await fetch("/api/account/push-installations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationsEnabled: false }),
        });
        const result: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = typeof result === "object" && result && "message" in result && typeof result.message === "string" ? result.message : "Não foi possível desativar as notificações.";
          throw new Error(message);
        }
      } else if (fid) {
        await unregisterPushInstallation(fid);
      }
      if (audience === "client" && fid) await unregisterPushInstallation(fid).catch(() => undefined);
      setNotificationConsent(false);
      setFid("");
      setFeedback("Notificações desativadas.");
      setIsError(false);
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Não foi possível desativar.");
      setIsError(true);
    } finally {
      setWorking(false);
    }
  }

  async function sendTestNotification() {
    setWorking(true);
    setFeedback("");
    try {
      const response = await fetch("/api/account/push-installations/test", {
        method: "POST",
        cache: "no-store",
      });
      const result: unknown = await response.json().catch(() => ({}));
      const message = typeof result === "object" && result && "message" in result && typeof result.message === "string"
        ? result.message
        : "Não foi possível testar as notificações.";
      if (!response.ok) {
        const codes = typeof result === "object" && result && "codes" in result && Array.isArray(result.codes)
          ? result.codes.filter((code): code is string => typeof code === "string")
          : [];
        throw new Error(codes.length ? `${message} (${codes.join(", ")})` : message);
      }
      setFeedback(`${message} Confira as notificações do celular.`);
      setIsError(false);
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Não foi possível testar as notificações.");
      setIsError(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={`push-notifications-control ${audience === "studio" ? "push-notifications-studio" : "push-notifications-client"}`} aria-label="Preferências de notificações push">
      <div className="push-notifications-copy">
        <strong>{audience === "studio" ? "Avisos do studio neste dispositivo" : "Notificações da sua conta"}</strong>
        <p>{audience === "studio" ? "Receba alertas de novos agendamentos." : "Receba confirmações, atualizações da sua conta e do cartão fidelidade, além de promoções e cupons. Você pode desativar quando quiser."}</p>
      </div>
      {audience === "client" && <a href="/privacidade">Política de privacidade</a>}
      {!loading && !ready && <small className="push-setup-note">As notificações estão indisponíveis no momento.</small>}
      {ready && permission === "unsupported" && <small className="push-setup-note">Este navegador não oferece suporte a notificações push.</small>}
      {ready && permission === "denied" && <small className="push-setup-note">Permissão bloqueada. Altere-a nas configurações do navegador.</small>}
      {ready && (permission === "default" || permission === "granted") && !fid && (
        <button className="text-button" type="button" onClick={() => void activate(true).catch((reason: unknown) => { setFeedback(reason instanceof Error ? reason.message : "Não foi possível ativar."); setIsError(true); })} disabled={loading || working}>
          {working ? "Ativando…" : "Ativar notificações"}
        </button>
      )}
      {audience === "studio" && fid && (
        <button className="text-button" type="button" onClick={() => void sendTestNotification()} disabled={working}>
          Enviar notificação de teste
        </button>
      )}
      {(fid || (audience === "client" && notificationConsent)) && (
        <button className="text-button" type="button" onClick={() => void deactivate()} disabled={working}>
          {audience === "studio" ? "Desativar neste dispositivo" : "Desativar notificações da conta"}
        </button>
      )}
      {feedback && <small className={isError ? "push-feedback error" : "push-feedback"} role={isError ? "alert" : "status"}>{feedback}</small>}
    </section>
  );
}
