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
