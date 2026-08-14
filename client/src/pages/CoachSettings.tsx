import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserPlus, X, Mail, Clock, Check, Download, Loader2, User } from "lucide-react";
import TopBar from "@/components/TopBar";
import ConfirmDialog from "@/components/ConfirmDialog";
import ErrorState from "@/components/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { SESSION_QUERY_KEY } from "@/lib/queryClient";
import { TEAM_THEME_PRESETS } from "@/lib/teamTheme";
import { cn } from "@/lib/utils";
import { CLUB_PLAN_SEAT_LIMIT, TEAM_THEME_COLORS, type TeamThemeColor } from "@shared/schema";

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
  const { account, teams, currentTeamId } = useAuth();
  const currentTeam = teams.find((team) => team.id === currentTeamId);
  const [email, setEmail] = useState("");
  const [removeTarget, setRemoveTarget] = useState<CoachMember | null>(null);
  const [defaultDuration, setDefaultDuration] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [themeColor, setThemeColor] = useState<TeamThemeColor | null>(null);
  const [publicName, setPublicName] = useState<string>("");

  useEffect(() => {
    setDefaultDuration(currentTeam?.defaultSessionDuration ? String(currentTeam.defaultSessionDuration) : "");
    setLogoUrl(currentTeam?.logoUrl ?? "");
    setThemeColor((currentTeam?.themeColor as TeamThemeColor | null) ?? null);
  }, [currentTeam?.id, currentTeam?.defaultSessionDuration, currentTeam?.logoUrl, currentTeam?.themeColor]);

  useEffect(() => {
    setPublicName(account?.publicName ?? "");
  }, [account?.publicName]);

  const { data, isLoading, isError, refetch } = useQuery<CoachesResponse>({ queryKey: ["/api/coaches"] });

  const savePreferencesMutation = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/teams/${currentTeamId}`, {
        defaultSessionDuration: defaultDuration ? Number(defaultDuration) : null,
        logoUrl: logoUrl.trim() || null,
        themeColor,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] });
      toast({ title: t("coachSettings.preferencesSaved") });
    },
    onError: (error) => {
      toast({
        title: t("coachSettings.couldntSavePreferences"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const savePublicNameMutation = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/account/public-name", { publicName: publicName.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] });
      toast({ title: t("coachSettings.publicNameSaved") });
    },
    onError: (error) => {
      toast({
        title: t("coachSettings.couldntSavePublicName"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", `/api/teams/${currentTeamId}/export`);
      return res.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `coachhub-backup-${(currentTeam?.name ?? "team").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${dateStamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (error) => {
      toast({
        title: t("coachSettings.couldntExportBackup"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

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
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
              {t("coachSettings.teamPreferences")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label htmlFor="default-session-duration" className="text-sm font-medium text-foreground mb-2 block">
                {t("coachSettings.defaultSessionDuration")}
              </label>
              <p className="text-sm text-muted-foreground mb-3">{t("coachSettings.defaultSessionDurationDescription")}</p>
              <Select value={defaultDuration || "none"} onValueChange={(v) => setDefaultDuration(v === "none" ? "" : v)}>
                <SelectTrigger id="default-session-duration" className="w-full sm:w-56">
                  <SelectValue placeholder={t("coachSettings.noDefault")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("coachSettings.noDefault")}</SelectItem>
                  <SelectItem value="60">{t("sessionModal.minutesOption", { count: 60 })}</SelectItem>
                  <SelectItem value="90">{t("sessionModal.minutesOption", { count: 90 })}</SelectItem>
                  <SelectItem value="120">{t("sessionModal.minutesOption", { count: 120 })}</SelectItem>
                  <SelectItem value="150">{t("sessionModal.minutesOption", { count: 150 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="team-logo-url" className="text-sm font-medium text-foreground mb-2 block">
                {t("coachSettings.teamLogo")}
              </label>
              <p className="text-sm text-muted-foreground mb-3">{t("coachSettings.teamLogoDescription")}</p>
              <div className="flex items-center gap-3">
                {logoUrl.trim() && (
                  <img
                    src={logoUrl.trim()}
                    alt=""
                    className="w-10 h-10 rounded-md object-cover border border-border flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                  />
                )}
                <Input
                  id="team-logo-url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder={t("coachSettings.teamLogoPlaceholder")}
                  aria-label={t("coachSettings.teamLogo")}
                  className="flex-1"
                />
              </div>
            </div>

            <div>
              <span className="text-sm font-medium text-foreground mb-2 block">{t("coachSettings.teamColor")}</span>
              <p className="text-sm text-muted-foreground mb-3">{t("coachSettings.teamColorDescription")}</p>
              <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={t("coachSettings.teamColor")}>
                <button
                  type="button"
                  onClick={() => setThemeColor(null)}
                  aria-pressed={themeColor === null}
                  aria-label={t("coachSettings.defaultOrange")}
                  title={t("coachSettings.defaultOrange")}
                  className={cn(
                    "w-8 h-8 rounded-full basketball-orange flex items-center justify-center border-2 transition-colors",
                    themeColor === null ? "border-foreground" : "border-transparent"
                  )}
                >
                  {themeColor === null && <Check className="w-4 h-4 text-white" strokeWidth={2.5} aria-hidden="true" />}
                </button>
                {TEAM_THEME_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setThemeColor(color)}
                    aria-pressed={themeColor === color}
                    aria-label={t(`coachSettings.themeColors.${color}`)}
                    title={t(`coachSettings.themeColors.${color}`)}
                    style={{ backgroundColor: TEAM_THEME_PRESETS[color].base }}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                      themeColor === color ? "border-foreground" : "border-transparent"
                    )}
                  >
                    {themeColor === color && <Check className="w-4 h-4 text-white" strokeWidth={2.5} aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="button"
              onClick={() => savePreferencesMutation.mutate()}
              disabled={savePreferencesMutation.isPending || !currentTeamId}
              className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
            >
              {savePreferencesMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
              {t("coachSettings.publicProfile")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label htmlFor="public-name" className="text-sm font-medium text-foreground mb-2 block">
                {t("coachSettings.publicName")}
              </label>
              <p className="text-sm text-muted-foreground mb-3">{t("coachSettings.publicNameDescription")}</p>
              <Input
                id="public-name"
                value={publicName}
                onChange={(e) => setPublicName(e.target.value)}
                placeholder={t("setPublicNameDialog.placeholder")}
                maxLength={40}
                className="max-w-sm"
              />
            </div>
            <Button
              type="button"
              onClick={() => savePublicNameMutation.mutate()}
              disabled={savePublicNameMutation.isPending || publicName.trim().length < 2}
              className="basketball-orange basketball-orange-hover text-white w-full sm:w-auto"
            >
              {savePublicNameMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-4 h-4 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
              {t("coachSettings.exportBackup")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">{t("coachSettings.exportBackupDescription")}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending || !currentTeamId}
            >
              {exportMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
                : <Download className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />}
              {exportMutation.isPending ? t("coachSettings.exportingEllipsis") : t("coachSettings.downloadBackup")}
            </Button>
          </CardContent>
        </Card>

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
            ) : isError ? (
              <ErrorState onRetry={() => refetch()} />
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
