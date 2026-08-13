import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { apiRequest } from "@/lib/queryClient";

interface NotificationItem {
  id: number;
  type: "follow" | "like";
  actorAccountId: number;
  actorPublicName: string | null;
  exerciseId: number | null;
  exerciseName: string | null;
  read: boolean;
  createdAt: string | null;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

function formatWhen(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// The bell icon's dropdown-turned-dialog (no Popover/DropdownMenu primitive
// is installed in this app, and Dialog is already the accessible, tested
// pattern everything else here uses) — lists follows and likes on the
// coach's published exercises. Opening the dialog no longer marks
// everything read on its own — only a notification you actually click gets
// marked read (see handleItemClick), so scrolling past the rest without
// clicking leaves them genuinely unread. "Mark all as read" is a deliberate
// opt-in action instead.
export default function NotificationsDialog({ open, onOpenChange }: NotificationsDialogProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  // No `enabled: open` gate — TopBar's own poll (same query key, for the
  // bell's unread badge) keeps this populated even before the dialog opens,
  // so opening it usually just reads an already-warm cache.
  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['/api/notifications'],
    refetchOnWindowFocus: true,
  });

  const markOneReadMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onMutate: async (id) => {
      queryClient.setQueryData<NotificationsResponse>(['/api/notifications'], (old) => {
        if (!old) return old;
        const target = old.notifications.find((n) => n.id === id);
        if (!target || target.read) return old;
        return {
          unreadCount: Math.max(0, old.unreadCount - 1),
          notifications: old.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
        };
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/notifications/read-all"),
    onMutate: async () => {
      queryClient.setQueryData<NotificationsResponse>(['/api/notifications'], (old) =>
        old && { unreadCount: 0, notifications: old.notifications.map((n) => ({ ...n, read: true })) }
      );
    },
  });

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) markOneReadMutation.mutate(item.id);
    handleOpenChange(false);
    if (item.type === "follow") {
      setLocation(`/coaches/${item.actorAccountId}`);
    } else {
      setLocation("/exercise-library");
    }
  };

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="font-display uppercase tracking-tight">{t("notificationsDialog.title")}</DialogTitle>
              <DialogDescription>{t("notificationsDialog.description")}</DialogDescription>
            </div>
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="whitespace-nowrap flex-shrink-0"
              >
                {t("notificationsDialog.markAllRead")}
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t("notificationsDialog.empty")}</p>
        ) : (
          <ul className="space-y-1 max-h-96 overflow-y-auto">
            {notifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-md hover:bg-muted transition-colors ${item.read ? "" : "bg-basketball-orange/5"}`}
                >
                  <div className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center ${item.type === "like" ? "bg-red-100 dark:bg-red-950/40" : "bg-court/10"}`}>
                    {item.type === "like"
                      ? <Heart className="w-3.5 h-3.5 text-red-500" strokeWidth={1.75} aria-hidden="true" />
                      : <UserCheck className="w-3.5 h-3.5 text-court" strokeWidth={1.75} aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      {item.type === "follow"
                        ? t("notificationsDialog.followText", { name: item.actorPublicName ?? t("notificationsDialog.someone") })
                        : t("notificationsDialog.likeText", { name: item.actorPublicName ?? t("notificationsDialog.someone"), exercise: item.exerciseName ?? "" })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatWhen(item.createdAt)}</p>
                  </div>
                  {!item.read && (
                    <span className="w-2 h-2 flex-shrink-0 mt-1.5 rounded-full basketball-orange" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
