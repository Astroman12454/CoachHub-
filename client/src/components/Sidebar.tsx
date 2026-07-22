import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/hooks/use-auth";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: "fas fa-tachometer-alt" },
  { name: "Weekly Schedule", href: "/weekly-schedule", icon: "fas fa-calendar-week" },
  { name: "Training Sessions", href: "/training-sessions", icon: "fas fa-calendar-alt" },
  { name: "Exercise Library", href: "/exercise-library", icon: "fas fa-dumbbell" },
  { name: "Players", href: "/players", icon: "fas fa-users" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <div className="basketball-orange basketball-pattern shadow-2xl flex flex-col h-full">
      {/* Logo and Brand */}
      <div className="p-6 border-b border-white border-opacity-20 bg-black bg-opacity-10">
        <div className="flex items-center space-x-3 bounce-in">
          <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center pulse-orange">
            <i className="fas fa-basketball-ball text-white text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Coach Hub</h1>
            <p className="text-sm text-orange-200">Basketball Training</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigation.map((item, index) => {
          const isActive = location === item.href || (location === "/" && item.href === "/dashboard");

          return (
            <Link key={item.name} href={item.href} onClick={onNavigate}>
              <div
                className={cn(
                  "flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 relative overflow-hidden slide-up transform hover:scale-105",
                  isActive
                    ? "bg-white bg-opacity-25 text-white shadow-lg scale-105"
                    : "text-orange-100 hover:bg-white hover:bg-opacity-15 hover:text-white"
                )}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300",
                  isActive
                    ? "bg-white bg-opacity-30"
                    : "bg-white bg-opacity-10 group-hover:bg-opacity-20"
                )}>
                  <i className={`${item.icon} text-sm`}></i>
                </div>
                <span className="flex-1">{item.name}</span>
                {isActive && (
                  <div className="w-2 h-2 bg-white rounded-full pulse-orange"></div>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-white border-opacity-20 bg-black bg-opacity-10">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 court-bg rounded-xl flex items-center justify-center">
            <i className="fas fa-user text-white"></i>
          </div>
          <div className="flex-1">
            <p className="font-medium text-white">Coach Johnson</p>
            <p className="text-sm text-orange-200">Lakers High School</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center hover:bg-opacity-30 transition-all"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <i className="fas fa-right-from-bracket text-white text-xs" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { isMobileOpen, closeMobile } = useSidebar();

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-64 flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile sidebar (drawer) */}
      <Sheet open={isMobileOpen} onOpenChange={(open) => !open && closeMobile()}>
        <SheetContent side="left" className="p-0 w-72 border-0 text-white">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>
    </>
  );
}
