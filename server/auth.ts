import crypto from "crypto";
import session from "express-session";
import MemoryStore from "memorystore";
import type { Express, Request, Response, NextFunction } from "express";

if (!process.env.APP_PASSCODE) {
  throw new Error(
    "APP_PASSCODE must be set. Choose a passcode to protect the app before starting it.",
  );
}
const APP_PASSCODE = process.env.APP_PASSCODE;

// Derived deterministically from the passcode so there's no second secret to
// configure; sessions reset (users just re-enter the passcode) if the
// passcode itself is ever changed, which is the correct behavior anyway.
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash("sha256").update(APP_PASSCODE).digest("hex");

const SessionStore = MemoryStore(session);

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
  }
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
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

  app.get("/api/session", (req: Request, res: Response) => {
    res.json({ authenticated: !!req.session.authenticated });
  });

  app.post("/api/login", (req: Request, res: Response) => {
    const { passcode } = req.body ?? {};

    const isValid =
      typeof passcode === "string" &&
      passcode.length === APP_PASSCODE.length &&
      crypto.timingSafeEqual(Buffer.from(passcode), Buffer.from(APP_PASSCODE));

    if (!isValid) {
      return res.status(401).json({ message: "Incorrect passcode" });
    }

    req.session.authenticated = true;
    res.json({ authenticated: true });
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.authenticated) return next();
  res.status(401).json({ message: "Not authenticated" });
}
