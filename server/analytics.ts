import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { analyticsEvents, ANALYTICS_EVENTS, type AnalyticsEvent } from "@shared/schema";

// Fire-and-forget by design: a logging hiccup should never fail (or even
// slow down) the real request it's attached to. Callers don't await this —
// see every call site — so a dropped event under heavy load is an acceptable
// trade for never blocking or breaking a coach's actual action.
export function trackEvent(accountId: number | undefined, event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  db.insert(analyticsEvents)
    .values({ accountId: accountId ?? null, event, properties: properties ?? null })
    .catch((err) => {
      console.error(`Failed to record analytics event "${event}"`, err);
    });
}

// For a milestone event (fired once per account, not once per occurrence —
// e.g. onboarding_checklist_completed) rather than a repeatable one like
// player_added. The client re-checks its own local condition on every
// render/mount, so this is what keeps a coach revisiting a finished
// checklist from generating a new row every time.
export async function trackMilestoneEvent(accountId: number, event: AnalyticsEvent): Promise<void> {
  const [existing] = await db
    .select({ id: analyticsEvents.id })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.accountId, accountId), eq(analyticsEvents.event, event)))
    .limit(1);
  if (existing) return;
  await db.insert(analyticsEvents).values({ accountId, event, properties: null });
}

// Every event in the closed set, zero-filled, so the admin view shows an
// event nobody's triggered yet as 0 rather than just omitting it — the
// absence of a metric is itself information worth seeing.
export async function getEventCounts(days: number): Promise<{ event: AnalyticsEvent; count: number }[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ event: analyticsEvents.event, count: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .groupBy(analyticsEvents.event);
  const counts = new Map(rows.map((r) => [r.event, r.count]));
  return ANALYTICS_EVENTS.map((event) => ({ event, count: counts.get(event) ?? 0 }));
}
