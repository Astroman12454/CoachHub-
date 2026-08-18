import { useEffect, useRef } from "react";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

interface GettingStartedCardProps {
  hasPlayers: boolean;
  hasRecurringSchedule: boolean;
  hasSessions: boolean;
  onAddPlayers: () => void;
  onSetSchedule: () => void;
  onCreateSession: () => void;
}

// The sidebar's order (and BottomTabBar's) is tuned for a coach who's
// already set up — Weekly Schedule right after Dashboard, because that's
// what gets checked most once a season is running. But a brand-new account
// needs a different, one-time order first: roster, then a weekly rhythm,
// then the first actual session. Rather than reordering navigation itself
// (which would be jarring for an established coach, and wrong the moment
// the two audiences' needs diverge), this surfaces that setup order as a
// self-dismissing checklist — it's derived entirely from data that's
// already true or not (no players yet, no recurring slots, no sessions),
// so it disappears on its own once a coach is through onboarding and never
// comes back.
export default function GettingStartedCard({
  hasPlayers,
  hasRecurringSchedule,
  hasSessions,
  onAddPlayers,
  onSetSchedule,
  onCreateSession,
}: GettingStartedCardProps) {
  const { t } = useTranslation();

  const steps = [
    { done: hasPlayers, label: t("dashboard.gettingStarted.addPlayers"), onClick: onAddPlayers },
    { done: hasRecurringSchedule, label: t("dashboard.gettingStarted.setSchedule"), onClick: onSetSchedule },
    { done: hasSessions, label: t("dashboard.gettingStarted.createSession"), onClick: onCreateSession },
  ];

  const allDone = steps.every((step) => step.done);

  // Fires once per mount when the checklist first reads as fully done —
  // the server dedupes across repeat visits/reloads (see
  // trackMilestoneEvent), so this doesn't need to track "have I already
  // sent this" itself.
  const hasTracked = useRef(false);
  useEffect(() => {
    if (allDone && !hasTracked.current) {
      hasTracked.current = true;
      apiRequest("POST", "/api/analytics/track", { event: "onboarding_checklist_completed" }).catch(() => {});
    }
  }, [allDone]);

  if (allDone) return null;

  return (
    <Card className="mb-5 border-basketball-orange/30">
      <CardHeader className="pb-3">
        <CardTitle>{t("dashboard.gettingStarted.title")}</CardTitle>
      </CardHeader>
      <div className="px-4 pb-4 space-y-2">
        {steps.map((step, index) => (
          <button
            key={index}
            type="button"
            onClick={step.onClick}
            disabled={step.done}
            className={`w-full flex items-center gap-3 p-3 rounded-md border text-left transition-colors ${
              step.done
                ? "border-border bg-muted/40 text-muted-foreground cursor-default"
                : "border-border hover:border-basketball-orange hover:bg-muted/60"
            }`}
          >
            {step.done ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-success" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Circle className="w-4 h-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            )}
            <span className={`flex-1 text-sm font-medium ${step.done ? "line-through" : "text-foreground"}`}>
              {step.label}
            </span>
            {!step.done && <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </Card>
  );
}
