import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlayerAttentionFlag } from "@shared/schema";

interface PlayersToWatchCardProps {
  flags: PlayerAttentionFlag[] | undefined;
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Crosses attendance against active injuries — a player with an unresolved
// injury who was still marked present/late in the last 7 days, worth a
// second look whether that's an intentional limited return or an oversight.
// Hidden entirely when there's nothing to flag, same as TeamProgressCard.
export default function PlayersToWatchCard({ flags }: PlayersToWatchCardProps) {
  const { t } = useTranslation();
  if (!flags || flags.length === 0) return null;

  return (
    <Card className="mb-5 border-red-200 dark:border-red-900/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="w-4 h-4 text-red-600" strokeWidth={1.75} aria-hidden="true" />
          {t("dashboard.playersToWatch")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {flags.map((flag) => (
          <Link
            key={flag.playerId}
            href={`/players/${flag.playerId}`}
            className="flex items-center justify-between gap-2 text-sm border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{flag.playerName}</p>
              <p className="text-muted-foreground truncate">{flag.injuryDescription}</p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {t("dashboard.markedPresentOn", { date: formatDate(flag.lastPresentDate) })}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
