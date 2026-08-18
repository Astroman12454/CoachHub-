import { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";

interface GuardianAuthorizationInfo {
  playerName: string;
  purposeLabel: string;
  guardianEmail: string;
}

// Completely standalone, no session — the guardian is never asked to
// create a Coach Hub account. Mirrors Portal.tsx/AcceptInvite.tsx: a
// token-scoped GET for display, then one mutation for the guardian's
// one-time decision (see server/guardian-authorization.ts).
export default function GuardianAuthorization() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [decided, setDecided] = useState<"approved" | "declined" | null>(null);

  const infoQuery = useQuery<GuardianAuthorizationInfo>({
    queryKey: [`/api/guardian-authorization/${token}`],
    enabled: !!token,
    retry: false,
  });

  const decideMutation = useMutation({
    mutationFn: async (decision: "approved" | "declined") => {
      await apiRequest("POST", `/api/guardian-authorization/${token}`, { decision });
      return decision;
    },
    onSuccess: (decision) => setDecided(decision),
  });

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-rail p-4 relative">
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm bg-card rounded-lg shadow-2xl p-8 fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground text-center">
            {t("guardianAuthorization.title")}
          </h1>
        </div>

        {!token || infoQuery.isError ? (
          <p className="text-sm text-red-600 text-center" role="alert">{t("guardianAuthorization.invalidRequest")}</p>
        ) : infoQuery.isLoading ? (
          <p className="text-sm text-muted-foreground text-center">{t("common.loading")}</p>
        ) : decided === "approved" ? (
          <p className="text-sm text-foreground text-center" role="status">{t("guardianAuthorization.approvedMessage")}</p>
        ) : decided === "declined" ? (
          <p className="text-sm text-foreground text-center" role="status">{t("guardianAuthorization.declinedMessage")}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              {t("guardianAuthorization.description", {
                player: infoQuery.data!.playerName,
                purpose: infoQuery.data!.purposeLabel,
              })}
            </p>
            {decideMutation.isError && (
              <p className="text-sm text-red-600 text-center" role="alert">
                {extractErrorMessage(decideMutation.error) ?? t("guardianAuthorization.couldntRespond")}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button
                className="w-full basketball-orange basketball-orange-hover text-white"
                disabled={decideMutation.isPending}
                onClick={() => decideMutation.mutate("approved")}
              >
                {t("guardianAuthorization.approve")}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={decideMutation.isPending}
                onClick={() => decideMutation.mutate("declined")}
              >
                {t("guardianAuthorization.decline")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
