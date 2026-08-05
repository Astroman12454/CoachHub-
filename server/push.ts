import webpush from "web-push";

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  if (!isPushConfigured()) throw new Error("VAPID keys are not set");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
  // Relative path (e.g. "/portal/<token>") to open when the notification is
  // tapped — resolved per-subscriber since each one belongs to a different
  // player's portal link.
  url?: string;
}

export interface PushPayload {
  title: string;
  body: string;
}

// Best-effort broadcast: one bad/expired device never fails the whole send.
// Endpoints the push service reports as permanently gone (404/410 — the
// user revoked permission, uninstalled, or cleared site data) are returned
// so the caller can prune them from the database.
export async function sendPushNotifications(
  targets: PushTarget[],
  payload: PushPayload,
): Promise<{ sent: number; expiredEndpoints: string[] }> {
  if (targets.length === 0) return { sent: 0, expiredEndpoints: [] };
  ensureConfigured();

  const expiredEndpoints: string[] = [];
  let sent = 0;

  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, url: target.url }),
        );
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expiredEndpoints.push(target.endpoint);
        }
        // Any other error (network blip, quota, ...) is swallowed — a
        // best-effort broadcast shouldn't fail the coach's request over one
        // bad device.
      }
    }),
  );

  return { sent, expiredEndpoints };
}
