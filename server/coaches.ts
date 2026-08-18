import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { isEmailConfigured, sendCoachInviteEmail } from "./email";
import { inviteCoachSchema, upsertClubSchema, CLUB_PLAN_SEAT_LIMIT } from "@shared/schema";
import type { AccountMembershipRole } from "@shared/schema";
import { isClubPlan } from "@shared/entitlements";

function originOf(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

// Every /api/coaches/* route requires the requesting account to be the
// actual Club owner — not a coach who accepted someone else's invite (their
// resolved effective account differs from their own), and not on a lower
// plan. Seats are managed from the top of the club only.
async function requireClubOwner(req: Request, res: Response, next: NextFunction) {
  const accountId = req.session.accountId!;
  const account = await storage.getAccountById(accountId);
  if (!account || !isClubPlan(account.plan)) {
    return res.status(403).json({ message: "Inviting coaches is a Club plan feature." });
  }
  const effectiveAccountId = await storage.resolveEffectiveAccountId(accountId);
  if (effectiveAccountId !== accountId) {
    return res.status(403).json({ message: "Only the club owner can manage coaches." });
  }
  next();
}

// Looser than requireClubOwner: a coach who joined someone else's Club via
// accountMemberships already sees all of that club's teams, so they should
// also see its name/logo and the aggregate overview — just not rename it or
// change its seats, which stays owner-only (requireClubOwner above).
async function requireClubMember(req: Request, res: Response, next: NextFunction) {
  const effectiveAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
  const account = await storage.getAccountById(effectiveAccountId);
  if (!account || !isClubPlan(account.plan)) {
    return res.status(403).json({ message: "This is a Club plan feature." });
  }
  next();
}

export function registerCoachRoutes(app: Express) {
  app.get("/api/club", requireClubMember, async (req: Request, res: Response) => {
    try {
      const effectiveAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const club = await storage.getClubByAccountId(effectiveAccountId);
      res.json(club ?? null);
    } catch {
      res.status(500).json({ message: "Failed to fetch club" });
    }
  });

  // Owner-only (not requireClubMember) — same reasoning as every other
  // write in this file: a joined coach can see the club, only its owner
  // can rename it or change its logo.
  app.put("/api/club", requireClubOwner, async (req: Request, res: Response) => {
    try {
      const parsed = upsertClubSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid club data" });
      }
      const club = await storage.upsertClub(req.session.accountId!, parsed.data);
      res.json(club);
    } catch {
      res.status(500).json({ message: "Failed to save club" });
    }
  });

  app.get("/api/club/overview", requireClubMember, async (req: Request, res: Response) => {
    try {
      const effectiveAccountId = await storage.resolveEffectiveAccountId(req.session.accountId!);
      const overview = await storage.getClubOverview(effectiveAccountId);
      res.json(overview);
    } catch {
      res.status(500).json({ message: "Failed to fetch club overview" });
    }
  });


  app.get("/api/coaches", requireClubOwner, async (req: Request, res: Response) => {
    try {
      const accountId = req.session.accountId!;
      const [members, invites] = await Promise.all([
        storage.getAccountMemberships(accountId),
        storage.getPendingInvitesForAccount(accountId),
      ]);
      res.json({
        members,
        pendingInvites: invites.map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt, role: i.role })),
        seatLimit: CLUB_PLAN_SEAT_LIMIT,
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch coaches" });
    }
  });

  app.post("/api/coaches/invite", requireClubOwner, async (req: Request, res: Response) => {
    try {
      const parsed = inviteCoachSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Enter a valid email address" });
      }
      const accountId = req.session.accountId!;
      const email = parsed.data.email.toLowerCase();
      const account = await storage.getAccountById(accountId);
      if (email === account?.email.toLowerCase()) {
        return res.status(400).json({ message: "You can't invite yourself." });
      }

      const [members, pendingInvites] = await Promise.all([
        storage.getAccountMemberships(accountId),
        storage.getPendingInvitesForAccount(accountId),
      ]);
      if (members.length + pendingInvites.length >= CLUB_PLAN_SEAT_LIMIT) {
        return res.status(403).json({ message: `Club plan is limited to ${CLUB_PLAN_SEAT_LIMIT} coaches.` });
      }
      if (
        members.some((m) => m.email.toLowerCase() === email) ||
        pendingInvites.some((i) => i.email.toLowerCase() === email)
      ) {
        return res.status(409).json({ message: "This email already has access or a pending invite." });
      }

      const role: AccountMembershipRole = parsed.data.role ?? "coach";
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invite = await storage.createAccountInvite(accountId, email, tokenHash, expiresAt, role);

      if (isEmailConfigured()) {
        const acceptUrl = `${originOf(req)}/accept-invite?token=${token}`;
        try {
          await sendCoachInviteEmail(email, account!.email, acceptUrl);
        } catch {
          // Delivery failure doesn't fail the request — the invite still
          // exists and the owner can share the link manually if needed.
        }
      }

      res.status(201).json({ id: invite.id, email: invite.email, expiresAt: invite.expiresAt, role: invite.role });
    } catch {
      res.status(500).json({ message: "Failed to send invite" });
    }
  });

  app.delete("/api/coaches/invites/:id", requireClubOwner, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid invite id" });
      const accountId = req.session.accountId!;
      const invites = await storage.getPendingInvitesForAccount(accountId);
      if (!invites.some((i) => i.id === id)) {
        return res.status(404).json({ message: "Invite not found" });
      }
      await storage.deleteAccountInvite(id);
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Failed to revoke invite" });
    }
  });

  app.delete("/api/coaches/:memberAccountId", requireClubOwner, async (req: Request, res: Response) => {
    try {
      const memberAccountId = parseInt(req.params.memberAccountId);
      if (isNaN(memberAccountId)) return res.status(400).json({ message: "Invalid coach id" });
      const accountId = req.session.accountId!;
      const removed = await storage.removeAccountMembership(accountId, memberAccountId);
      if (!removed) return res.status(404).json({ message: "Coach not found" });
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Failed to remove coach" });
    }
  });

  // Public — the accept-invite page needs to show who's inviting before the
  // visitor necessarily has an account or is logged in (see "/invites/" in
  // PUBLIC_API_PREFIXES, server/auth.ts).
  app.get("/api/invites/:token", async (req: Request, res: Response) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const invite = await storage.getAccountInviteByValidTokenHash(tokenHash);
      if (!invite) return res.status(404).json({ message: "This invite is invalid or has expired." });
      const owner = await storage.getAccountById(invite.ownerAccountId);
      res.json({ email: invite.email, ownerEmail: owner?.email ?? "", role: invite.role });
    } catch {
      res.status(500).json({ message: "Failed to look up invite" });
    }
  });

  // Shares PUBLIC_API_PREFIXES' "/invites/" exemption with the GET above,
  // but actually accepting requires being logged in — checked here
  // explicitly rather than through the shared requireAuth middleware, since
  // that middleware skips the whole prefix.
  app.post("/api/invites/:token/accept", async (req: Request, res: Response) => {
    if (!req.session.accountId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const invite = await storage.getAccountInviteByValidTokenHash(tokenHash);
      if (!invite) return res.status(404).json({ message: "This invite is invalid or has expired." });

      const account = await storage.getAccountById(req.session.accountId);
      if (!account || account.email.toLowerCase() !== invite.email.toLowerCase()) {
        return res.status(403).json({
          message: "This invite is for a different email address. Log in as that email to accept it.",
        });
      }

      const existingOwnerId = await storage.getOwnerAccountIdForMember(account.id);
      if (existingOwnerId !== null) {
        return res.status(409).json({ message: "This account already belongs to a club." });
      }

      const members = await storage.getAccountMemberships(invite.ownerAccountId);
      if (members.length >= CLUB_PLAN_SEAT_LIMIT) {
        return res.status(403).json({ message: "This club's coach seats are full." });
      }

      await storage.createAccountMembership(invite.ownerAccountId, account.id, invite.role);
      await storage.deleteAccountInvite(invite.id);
      // The session's currentTeamId still points at this account's own
      // (now-irrelevant) team — clear it so the next /api/session fetch
      // falls back to the club's first team instead of a dangling id.
      req.session.currentTeamId = undefined;

      res.json({ message: "You now have access to this club's teams." });
    } catch {
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });
}
