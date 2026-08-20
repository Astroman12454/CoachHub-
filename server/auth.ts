import bcrypt from "bcryptjs";
import crypto from "crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { seedDefaultExercises } from "./seed";
import { insertAccountSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, deleteAccountSchema } from "@shared/schema";
import { pool } from "./db";
import { isEmailConfigured, sendPasswordResetEmail } from "./email";
import { getStripe, isStripeConfigured } from "./stripe";
import { trackEvent } from "./analytics";

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// Persisted in Postgres (the same pool Drizzle uses) instead of process
// memory — a MemoryStore loses every logged-in coach on every restart/
// redeploy, which on Render's free tier (frequent restarts, sleep-on-idle)
// happens constantly. createTableIfMissing provisions the "session" table
// itself on first boot; it's deliberately outside the Drizzle schema since
// connect-pg-simple owns its own shape and migrations for it.
const PgSessionStore = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    accountId?: number;
    currentTeamId?: number;
  }
}

async function sessionPayload(accountId: number, currentTeamId?: number) {
  const account = await storage.getAccountById(accountId);
  if (!account) return { authenticated: false as const };

  // A coach who accepted a Club invite operates entirely on the club
  // owner's account: their teams, their plan (so the UI shows "Club", not
  // this login's own free plan), everything. effectiveAccountId is that
  // owner's id for a member, or just accountId itself otherwise.
  const effectiveAccountId = await storage.resolveEffectiveAccountId(accountId);
  const isClubMember = effectiveAccountId !== accountId;
  const effectiveAccount = isClubMember ? await storage.getAccountById(effectiveAccountId) : account;

  const accountTeams = await storage.getTeamsByAccount(effectiveAccountId);
  // Only a joined member has a role at all — the owner's own login has full
  // access by definition, so this stays null for them (and for a standalone
  // account with no club). See ACCOUNT_MEMBERSHIP_ROLES in shared/schema.ts.
  const membershipRole = isClubMember ? await storage.getMembershipRoleForMember(accountId) : null;
  return {
    authenticated: true as const,
    account: {
      id: account.id,
      email: account.email,
      plan: effectiveAccount?.plan ?? account.plan,
      isClubMember,
      membershipRole,
      ownerEmail: isClubMember ? effectiveAccount?.email : undefined,
      // Published exercises are always attributed to the effective (owner)
      // account, same as plan above — a Club member publishes under the
      // club's chosen public name, not a personal one of their own.
      publicName: effectiveAccount?.publicName ?? account.publicName,
      // Admin-ness belongs to the specific login, never inherited through
      // a Club — a member seeing /admin/reports because the club owner
      // happens to be an admin would be surprising and wrong.
      isAdmin: account.isAdmin === 1,
      // The free AI-plan trial belongs to the effective (billing) account,
      // same as plan — a Club member shares the club's one trial, not a
      // personal one of their own.
      aiSessionPlanTrialUsed: (effectiveAccount?.aiSessionPlanTrialUsedAt ?? account.aiSessionPlanTrialUsedAt) != null,
    },
    teams: accountTeams,
    currentTeamId: currentTeamId ?? accountTeams[0]?.id,
  };
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  // Signup and login are the endpoints worth throttling: without this, an
  // attacker can script unlimited account creation or password guesses.
  // Separate instances (not one shared limiter) so a run of failed logins
  // from one visitor on a shared IP — a gym's wifi, a school network, CGNAT
  // — can't also lock out someone else on that IP trying to sign up.
  // Only failed attempts count against login, so a coach who mistypes once
  // and then logs in correctly on the next try never gets locked out.
  const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: "Too many attempts. Please try again later." },
  });
  // Same skipSuccessfulRequests choice as login: a burst of legitimate new
  // accounts from one IP (a club signing up several coaches back to back)
  // shouldn't get throttled — only repeated failed attempts (bad input,
  // duplicate-email retries) count toward the limit.
  const signupRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: "Too many attempts. Please try again later." },
  });

  // Deliberately does NOT skipSuccessfulRequests — every call sends (or
  // pretends to send) an email, so a "successful" request is exactly what
  // needs throttling here, unlike login where only failures are the risk.
  const resetRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts. Please try again later." },
  });

  app.use(
    session({
      store: new PgSessionStore({ pool, tableName: "session", createTableIfMissing: true }),
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    }),
  );

  app.get("/api/session", async (req: Request, res: Response) => {
    if (!req.session.accountId) {
      return res.json({ authenticated: false });
    }
    res.json(await sessionPayload(req.session.accountId, req.session.currentTeamId));
  });

  app.post("/api/signup", signupRateLimiter, async (req: Request, res: Response) => {
    const parsed = insertAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid signup data" });
    }
    const { email, password } = parsed.data;

    const existing = await storage.getAccountByEmail(email);
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let account;
    try {
      account = await storage.createAccount(email, passwordHash);
    } catch (err: any) {
      // Two concurrent signups for the same email both pass the check above
      // before either commits; the DB's unique constraint is the real guard,
      // this just turns that race into the same 409 as the normal case.
      if (err?.code === "23505") {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      throw err;
    }
    const team = await storage.createTeam(account.id, "My Team");
    await seedDefaultExercises(account.id);
    trackEvent(account.id, "signup_completed");

    // Optional referral attribution — a raw body field, not part of
    // insertAccountSchema, since a malformed/unknown code should never fail
    // the signup itself, only silently skip crediting the referrer. No
    // self-referral guard needed: a code is only ever generated for an
    // account that already exists (see getOrCreateReferralCode), so it's
    // never possible for the brand-new account being created right here to
    // already own the code it's submitting.
    const ref = typeof req.body?.ref === "string" ? req.body.ref.trim() : "";
    if (ref) {
      const referrer = await storage.getAccountByReferralCode(ref);
      if (referrer) {
        await storage.setReferredBy(account.id, referrer.id);
        trackEvent(referrer.id, "referral_signup");
      }
    }

    req.session.accountId = account.id;
    req.session.currentTeamId = team.id;
    res.status(201).json(await sessionPayload(account.id, team.id));
  });

  app.post("/api/login", loginRateLimiter, async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Enter a valid email and password" });
    }
    const { email, password } = parsed.data;

    const account = await storage.getAccountByEmail(email);
    // Compare against a dummy hash when the account doesn't exist, so the
    // response time doesn't leak whether the email is registered.
    const isValid = await bcrypt.compare(
      password,
      account?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali",
    );

    if (!account || !isValid) {
      return res.status(401).json({ message: "Incorrect email or password" });
    }

    const effectiveAccountId = await storage.resolveEffectiveAccountId(account.id);
    const accountTeams = await storage.getTeamsByAccount(effectiveAccountId);
    req.session.accountId = account.id;
    req.session.currentTeamId = accountTeams[0]?.id;
    res.json(await sessionPayload(account.id, req.session.currentTeamId));
  });

  app.post("/api/forgot-password", resetRateLimiter, async (req: Request, res: Response) => {
    if (!isEmailConfigured()) {
      return res.status(503).json({ message: "Password reset isn't configured yet." });
    }
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    const account = await storage.getAccountByEmail(parsed.data.email);
    // Same response whether or not the account exists, so this endpoint
    // can't be used to discover which emails are registered.
    if (account) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await storage.setPasswordResetToken(account.id, tokenHash, expiresAt);

      const origin = `${req.protocol}://${req.get("host")}`;
      try {
        await sendPasswordResetEmail(account.email, `${origin}/reset-password?token=${token}`);
      } catch {
        // Delivery failures aren't surfaced here — the response below stays
        // generic either way, matching the anti-enumeration behavior above.
      }
    }

    res.json({ message: "If that email has an account, we've sent a reset link." });
  });

  app.post("/api/reset-password", resetRateLimiter, async (req: Request, res: Response) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    }

    const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
    const account = await storage.getAccountByValidResetTokenHash(tokenHash);
    if (!account) {
      return res.status(400).json({ message: "This reset link is invalid or has expired." });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await storage.resetPassword(account.id, passwordHash);
    res.json({ message: "Password updated. You can log in now." });
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
  });

  // Self-service deletion (replaces the old "email us and wait" process —
  // see Privacy/Terms/Support). Password re-entry gates it since it's
  // irreversible. Every table that hangs off accounts.id cascades at the DB
  // level (see IStorage.deleteAccount), so a coach's teams, players,
  // sessions, plays, exercises, and social activity all disappear with it —
  // the only thing outside that chain is the live Stripe subscription and,
  // for a Club owner, coaches still seated on their club (blocked below so
  // that doesn't silently strand them).
  app.delete("/api/account", async (req: Request, res: Response) => {
    // This route (like /api/session/team above) is registered inside
    // setupAuth, which runs before server/index.ts wires up the blanket
    // requireAuth middleware for the rest of /api/* — so it needs its own
    // check rather than assuming req.session.accountId is set.
    if (!req.session.accountId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Enter your password to confirm" });
    }

    const accountId = req.session.accountId;
    const account = await storage.getAccountById(accountId);
    if (!account) return res.status(404).json({ message: "Account not found" });

    // 403, not 401: a 401 from anywhere but /api/session makes the client
    // treat it as an expired session and bounce to the login screen (see
    // throwIfResNotOk in queryClient.ts) — misleading here, since a wrong
    // password means the account is untouched, not logged out.
    const isValid = await bcrypt.compare(parsed.data.password, account.passwordHash);
    if (!isValid) {
      return res.status(403).json({ message: "Incorrect password" });
    }

    const members = await storage.getAccountMemberships(accountId);
    if (members.length > 0) {
      return res.status(409).json({ message: "Remove the coaches on your club before deleting your account." });
    }

    if (account.stripeSubscriptionId && isStripeConfigured()) {
      try {
        await getStripe().subscriptions.cancel(account.stripeSubscriptionId);
      } catch {
        return res.status(500).json({ message: "Couldn't cancel your subscription. Please try again or contact support." });
      }
    }

    await storage.deleteAccount(accountId);
    req.session.destroy(() => {
      res.json({ deleted: true });
    });
  });

  app.put("/api/session/team", async (req: Request, res: Response) => {
    if (!req.session.accountId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const teamId = parseInt(req.body?.teamId);
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid teamId" });
    }
    const effectiveAccountId = await storage.resolveEffectiveAccountId(req.session.accountId);
    const team = await storage.getTeamById(teamId, effectiveAccountId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    req.session.currentTeamId = team.id;
    res.json(await sessionPayload(req.session.accountId, team.id));
  });
}

// The player/parent portal (GET /api/portal/:token) is intentionally public
// — a coach shares a link built from an unguessable token instead of the
// parent needing an account of their own — so it's exempted from the
// blanket session check below. It's the token, not this exemption, that
// actually scopes access to a single player; see storage.getPortalData.
//
// /cron/notifications is exempted for a different reason: it's meant to be
// hit by an external scheduler (no coach session at all, possibly not even
// a browser), and is protected by its own CRON_SECRET check inside the
// route handler instead — see server/routes.ts.
// /exercise-share/ is the same kind of public, token-scoped read as /portal/
// above — a coach shares a link to one drill instead of the recipient
// needing an account.
// /guardian-authorization/ is the same token-link pattern as /invites/ above
// (server/guardian-authorization.ts) — a guardian approves or declines by
// visiting the link, never needing an account of their own.
const PUBLIC_API_PREFIXES = ["/portal/", "/cron/", "/invites/", "/exercise-share/", "/guardian-authorization/", "/community-exercises/"];

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_API_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();
  if (req.session.accountId) return next();
  res.status(401).json({ message: "Not authenticated" });
}

// True only for a joined "assistant" member — the owner and "coach"-role
// members both get full read/write access, so this is the one case that
// needs blocking. Shared by requireTeam below and blockReadOnlyMembers
// (server/routes.ts's exercise-content routes, which aren't team-scoped so
// don't go through requireTeam at all).
async function isReadOnlyMember(accountId: number): Promise<boolean> {
  return (await storage.getMembershipRoleForMember(accountId)) === "assistant";
}

// For routes that operate on a specific team (players, sessions, attendance):
// requires both an authenticated account and a valid "current team" selected
// in the session, and exposes both ids on req for handlers to use. Also the
// single choke point for the "assistant" read-only role (76 routes route
// through this), so GET passes through untouched but every write 403s for
// an assistant instead of silently succeeding.
export async function requireTeam(req: Request, res: Response, next: NextFunction) {
  if (!req.session.accountId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (!req.session.currentTeamId) {
    return res.status(400).json({ message: "No team selected" });
  }
  if (req.method !== "GET" && (await isReadOnlyMember(req.session.accountId))) {
    return res.status(403).json({ message: "Assistants have read-only access to the club." });
  }
  next();
}

// For the handful of account-scoped write routes that fall outside
// requireTeam (exercise content — exercises aren't team-scoped, see
// shared/schema.ts). Same rule as requireTeam's write check, just without
// the team requirement.
export async function blockReadOnlyMembers(req: Request, res: Response, next: NextFunction) {
  if (!req.session.accountId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (await isReadOnlyMember(req.session.accountId)) {
    return res.status(403).json({ message: "Assistants have read-only access to the club." });
  }
  next();
}
