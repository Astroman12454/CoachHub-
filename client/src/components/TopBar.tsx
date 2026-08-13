import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, Search, X, Plus, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SessionModal from "./SessionModal";
import NotificationsDialog from "./NotificationsDialog";
import { useSidebar } from "@/hooks/use-sidebar";

interface NotificationsResponse {
  unreadCount: number;
}

interface TopBarProps {
  title: string;
  subtitle: string;
  showNewSessionButton?: boolean;
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
}

export default function TopBar({
  title,
  subtitle,
  showNewSessionButton = false,
  onSearch,
  searchPlaceholder
}: TopBarProps) {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { openMobile } = useSidebar();

  // Polling, not push — matches the rest of this app's "no websockets"
  // approach. 45s keeps the badge reasonably fresh without hammering the
  // server across every open tab/page (TopBar mounts on every page).
  const { data: notificationsSummary } = useQuery<NotificationsResponse>({
    queryKey: ['/api/notifications'],
    refetchInterval: 45000,
  });
  const unreadCount = notificationsSummary?.unreadCount ?? 0;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch?.(value);
  };

  const clearSearch = () => {
    setSearchQuery("");
    onSearch?.("");
  };

  return (
    <>
      <header className="bg-card border-b border-border px-4 py-4 lg:px-7 lg:py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={openMobile}
              className="lg:hidden w-11 h-11 flex-shrink-0 basketball-orange rounded-md flex items-center justify-center"
              aria-label={t("common.openNavigationMenu")}
            >
              <Menu className="w-4 h-4 text-white" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <div>
              <h2 className="font-display font-bold uppercase tracking-tight text-2xl lg:text-3xl text-foreground leading-tight">{title}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onSearch && (
              <div className="relative flex-1 lg:flex-none">
                <Input
                  type="text"
                  placeholder={searchPlaceholder ?? `${t("common.search")}...`}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className={`pl-10 w-full lg:w-64 ${searchQuery ? "pr-9" : "pr-4"}`}
                />
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={t("topBar.clearSearch")}
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            {showNewSessionButton && (
              <Button
                onClick={() => setIsModalOpen(true)}
                className="basketball-orange basketball-orange-hover text-white whitespace-nowrap"
              >
                <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
                <span className="hidden sm:inline">{t("topBar.newSession")}</span>
                <span className="sm:hidden">{t("topBar.new")}</span>
              </Button>
            )}

            <button
              type="button"
              onClick={() => setIsNotificationsOpen(true)}
              className="hidden lg:flex relative w-10 h-10 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
              aria-label={unreadCount > 0 ? t("common.notificationsUnread", { count: unreadCount }) : t("common.notifications")}
            >
              <Bell className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full basketball-orange text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <NotificationsDialog open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen} />

      {isModalOpen && (
        <SessionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}
