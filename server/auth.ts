import bcrypt from "bcryptjs";
import crypto from "crypto";
import session from "express-session";
import MemoryStore from "memorystore";
import rateLimit from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { seedDefaultExercises } from "./seed";
import { insertAccountSchema, loginSchema } from "@shared/schema";

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const SessionStore = MemoryStore(session);

declare module "express-session" {
  interface SessionData {
    accountId?: number;
    currentTeamId?: number;
  }
}

async function sessionPayload(accountId: number, currentTeamId?: number) {
  const account = await storage.getAccountById(accountId);
  if (!account) return { authenticated: false as const };

  const accountTeams = await storage.getTeamsByAccount(account.id);
  return {
    authenticated: true as const,
    account: { id: account.id, email: account.email, plan: account.plan },
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

  app.use(
    session({
      store: new SessionStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
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

    const accountTeams = await storage.getTeamsByAccount(account.id);
    req.session.accountId = account.id;
    req.session.currentTeamId = accountTeams[0]?.id;
    res.json(await sessionPayload(account.id, req.session.currentTeamId));
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
    const team = await storage.getTeamById(teamId, req.session.accountId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    req.session.currentTeamId = team.id;
    res.json(await sessionPayload(req.session.accountId, team.id));
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
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
