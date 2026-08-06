import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { urlBase64ToUint8Array, isPushSupported } from "@/lib/push";

interface PortalNotificationsToggleProps {
  token: string;
  vapidPublicKey: string | null;
}

type Status = "checking" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

// Subscribes/unsubscribes THIS browser's push registration for THIS one
// player's portal — see server/push.ts and push-sw.js for the other end.
// Renders nothing while checking or when push isn't usable at all (no
// browser support, or the server has no VAPID keys configured) rather than
// offering a button that would just fail.
export default function PortalNotificationsToggle({ token, vapidPublicKey }: PortalNotificationsToggleProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isPushSupported() || !vapidPublicKey) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "subscribed" : "unsubscribed");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const subscribe = async () => {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const res = await fetch(`/api/portal/${token}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Failed to save subscription");
      setStatus("subscribed");
      toast({ title: t("portalNotificationsToggle.notificationsOn"), description: t("portalNotificationsToggle.notificationsOnDescription") });
    } catch {
      setStatus(Notification.permission === "denied" ? "denied" : "unsubscribed");
      toast({ title: t("portalNotificationsToggle.couldntEnable"), description: t("portalNotificationsToggle.pleaseTryAgain"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/portal/${token}/subscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
      toast({ title: t("portalNotificationsToggle.notificationsOff") });
    } catch {
      toast({ title: t("portalNotificationsToggle.couldntDisable"), description: t("portalNotificationsToggle.pleaseTryAgain"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking" || status === "unsupported") return null;

  if (status === "denied") {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
        <BellOff className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {t("portalNotificationsToggle.notificationsBlocked")}
      </p>
    );
  }

  if (status === "subscribed") {
    return (
      <Button type="button" variant="outline" size="sm" onClick={unsubscribe} disabled={busy} className="whitespace-nowrap">
        <BellRing className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
        {t("portalNotificationsToggle.notificationsOnButton")}
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={subscribe} disabled={busy} className="whitespace-nowrap">
      <Bell className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
      {busy ? t("portalNotificationsToggle.enablingEllipsis") : t("portalNotificationsToggle.enableNotifications")}
    </Button>
  );
}
