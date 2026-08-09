import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserPlus, X, Mail } from "lucide-react";
import TopBar from "@/components/TopBar";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CLUB_PLAN_SEAT_LIMIT } from "@shared/schema";

interface CoachMember {
  memberAccountId: number;
  email: string;
  createdAt: string | null;
}
interface PendingInvite {
  id: number;
  email: string;
  expiresAt: string;
}
interface CoachesResponse {
  members: CoachMember[];
  pendingInvites: PendingInvite[];
  seatLimit: number;
}

export default function CoachSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [removeTarget, setRemoveTarget] = useState<CoachMember | null>(null);

  const { data, isLoading } = useQuery<CoachesResponse>({ queryKey: ["/api/coaches"] });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => apiRequest("POST", "/api/coaches/invite", { email }),
    onSuccess: () => {
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/coaches"] });
      toast({ title: t("coachSettings.inviteSent") });
    },
    onError: (error) => {
      toast({
        title: t("coachSettings.couldntSendInvite"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/coaches/invites/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/coaches"] }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberAccountId: number) => apiRequest("DELETE", `/api/coaches/${memberAccountId}`),
    onSuccess: () => {
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/coaches"] });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    inviteMutation.mutate(email.trim());
  };

  const seatLimit = data?.seatLimit ?? CLUB_PLAN_SEAT_LIMIT;
  const seatsUsed = (data?.members.length ?? 0) + (data?.pendingInvites.length ?? 0);
  const atSeatLimit = seatsUsed >= seatLimit;

  return (
    <div className="flex flex-col h-full">
      <TopBar title={t("coachSettings.title")} subtitle={t("coachSettings.subtitle")} />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-2xl fade-in">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t("coachSettings.inviteACoach")}</span>
              <Badge variant="secondary">{t("coachSettings.seatsUsed", { used: seatsUsed, limit: seatLimit })}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("coachSettings.emailPlaceholder")}
                aria-label={t("coachSettings.emailPlaceholder")}
                disabled={atSeatLimit || inviteMutation.isPending}
              />
              <Button type="submit" disabled={atSeatLimit || inviteMutation.isPending || !email.trim()}>
                <UserPlus className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                {inviteMutation.isPending ? t("coachSettings.sendingEllipsis") : t("coachSettings.sendInvite")}
              </Button>
            </form>
            {atSeatLimit && <p className="text-sm text-muted-foreground mt-2">{t("coachSettings.atSeatLimit")}</p>}
          </CardContent>
        </Card>

        {!isLoading && data && data.pendingInvites.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("coachSettings.pendingInvites")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-2 border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span className="text-sm truncate">{invite.email}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 shrink-0"
                    onClick={() => revokeInviteMutation.mutate(invite.id)}
                    disabled={revokeInviteMutation.isPending}
                    aria-label={t("coachSettings.revokeInviteFor", { email: invite.email })}
                    title={t("coachSettings.revokeInvite")}
                  >
                    <X className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("coachSettings.coaches")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : data && data.members.length > 0 ? (
              data.members.map((member) => (
                <div key={member.memberAccountId} className="flex items-center justify-between gap-2 border border-border rounded-lg p-3">
                  <span className="text-sm truncate">{member.email}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => setRemoveTarget(member)}
                  >
                    {t("coachSettings.remove")}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("coachSettings.noCoachesYet")}</p>
            )}
          </CardContent>
        </Card>
      </main>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={t("coachSettings.removeCoachTitle")}
        description={t("coachSettings.removeCoachDescription", { email: removeTarget?.email })}
        confirmLabel={t("coachSettings.remove")}
        isPending={removeMemberMutation.isPending}
        onConfirm={() => removeTarget && removeMemberMutation.mutate(removeTarget.memberAccountId)}
      />
    </div>
  );
}
