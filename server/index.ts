import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupAuth, requireAuth } from "./auth";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// A real Content-Security-Policy only makes sense in production: Vite's dev
// server relies on inline eval'd HMR updates and a websocket connection
// that a strict policy would block. In prod, everything the app loads
// (scripts, styles, fonts, icons) is bundled and same-origin, so
// default-src 'self' covers it — style-src needs 'unsafe-inline' because a
// few components (progress bar width, etc.) use React's inline style prop.
if (app.get("env") !== "development") {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Registers /api/login, /api/logout and /api/session (unprotected); every
// other /api/* route registered below requireAuth needs a valid session.
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
  // Seed the database on startup
  const { seedDatabase } = await import("./seed");
  await seedDatabase();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
