import express, { type Request, Response, NextFunction } from "express";
// Express 4 does not forward a rejected promise from an async route handler
// to error-handling middleware — an unhandled rejection there is left to
// Node's default handling, which (since Node 15) terminates the process.
// Patches Express's route/router dispatch so every existing `async (req,
// res) => {...}` handler in this app gets that forwarding for free, no
// individual route needs touching. Must be imported before any routes are
// registered (registerRoutes, setupAuth, etc., all below).
import "express-async-errors";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupAuth, requireAuth } from "./auth";
import { setupStripeWebhook } from "./billing";
import { startNotificationScheduler } from "./notifications-cron";
import { setupVite, serveStatic, log } from "./vite";
import { initErrorMonitoring, captureException } from "./monitoring";

// A no-op unless SENTRY_DSN is set (see monitoring.ts) — called before
// anything else gets a chance to throw, so both handlers below can report
// to it from the moment the process starts.
initErrorMonitoring();

const app = express();

// Defense-in-depth beyond express-async-errors above, which only covers
// promises rejected inside Express's own route dispatch — this catches
// anything else (a fire-and-forget call, a future background job not
// wrapped in its own .catch the way runNotificationSweep already is)
// before Node's default behavior (terminating the process) kicks in.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  captureException(reason);
});

// A real Content-Security-Policy only makes sense in production: Vite's dev
// server relies on inline eval'd HMR updates and a websocket connection
// that a strict policy would block. In prod, everything the app loads
// (scripts, styles, fonts, icons) is bundled and same-origin, so
// default-src 'self' covers it — style-src needs 'unsafe-inline' because a
// few components (progress bar width, etc.) use React's inline style prop,
// and img-src needs to allow any https: origin because exercises have a
// coach-editable imageUrl field that can point at any external photo host.
if (app.get("env") !== "development") {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
    }),
  );
} else {
  // Skip CSP in dev, but keep the rest of helmet's headers (X-Content-Type-
  // Options, X-Frame-Options, Referrer-Policy, etc.) — they don't interfere
  // with Vite's dev server.
  app.use(helmet({ contentSecurityPolicy: false }));
}

// Registered before express.json(): Stripe signs the raw request body, and
// a global JSON parser would have already consumed/reshaped it by the time
// a route handler saw it, breaking signature verification.
setupStripeWebhook(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Registers /api/signup, /api/login, /api/logout and /api/session
// (unprotected, though /api/session/team checks the session itself);
// every other /api/* route registered below requireAuth needs a valid session.
setupAuth(app);
app.use("/api", requireAuth);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);
  startNotificationScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log server-side for diagnosis — do NOT rethrow. Express's finalhandler
    // destroys the underlying socket when it receives an error after
    // headers are already sent (res.json above just sent them), so
    // rethrowing here doesn't "log louder" — it truncates/aborts the
    // response the client is mid-way through reading. That turns a normal
    // "account already exists" or validation 4xx into a raw connection
    // reset, which the client can't parse as JSON and falls back to a
    // generic "Couldn't create account" / "Couldn't log in" message that
    // hides the real reason from both the user and our own logs.
    console.error(err);
    captureException(err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serves both the API and the client. Hosting platforms (Render, Railway,
  // Heroku, ...) assign the port dynamically via $PORT; 5000 is only a local
  // dev fallback.
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
