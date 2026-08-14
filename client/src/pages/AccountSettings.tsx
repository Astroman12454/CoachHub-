import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import TopBar from "@/components/TopBar";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

// Reachable from every plan (unlike /settings/coaches, which only a Club
// owner ever sees) — the one settings surface every coach has, so it's
// where the one account-level action every coach might need lives: closing
// the account for good. Everything else about a coach's setup (team prefs,
// public name, coach seats) already has a home in CoachSettings.tsx.
export default function AccountSettings() {
  const { t } = useTranslation();
  const { account } = useAuth();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <TopBar title={t("accountSettings.title")} subtitle={account?.email ?? ""} />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-2xl fade-in">
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              {t("accountSettings.dangerZone")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{t("accountSettings.deleteAccountDescription")}</p>
            <Button type="button" variant="destructive" onClick={() => setIsDeleteOpen(true)}>
              {t("accountSettings.deleteAccount")}
            </Button>
          </CardContent>
        </Card>
      </main>

      <DeleteAccountDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} />
    </div>
  );
}
