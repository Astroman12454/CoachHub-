import { storage } from "./storage";
import { notifyTeam, formatNotifyDate } from "./notify";
import { isPushConfigured } from "./push";
import { isEmailConfigured, sendWeeklyDigestEmail } from "./email";

// Every coach used to have to remember to tap "Notify" before each session
// and never got any weekly recap at all — see server/routes.ts's manual
// /notify routes for the button this automates. Both pieces here are
// idempotent per session/team (reminderSentAt, lastWeeklyDigestAt), so
// running the sweep more often than strictly necessary is always safe.

const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000; // remind ~2h before a session
const REMINDER_WINDOW_MS = 15 * 60 * 1000; // half-width of the catch window
const DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // once a week per team
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

// Base URL for the link in the weekly digest email. Set APP_URL to the
// deployed origin (e.g. the Render URL) in production; the fallback is
// only ever seen in local dev, where nothing actually clicks the link.
function appUrl(): string {
  return process.env.APP_URL || "http://localhost:5000";
}

async function sweepReminders(): Promise<number> {
  if (!isPushConfigured()) return 0;

  const now = Date.now();
  const windowStart = new Date(now + REMINDER_LEAD_MS - REMINDER_WINDOW_MS);
  const windowEnd = new Date(now + REMINDER_LEAD_MS + REMINDER_WINDOW_MS);
  const sessions = await storage.getSessionsNeedingReminder(windowStart, windowEnd);

  let sent = 0;
  for (const session of sessions) {
    await notifyTeam(session.teamId, {
      title: `Reminder: ${session.name}`,
      body: `Starts soon — ${formatNotifyDate(session.date)} at ${session.time}`,
    });
    await storage.markSessionReminderSent(session.id);
    sent++;
  }
  return sent;
}

async function sweepWeeklyDigests(): Promise<number> {
  const pushOk = isPushConfigured();
  const emailOk = isEmailConfigured();
  if (!pushOk && !emailOk) return 0;

  const now = new Date();
  const cutoff = new Date(now.getTime() - DIGEST_INTERVAL_MS);
  const dueTeams = await storage.getTeamsDueForWeeklyDigest(cutoff);

  let sent = 0;
  for (const team of dueTeams) {
    const weekAgoStr = cutoff.toISOString().split("T")[0];
    const todayStr = now.toISOString().split("T")[0];

    const pastWeekSessions = await storage.getTrainingSessionsByDateRange(team.id, weekAgoStr, todayStr);
    const withAttendance = pastWeekSessions.filter((s) => (s.totalPlayers ?? 0) > 0);
    const avgAttendanceRate = withAttendance.length > 0
      ? Math.round(
          (withAttendance.reduce((acc, s) => acc + (s.attendanceCount ?? 0) / (s.totalPlayers ?? 1), 0) / withAttendance.length) * 100,
        )
      : null;

    const allSessions = await storage.getAllTrainingSessions(team.id);
    const nextSession = allSessions
      .filter((s) => `${s.date} ${s.time}` >= `${todayStr} 00:00`)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];

    const digest = {
      teamName: team.name,
      sessionsHeld: pastWeekSessions.length,
      avgAttendanceRate,
      nextSession: nextSession ? { name: nextSession.name, date: nextSession.date, time: nextSession.time } : null,
      appUrl: appUrl(),
    };

    if (pushOk) {
      const body = `${digest.sessionsHeld} session${digest.sessionsHeld === 1 ? "" : "s"} this week`
        + (avgAttendanceRate !== null ? `, ${avgAttendanceRate}% attendance` : "");
      await notifyTeam(team.id, { title: `${team.name} — weekly update`, body });
    }

    if (emailOk) {
      const account = await storage.getAccountById(team.accountId);
      if (account) {
        try {
          await sendWeeklyDigestEmail(account.email, digest);
        } catch {
          // A failed send shouldn't block marking the digest sent below —
          // otherwise a team stuck behind one bad delivery gets retried
          // (and re-emailed on eventual success) every sweep forever.
        }
      }
    }

    await storage.markTeamDigestSent(team.id, now);
    sent++;
  }
  return sent;
}

export async function runNotificationSweep(): Promise<{ remindersSent: number; digestsSent: number }> {
  const remindersSent = await sweepReminders();
  const digestsSent = await sweepWeeklyDigests();
  return { remindersSent, digestsSent };
}

let started = false;

// Runs in-process for a normal always-on deployment. Render's free tier
// sleeps after inactivity, though, and a sleeping process can't fire its
// own interval — see POST /api/cron/notifications (server/routes.ts) for
// the HTTP-triggerable equivalent an external pinger can hit instead.
export function startNotificationScheduler(): void {
  if (started) return;
  started = true;

  const tick = () => {
    runNotificationSweep().catch((err) => {
      console.error("Notification sweep failed:", err);
    });
  };
  tick();
  setInterval(tick, SWEEP_INTERVAL_MS);
}
