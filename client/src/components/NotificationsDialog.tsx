import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
// coach's published exercises. Opening it marks everything read, same
// "seen = read" model as most bell icons; there's no per-item unread state
// to preserve once you've looked.
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
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.setQueryData<NotificationsResponse>(['/api/notifications'], (old) =>
        old && { unreadCount: 0, notifications: old.notifications.map((n) => ({ ...n, read: true })) }
      );
    },
  });

  useEffect(() => {
    if (open && data && data.unreadCount > 0) {
      markAllReadMutation.mutate();
    }
    // Only fire once per open, right after the list loads unread items —
    // not on every data refetch while the dialog stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data?.unreadCount]);

  const handleItemClick = (item: NotificationItem) => {
    handleOpenChange(false);
    if (item.type === "follow") {
      setLocation(`/coaches/${item.actorAccountId}`);
    } else {
      setLocation("/exercise-library");
    }
  };

  const notifications = data?.notifications ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("notificationsDialog.title")}</DialogTitle>
          <DialogDescription>{t("notificationsDialog.description")}</DialogDescription>
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
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {item.type === "follow"
                        ? t("notificationsDialog.followText", { name: item.actorPublicName ?? t("notificationsDialog.someone") })
                        : t("notificationsDialog.likeText", { name: item.actorPublicName ?? t("notificationsDialog.someone"), exercise: item.exerciseName ?? "" })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatWhen(item.createdAt)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
