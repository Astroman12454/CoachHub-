import { Plus, Dumbbell, UserPlus, CalendarRange, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QuickActionsCardProps {
  onCreateSession: () => void;
  onNavigate: (path: string) => void;
  onRepeatLastSession?: () => void;
}

export default function QuickActionsCard({ onCreateSession, onNavigate, onRepeatLastSession }: QuickActionsCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.quickActions")}</CardTitle>
      </CardHeader>
      <div className="px-4 pb-4 space-y-2">
        <Button
          className="w-full basketball-orange basketball-orange-hover text-white justify-start"
          onClick={onCreateSession}
        >
          <Plus className="w-4 h-4 mr-2" strokeWidth={2} aria-hidden="true" />
          {t("dashboard.createTrainingSession")}
        </Button>
        {onRepeatLastSession && (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onRepeatLastSession}
          >
            <Repeat className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
            {t("dashboard.repeatLastSession")}
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => onNavigate('/exercise-library')}
        >
          <Dumbbell className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
          {t("dashboard.addNewExercise")}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => onNavigate('/players')}
        >
          <UserPlus className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
          {t("dashboard.addPlayer")}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => onNavigate('/weekly-schedule')}
        >
          <CalendarRange className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
          {t("nav.weeklySchedule")}
        </Button>
      </div>
    </Card>
  );
}
