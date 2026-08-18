import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { requireTeam } from "./auth";
import { isEmailConfigured, sendGuardianAuthorizationEmail } from "./email";
import { requestGuardianAuthorizationSchema, type ConsentPurpose } from "@shared/schema";

function originOf(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

// Only one purpose exists today (see CONSENT_PURPOSES in shared/schema.ts);
// this map is the one place a human-readable description lives, shown to
// the guardian on the decision page and in the request email.
const PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  medical_data: "health information (allergies, medical conditions, and injury records)",
};

function parseId(req: Request, res: Response): number | null {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid player id" });
    return null;
  }
  return id;
}

export function registerGuardianAuthorizationRoutes(app: Express) {
  // A coach, from a player's profile, asks a guardian to authorize a
  // sensitive-data purpose for that player. Always succeeds regardless of
  // whether the player is actually a minor — the gate that gets checked
  // before health data is written only applies to minors, but nothing
  // stops a coach from getting authorization in writing for anyone.
  app.post("/api/players/:id/guardian-authorization/request", requireTeam, async (req: Request, res: Response) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) return res.status(404).json({ message: "Player not found" });

      const parsed = requestGuardianAuthorizationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Enter a valid guardian email address" });
      }
      const purpose: ConsentPurpose = "medical_data";
      const guardianEmail = parsed.data.guardianEmail.toLowerCase();

      const [activeConsent, pendingRequest] = await Promise.all([
        storage.getActiveConsent(id, purpose),
        storage.getPendingGuardianAuthorizationRequest(id, purpose),
      ]);
      if (activeConsent) {
        return res.status(409).json({ message: "This is already authorized for this player." });
      }
      if (pendingRequest) {
        return res.status(409).json({ message: "A request is already pending for this player." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const request = await storage.createGuardianAuthorizationRequest(id, purpose, guardianEmail, tokenHash, expiresAt);

      if (isEmailConfigured()) {
        const account = await storage.getAccountById(req.session.accountId!);
        const decisionUrl = `${originOf(req)}/guardian-authorization/${token}`;
        try {
          await sendGuardianAuthorizationEmail(guardianEmail, player.name, account!.email, PURPOSE_LABELS[purpose], decisionUrl);
        } catch {
          // Delivery failure doesn't fail the request — the coach can still
          // see it's pending and the link keeps working if shared manually.
        }
      }

      res.status(201).json({ id: request.id, guardianEmail: request.guardianEmail, expiresAt: request.expiresAt });
    } catch {
      res.status(500).json({ message: "Failed to send authorization request" });
    }
  });

  app.get("/api/players/:id/consents", requireTeam, async (req: Request, res: Response) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) return res.status(404).json({ message: "Player not found" });
      const [consents, pendingRequest] = await Promise.all([
        storage.getConsentsForPlayer(id),
        storage.getPendingGuardianAuthorizationRequest(id, "medical_data"),
      ]);
      res.json({
        consents,
        pendingRequest: pendingRequest
          ? { guardianEmail: pendingRequest.guardianEmail, expiresAt: pendingRequest.expiresAt }
          : null,
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch consents" });
    }
  });

  // Recorded by the coach on the guardian's behalf (e.g. a guardian calls or
  // emails asking to withdraw authorization) — not itself how consent is
  // granted, which only ever happens through the guardian's own link below.
  app.delete("/api/players/:id/consents/:consentId", requireTeam, async (req: Request, res: Response) => {
    try {
      const id = parseId(req, res);
      if (id === null) return;
      const consentId = parseInt(req.params.consentId);
      if (isNaN(consentId)) return res.status(400).json({ message: "Invalid consent id" });
      const player = await storage.getPlayerById(id, req.session.currentTeamId!);
      if (!player) return res.status(404).json({ message: "Player not found" });
      const revoked = await storage.revokeConsent(consentId, id);
      if (!revoked) return res.status(404).json({ message: "Consent not found" });
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Failed to revoke consent" });
    }
  });

  // Public — the guardian is never asked to create an account. See
  // "/guardian-authorization/" in PUBLIC_API_PREFIXES, server/auth.ts.
  app.get("/api/guardian-authorization/:token", async (req: Request, res: Response) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const request = await storage.getGuardianAuthorizationRequestByValidTokenHash(tokenHash);
      if (!request) return res.status(404).json({ message: "This link is invalid or has expired." });
      const player = await storage.getPlayerByIdUnscoped(request.playerId);
      res.json({
        playerName: player?.name ?? "",
        purposeLabel: PURPOSE_LABELS[request.purpose],
        guardianEmail: request.guardianEmail,
      });
    } catch {
      res.status(500).json({ message: "Failed to look up this request" });
    }
  });

  app.post("/api/guardian-authorization/:token", async (req: Request, res: Response) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const request = await storage.getGuardianAuthorizationRequestByValidTokenHash(tokenHash);
      if (!request) return res.status(404).json({ message: "This link is invalid or has expired." });

      const decision = req.body?.decision;
      if (decision !== "approved" && decision !== "declined") {
        return res.status(400).json({ message: "Invalid decision" });
      }

      const updated = await storage.respondToGuardianAuthorizationRequest(request.id, decision);
      if (!updated) return res.status(409).json({ message: "This request was already resolved." });

      res.json({ status: updated.status });
    } catch {
      res.status(500).json({ message: "Failed to record your response" });
    }
  });
}
