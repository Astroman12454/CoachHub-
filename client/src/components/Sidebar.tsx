import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, CalendarRange, CalendarDays, Dumbbell, Users, Trophy, PencilRuler, LogOut, ChevronsUpDown, Plus, UserCog, Target, Pencil, Settings, Flag, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { startCheckout, openBillingPortal } from "@/lib/billing";
import { extractErrorMessage } from "@/lib/queryClient";
import { isPaidPlan, isClubPlan } from "@shared/entitlements";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import BrandMark from "@/components/BrandMark";
import NewTeamDialog from "@/components/NewTeamDialog";
import RenameTeamDialog from "@/components/RenameTeamDialog";
import { useTranslation } from "react-i18next";

const navigation = [
  { key: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "nav.weeklySchedule", href: "/weekly-schedule", icon: CalendarRange },
  { key: "nav.trainingSessions", href: "/training-sessions", icon: CalendarDays },
  { key: "nav.games", href: "/games", icon: Trophy },
  { key: "nav.playbook", href: "/playbook", icon: PencilRuler },
  { key: "nav.exerciseLibrary", href: "/exercise-library", icon: Dumbbell },
  { key: "nav.evaluations", href: "/evaluations", icon: Target },
  { key: "nav.players", href: "/players", icon: Users },
];

const NEW_TEAM_VALUE = "__new__";

function TeamSwitcher() {
  const { t } = useTranslation();
  const { teams, currentTeamId, switchTeam } = useAuth();
  const [isNewTeamOpen, setIsNewTeamOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const currentTeam = teams.find((team) => team.id === currentTeamId);

  const handleChange = (value: string) => {
    if (value === NEW_TEAM_VALUE) {
      setIsNewTeamOpen(true);
      return;
    }
    switchTeam(parseInt(value));
  };

  return (
    <div className="px-3 pt-3 flex items-center gap-1.5">
      <div className="flex-1 min-w-0">
        <Select value={currentTeamId?.toString() ?? ""} onValueChange={handleChange}>
          <SelectTrigger
            className="bg-white/5 border-rail-border text-rail-foreground hover:bg-white/10 focus:ring-basketball-orange"
            aria-label={t("sidebar.switchTeam")}
          >
            <div className="flex items-center gap-2 min-w-0">
              {currentTeam?.logoUrl ? (
                <img src={currentTeam.logoUrl} alt="" className="w-4 h-4 rounded-sm object-cover flex-shrink-0" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5 flex-shrink-0 text-rail-muted" strokeWidth={1.75} aria-hidden="true" />
              )}
              <SelectValue placeholder={t("sidebar.selectTeam")} />
            </div>
          </SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id.toString()}>
                {team.name}
              </SelectItem>
            ))}
            <SelectItem value={NEW_TEAM_VALUE}>
              <span className="flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                {t("sidebar.newTeam")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {currentTeam && (
        <button
          type="button"
          onClick={() => setIsRenameOpen(true)}
          aria-label={t("renameTeamDialog.triggerAriaLabel", { name: currentTeam.name })}
          title={t("renameTeamDialog.triggerAriaLabel", { name: currentTeam.name })}
          className="w-9 h-9 flex-shrink-0 rounded-md flex items-center justify-center text-rail-muted hover:bg-white/10 hover:text-rail-foreground transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
      <NewTeamDialog open={isNewTeamOpen} onOpenChange={setIsNewTeamOpen} />
      <RenameTeamDialog open={isRenameOpen} onOpenChange={setIsRenameOpen} team={currentTeam ?? null} />
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { account, logout } = useAuth();
  const { toast } = useToast();
  const [isBillingPending, setIsBillingPending] = useState(false);
  const isClubMember = !!account?.isClubMember;
  // Coach management is the Club owner's action alone — a member who
  // accepted an invite has full access to the club's teams but doesn't
  // manage who else is on it.
  const canManageCoaches = isClubPlan(account?.plan ?? "free") && !isClubMember;
  // Visible to the owner AND any coach who joined via an invite — unlike
  // Manage Coaches below, which stays owner-only (it's the seat-management
  // action, not just visibility into the club).
  const isInAClub = isClubPlan(account?.plan ?? "free") || isClubMember;
  const items = [
    ...(isInAClub ? [...navigation, { key: "nav.club", href: "/club", icon: Building2 }] : navigation),
    ...(canManageCoaches ? [{ key: "nav.coaches", href: "/settings/coaches", icon: UserCog }] : []),
    // Every plan gets this one, unlike Coaches above — it's where the
    // account-level "delete my account" action lives (see AccountSettings),
    // and every coach needs a way to reach it, not just Club owners.
    { key: "nav.account", href: "/settings/account", icon: Settings },
    // Only the handful of accounts with accounts.isAdmin set in the
    // database ever see this — everyone else's items array is unaffected.
    ...(account?.isAdmin ? [{ key: "nav.adminReports", href: "/admin/reports", icon: Flag }] : []),
  ];

  const handlePlanClick = async () => {
    if (isBillingPending || isClubMember) return;
    setIsBillingPending(true);
    try {
      await (isPaidPlan(account?.plan ?? "free") ? openBillingPortal() : startCheckout());
      // Both normally navigate away (window.location.href = ...), so this
      // line never runs — except startCheckout's native-app path, which
      // resolves without redirecting (see client/src/lib/billing.ts), so
      // the button needs resetting here or it'd stay disabled forever.
      setIsBillingPending(false);
    } catch (error) {
      toast({
        title: t("common.billing"),
        description: extractErrorMessage(error) ?? t("common.couldntOpenBilling"),
        variant: "destructive",
      });
      setIsBillingPending(false);
    }
  };

  return (
    // Fixed dark "scoreboard rail" regardless of the app's light/dark
    // theme — a stable brand anchor, same pattern as Linear/Vercel-style
    // dashboards, instead of the old solid-orange-everywhere sidebar.
    <nav aria-label={t("sidebar.mainNavigation")} className="bg-rail text-rail-foreground flex flex-col h-full w-full min-w-0">
      {/* pt-[max(...)] reserves space under iOS's black-translucent status
          bar for the mobile drawer (a full-height sheet, unlike the desktop
          rail) when this app is added to the home screen — see TopBar.tsx.
          A no-op on desktop, where the inset is always 0. */}
      <div className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 border-b border-rail-border flex items-center gap-3">
        <div className="w-9 h-9 flex-shrink-0 rounded-md basketball-orange flex items-center justify-center">
          <BrandMark className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-lg leading-tight tracking-tight truncate">Backboard</h1>
          <p className="text-xs text-rail-muted truncate">{t("sidebar.tagline")}</p>
        </div>
      </div>

      <TeamSwitcher />

      <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const isActive = location === item.href
            || (location === "/" && item.href === "/dashboard")
            || (item.href === "/playbook" && location.startsWith("/playbook/"));
          const Icon = item.icon;

          return (
            <Link key={item.key} href={item.href} onClick={onNavigate}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium border-l-2 transition-colors duration-150",
                  isActive
                    ? "bg-white/[0.06] text-rail-foreground border-basketball-orange"
                    : "text-rail-muted border-transparent hover:bg-white/[0.04] hover:text-rail-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="flex-1 truncate">{t(item.key)}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-rail-border flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{account?.email}</p>
          <button
            type="button"
            onClick={handlePlanClick}
            disabled={isBillingPending || isClubMember}
            className="mt-1 disabled:opacity-60"
            title={
              isClubMember
                ? t("common.managedByOwner", { email: account?.ownerEmail ?? "" })
                : isPaidPlan(account?.plan ?? "free") ? t("common.manageBilling") : t("common.upgradeToPaid")
            }
          >
            <Badge
              variant="secondary"
              className={`text-[10px] uppercase tracking-wide ${isClubMember ? "" : "cursor-pointer hover:bg-white/20"}`}
            >
              {isClubPlan(account?.plan ?? "free")
                ? t("common.clubPlan")
                : isPaidPlan(account?.plan ?? "free") ? t("common.paidPlan") : t("common.freePlanUpgrade")}
            </Badge>
          </button>
          {account?.membershipRole === "assistant" && (
            <Badge variant="outline" className="mt-1 ml-1 text-[10px] uppercase tracking-wide border-white/30 text-white/70">
              {t("common.readOnly")}
            </Badge>
          )}
        </div>
        <LanguageToggle />
        <ThemeToggle />
        <button
          type="button"
          onClick={logout}
          className="w-10 h-10 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label={t("common.logOut")}
          title={t("common.logOut")}
        >
          <LogOut className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { isMobileOpen, closeMobile } = useSidebar();

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-60 flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile sidebar (drawer) */}
      <Sheet open={isMobileOpen} onOpenChange={(open) => !open && closeMobile()}>
        <SheetContent side="left" className="p-0 w-72 border-0 text-rail-foreground">
          <SheetTitle className="sr-only">{t("sidebar.navigation")}</SheetTitle>
          <SidebarContent onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>
    </>
  );
}
