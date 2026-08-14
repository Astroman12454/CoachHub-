import { Link, useLocation } from "wouter";
import { LayoutDashboard, CalendarRange, Plus, Trophy, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

// A fast path for the handful of things a coach actually reaches for on
// their phone — the hamburger drawer (still there, under "Más") covers
// everything else, but making someone open a drawer just to check today's
// practice or jump into the week view is the kind of friction this app
// shouldn't have on the device coaches use courtside. Order mirrors real
// frequency: home base, the weekly view, the one action worth a dedicated
// button (creating a session), then post-game logging.
export default function BottomTabBar() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const { openMobile } = useSidebar();

  const isActive = (href: string) => location === href || (location === "/" && href === "/dashboard");

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors",
      active ? "text-basketball-orange" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <nav
      aria-label={t("bottomNav.label")}
      className="lg:hidden flex items-stretch h-16 flex-shrink-0 border-t border-border bg-card"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Link href="/dashboard" className={tabClass(isActive("/dashboard"))}>
        <LayoutDashboard className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        {t("nav.dashboard")}
      </Link>
      <Link href="/weekly-schedule" className={tabClass(isActive("/weekly-schedule"))}>
        <CalendarRange className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        {t("nav.weeklySchedule")}
      </Link>
      <button
        type="button"
        onClick={() => setLocation("/dashboard?newSession=1")}
        className="flex flex-col items-center justify-center flex-1 h-full"
        aria-label={t("dashboard.createTrainingSession")}
      >
        <span className="w-10 h-10 rounded-full basketball-orange basketball-orange-hover flex items-center justify-center shadow-sm">
          <Plus className="w-5 h-5 text-white" strokeWidth={2} aria-hidden="true" />
        </span>
      </button>
      <Link href="/games" className={tabClass(isActive("/games"))}>
        <Trophy className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        {t("nav.games")}
      </Link>
      <button type="button" onClick={openMobile} className={tabClass(false)} aria-label={t("bottomNav.more")}>
        <Menu className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        {t("bottomNav.more")}
      </button>
    </nav>
  );
}
