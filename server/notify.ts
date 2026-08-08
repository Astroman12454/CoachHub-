import { storage } from "./storage";
import { sendPushNotifications } from "./push";

export function formatNotifyDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Pushes to every subscribed player on the team, deep-linking each one back
// to their own portal (not a shared URL — every subscriber has a different
// token), and prunes any subscription the push service reports as
// permanently gone (see sendPushNotifications). Shared between the coach's
// manual "Notify" buttons (server/routes.ts) and the automatic reminder/
// digest sweep (server/notifications-cron.ts) — kept in its own module so
// neither of those two ends up importing the other.
export async function notifyTeam(teamId: number, payload: { title: string; body: string }): Promise<number> {
  const subs = await storage.getPushSubscriptionsForTeam(teamId);
  const targets = subs.map((s) => ({
    endpoint: s.endpoint,
    p256dh: s.p256dh,
    auth: s.auth,
    url: s.portalToken ? `/portal/${s.portalToken}` : undefined,
  }));
  const { sent, expiredEndpoints } = await sendPushNotifications(targets, payload);
  if (expiredEndpoints.length > 0) {
    await Promise.all(expiredEndpoints.map((endpoint) => storage.deletePushSubscriptionsByEndpoint(endpoint)));
  }
  return sent;
}
