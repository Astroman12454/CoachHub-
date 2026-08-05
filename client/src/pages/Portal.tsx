import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Trophy, ClipboardCheck, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import PortalNotificationsToggle from "@/components/PortalNotificationsToggle";
import type { PortalData } from "@shared/schema";

type PortalResponse = PortalData & { vapidPublicKey: string | null };

const ATTENDANCE_BADGE: Record<string, string> = {
  present: "bg-success-tint text-success border-success",
  absent: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40",
  late: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/40",
  excused: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
};

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// A completely standalone page — not wrapped in the authenticated Layout —
// reachable by anyone with the link (see server/auth.ts's requireAuth
// exemption for /api/portal/:token). Read-only: no mutation ever originates
// from this page.
export default function Portal() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError, refetch } = useQuery<PortalResponse>({
    queryKey: [`/api/portal/${token}`],
    retry: false,
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background p-4 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <ErrorState
            title="Link not available"
            description="This link may have expired or been revoked. Ask your coach for a new one."
            onRetry={() => refetch()}
          />
        </div>
      </main>
    );
  }

  const statTiles: [string, number][] = data.stats
    ? [
        ["GP", data.stats.gamesPlayed],
        ["PTS", data.stats.points],
        ["REB", data.stats.rebounds],
        ["AST", data.stats.assists],
      ]
    : [];

  return (
    <main className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">{data.team.name}</p>
            <h1 className="font-display font-bold uppercase tracking-tight text-3xl text-foreground leading-tight">
              {data.player.name}
            </h1>
            {data.player.position && (
              <Badge variant="secondary" className="mt-1">{data.player.position}</Badge>
            )}
          </div>
          <PortalNotificationsToggle token={token} vapidPublicKey={data.vapidPublicKey} />
        </header>

        {data.stats && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                Season Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3 text-center">
                {statTiles.map(([label, value]) => (
                  <div key={label}>
                    <p className="font-display font-bold text-2xl tabular-nums text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Upcoming Practices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming practices scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {data.upcomingSessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-muted-foreground">{formatDate(s.date)} · {s.time}</p>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap">{s.duration} min</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Upcoming Games
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingGames.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming games scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {data.upcomingGames.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0"
                  >
                    <p className="font-medium text-foreground">vs {g.opponent}</p>
                    <div className="text-right text-muted-foreground">
                      <p>{formatDate(g.date)}</p>
                      {g.location && <p className="capitalize text-xs">{g.location}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Recent Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.attendance.map((a) => (
                  <li key={a.sessionId} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-foreground">{a.sessionName}</p>
                      <p className="text-muted-foreground text-xs">{formatDate(a.date)}</p>
                    </div>
                    <Badge variant="outline" className={`capitalize ${ATTENDANCE_BADGE[a.status] ?? ""}`}>
                      {a.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
