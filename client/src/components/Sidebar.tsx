import { Link, useLocation } from "wouter";
import { LayoutDashboard, CalendarRange, CalendarDays, Dumbbell, Users, User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/hooks/use-auth";
import ThemeToggle from "@/components/ThemeToggle";
import BrandMark from "@/components/BrandMark";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Weekly Schedule", href: "/weekly-schedule", icon: CalendarRange },
  { name: "Training Sessions", href: "/training-sessions", icon: CalendarDays },
  { name: "Exercise Library", href: "/exercise-library", icon: Dumbbell },
  { name: "Players", href: "/players", icon: Users },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();

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
        <div className="w-9 h-9 flex-shrink-0 rounded-md bg-white/10 flex items-center justify-center">
          <User className="w-4 h-4 text-rail-foreground" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">Coach Johnson</p>
          <p className="text-xs text-rail-muted truncate">Lakers High School</p>
        </div>
        <ThemeToggle />
        <button
          type="button"
          onClick={logout}
          className="w-10 h-10 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
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
