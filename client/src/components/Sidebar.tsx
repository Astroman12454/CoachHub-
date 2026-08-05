import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, CalendarRange, CalendarDays, Dumbbell, Users, Trophy, LogOut, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { startCheckout, openBillingPortal } from "@/lib/billing";
import { extractErrorMessage } from "@/lib/queryClient";
import ThemeToggle from "@/components/ThemeToggle";
import BrandMark from "@/components/BrandMark";
import NewTeamDialog from "@/components/NewTeamDialog";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Weekly Schedule", href: "/weekly-schedule", icon: CalendarRange },
  { name: "Training Sessions", href: "/training-sessions", icon: CalendarDays },
  { name: "Games", href: "/games", icon: Trophy },
  { name: "Exercise Library", href: "/exercise-library", icon: Dumbbell },
  { name: "Players", href: "/players", icon: Users },
];

const NEW_TEAM_VALUE = "__new__";

function TeamSwitcher() {
  const { teams, currentTeamId, switchTeam } = useAuth();
  const [isNewTeamOpen, setIsNewTeamOpen] = useState(false);

  const handleChange = (value: string) => {
    if (value === NEW_TEAM_VALUE) {
      setIsNewTeamOpen(true);
      return;
    }
    switchTeam(parseInt(value));
  };

  return (
    <div className="px-3 pt-3">
      <Select value={currentTeamId?.toString() ?? ""} onValueChange={handleChange}>
        <SelectTrigger
          className="bg-white/5 border-rail-border text-rail-foreground hover:bg-white/10 focus:ring-basketball-orange"
          aria-label="Switch team"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ChevronsUpDown className="w-3.5 h-3.5 flex-shrink-0 text-rail-muted" strokeWidth={1.75} aria-hidden="true" />
            <SelectValue placeholder="Select team" />
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
              New Team
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <NewTeamDialog open={isNewTeamOpen} onOpenChange={setIsNewTeamOpen} />
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { account, logout } = useAuth();
  const { toast } = useToast();
  const [isBillingPending, setIsBillingPending] = useState(false);

  const handlePlanClick = async () => {
    if (isBillingPending) return;
    setIsBillingPending(true);
    try {
      await (account?.plan === "paid" ? openBillingPortal() : startCheckout());
    } catch (error) {
      toast({
        title: "Billing",
        description: extractErrorMessage(error) ?? "Couldn't open billing right now.",
        variant: "destructive",
      });
      setIsBillingPending(false);
    }
  };

  return (
    // Fixed dark "scoreboard rail" regardless of the app's light/dark
    // theme — a stable brand anchor, same pattern as Linear/Vercel-style
    // dashboards, instead of the old solid-orange-everywhere sidebar.
    <nav aria-label="Main" className="bg-rail text-rail-foreground flex flex-col h-full">
      <div className="p-5 border-b border-rail-border flex items-center gap-3">
        <div className="w-9 h-9 flex-shrink-0 rounded-md basketball-orange flex items-center justify-center">
          <BrandMark className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-lg leading-tight tracking-tight truncate">Coach Hub</h1>
          <p className="text-xs text-rail-muted truncate">Basketball Training</p>
        </div>
      </div>

      <TeamSwitcher />

      <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location === item.href || (location === "/" && item.href === "/dashboard");
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href} onClick={onNavigate}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium border-l-2 transition-colors duration-150",
                  isActive
                    ? "bg-white/[0.06] text-rail-foreground border-basketball-orange"
                    : "text-rail-muted border-transparent hover:bg-white/[0.04] hover:text-rail-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="flex-1 truncate">{item.name}</span>
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
            disabled={isBillingPending}
            className="mt-1 disabled:opacity-60"
            title={account?.plan === "paid" ? "Manage billing" : "Upgrade to paid"}
          >
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide cursor-pointer hover:bg-white/20">
              {account?.plan === "paid" ? "Paid Plan" : "Free Plan · Upgrade"}
            </Badge>
          </button>
        </div>
        <ThemeToggle />
        <button
          type="button"
          onClick={logout}
          className="w-10 h-10 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default function Sidebar() {
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
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>
    </>
  );
}
