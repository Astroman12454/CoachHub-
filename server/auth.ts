import bcrypt from "bcryptjs";
import crypto from "crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { seedDefaultExercises } from "./seed";
import { insertAccountSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "@shared/schema";
import { pool } from "./db";
import { isEmailConfigured, sendPasswordResetEmail } from "./email";

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
  return {
    authenticated: true as const,
    account: {
      id: account.id,
      email: account.email,
      plan: effectiveAccount?.plan ?? account.plan,
      isClubMember,
      ownerEmail: isClubMember ? effectiveAccount?.email : undefined,
    },
    teams: accountTeams,
    currentTeamId: currentTeamId ?? accountTeams[0]?.id,
  };
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  // Signup and login are the endpoints worth throttling: without this, an
  // attacker can script unlimited account creation or password guesses.
  // Only failed attempts count against login, so a coach who mistypes once
  // and then logs in correctly on the next try never gets locked out.
  const authRateLimiter = rateLimit({
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

  app.post("/api/signup", authRateLimiter, async (req: Request, res: Response) => {
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

    req.session.accountId = account.id;
    req.session.currentTeamId = team.id;
    res.status(201).json(await sessionPayload(account.id, team.id));
  });

  app.post("/api/login", authRateLimiter, async (req: Request, res: Response) => {
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
const PUBLIC_API_PREFIXES = ["/portal/", "/cron/", "/invites/"];

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_API_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();
  if (req.session.accountId) return next();
  res.status(401).json({ message: "Not authenticated" });
}

// For routes that operate on a specific team (players, sessions, attendance):
// requires both an authenticated account and a valid "current team" selected
// in the session, and exposes both ids on req for handlers to use.
export function requireTeam(req: Request, res: Response, next: NextFunction) {
  if (!req.session.accountId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (!req.session.currentTeamId) {
    return res.status(400).json({ message: "No team selected" });
  }
  next();
}
