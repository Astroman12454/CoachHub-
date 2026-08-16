import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Flag, ShieldAlert, Trash2, X } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { formatTimestamp as formatWhen } from "@/lib/time";
import type { AdminReportView } from "@shared/schema";

const REPORTS_QUERY_KEY = "/api/admin/reports";

// Reachable only from the Sidebar's own isAdmin-gated link, but a direct
// URL visit from a non-admin account is still possible — the real gate is
// GET /api/admin/reports itself (403 for anyone without accounts.isAdmin),
// this page just renders that outcome instead of crashing on it.
export default function AdminReports() {
  const { t } = useTranslation();
  const { account } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reports, isLoading, isError } = useQuery<AdminReportView[]>({
    queryKey: [REPORTS_QUERY_KEY],
    enabled: !!account?.isAdmin,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ report, action }: { report: AdminReportView; action: "dismiss" | "remove" }) =>
      apiRequest("POST", `/api/admin/reports/${report.contentType}/${report.id}/resolve`, { action }),
    onSuccess: (_data, { action }) => {
      toast({ title: action === "remove" ? t("adminReports.removed") : t("adminReports.dismissed") });
      queryClient.invalidateQueries({ queryKey: [REPORTS_QUERY_KEY] });
    },
    onError: (error) => {
      toast({
        title: t("adminReports.couldntResolve"),
        description: extractErrorMessage(error) ?? t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  if (!account?.isAdmin) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title={t("adminReports.title")} subtitle="" />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 fade-in">
          <EmptyState icon={ShieldAlert} title={t("adminReports.notAuthorized")} description={t("adminReports.notAuthorizedDescription")} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={t("adminReports.title")}
        subtitle={reports?.length ? t("adminReports.pendingCount", { count: reports.length }) : t("adminReports.subtitle")}
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-3xl fade-in">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : isError ? (
          <EmptyState icon={ShieldAlert} title={t("adminReports.notAuthorized")} description={t("adminReports.notAuthorizedDescription")} />
        ) : !reports || reports.length === 0 ? (
          <EmptyState icon={Flag} title={t("adminReports.emptyTitle")} description={t("adminReports.emptyDescription")} />
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <Card key={`${report.contentType}-${report.id}`}>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline">{t(`adminReports.contentTypes.${report.contentType}`)}</Badge>
                        <Badge variant="destructive">{t(`reportContentDialog.reasons.${report.reason}`)}</Badge>
                      </div>
                      <p className="font-display font-semibold uppercase tracking-tight text-foreground">{report.contentName}</p>
                    </div>
                    {report.createdAt && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatWhen(report.createdAt)}</span>
                    )}
                  </div>

                  {report.details && <p className="text-sm text-muted-foreground">{report.details}</p>}

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>{t("adminReports.reportedBy", { name: report.reporterPublicName ?? report.reporterEmail })}</p>
                    <p>{t("adminReports.publishedBy", { email: report.ownerEmail })}</p>
                  </div>

                  <div className="flex items-center gap-2 justify-end pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => resolveMutation.mutate({ report, action: "dismiss" })}
                      disabled={resolveMutation.isPending}
                    >
                      <X className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                      {t("adminReports.dismiss")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => resolveMutation.mutate({ report, action: "remove" })}
                      disabled={resolveMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
                      {t("adminReports.removeContent")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
