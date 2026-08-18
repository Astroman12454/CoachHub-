import { Resend } from "resend";

// From address must be on a domain verified in the Resend dashboard —
// Resend's own onboarding@resend.dev works out of the box for testing but
// isn't meant for real delivery, so this is required alongside the API key.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && FROM_EMAIL);
}

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await getClient().emails.send({
    from: FROM_EMAIL!,
    to,
    subject: "Reset your Coach Hub password",
    html: `
      <p>Someone asked to reset the password for this Coach Hub account.</p>
      <p><a href="${resetUrl}">Click here to choose a new password</a>. This link works for 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
    `,
    text: `Someone asked to reset the password for this Coach Hub account.\n\nOpen this link to choose a new password (works for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  });
}

export async function sendCoachInviteEmail(to: string, ownerEmail: string, acceptUrl: string): Promise<void> {
  await getClient().emails.send({
    from: FROM_EMAIL!,
    to,
    subject: `${ownerEmail} invited you to coach on Coach Hub`,
    html: `
      <p><strong>${ownerEmail}</strong> invited you to join their team as a coach on Coach Hub.</p>
      <p><a href="${acceptUrl}">Click here to accept the invitation</a>. This link works for 7 days.</p>
      <p>If you weren't expecting this, you can safely ignore this email.</p>
    `,
    text: `${ownerEmail} invited you to join their team as a coach on Coach Hub.\n\nOpen this link to accept (works for 7 days):\n${acceptUrl}\n\nIf you weren't expecting this, you can safely ignore this email.`,
  });
}

export async function sendGuardianAuthorizationEmail(
  to: string,
  playerName: string,
  coachEmail: string,
  purposeLabel: string,
  decisionUrl: string,
): Promise<void> {
  await getClient().emails.send({
    from: FROM_EMAIL!,
    to,
    subject: `${coachEmail} is requesting your authorization on Coach Hub`,
    html: `
      <p><strong>${coachEmail}</strong>, who coaches <strong>${playerName}</strong> on Coach Hub, is asking for your authorization to record: ${purposeLabel}.</p>
      <p><a href="${decisionUrl}">Click here to review and respond</a>. This link works for 7 days.</p>
      <p>If you weren't expecting this, you can safely ignore this email — nothing is recorded without your response.</p>
    `,
    text: `${coachEmail}, who coaches ${playerName} on Coach Hub, is asking for your authorization to record: ${purposeLabel}.\n\nOpen this link to review and respond (works for 7 days):\n${decisionUrl}\n\nIf you weren't expecting this, you can safely ignore this email — nothing is recorded without your response.`,
  });
}

export interface WeeklyDigestData {
  teamName: string;
  sessionsHeld: number;
  avgAttendanceRate: number | null;
  nextSession: { name: string; date: string; time: string } | null;
  appUrl: string;
}

// Sent automatically once a week per team (see server/notifications-cron.ts)
// — the coach never has to ask for this, it just shows up.
export async function sendWeeklyDigestEmail(to: string, data: WeeklyDigestData): Promise<void> {
  const attendanceLine = data.avgAttendanceRate !== null
    ? `${data.avgAttendanceRate}% average attendance`
    : "no attendance recorded";
  const sessionsLine = `${data.sessionsHeld} session${data.sessionsHeld === 1 ? "" : "s"} held`;
  const nextLine = data.nextSession
    ? `Next up: "${data.nextSession.name}" on ${data.nextSession.date} at ${data.nextSession.time}.`
    : "Nothing on the calendar yet — plan your next session.";

  await getClient().emails.send({
    from: FROM_EMAIL!,
    to,
    subject: `${data.teamName} — your weekly Coach Hub update`,
    html: `
      <p>Here's how <strong>${data.teamName}</strong>'s week went:</p>
      <ul>
        <li>${sessionsLine}</li>
        <li>${attendanceLine}</li>
      </ul>
      <p>${nextLine}</p>
      <p><a href="${data.appUrl}">Open Coach Hub</a></p>
    `,
    text: `Here's how ${data.teamName}'s week went:\n\n- ${sessionsLine}\n- ${attendanceLine}\n\n${nextLine}\n\n${data.appUrl}`,
  });
}
