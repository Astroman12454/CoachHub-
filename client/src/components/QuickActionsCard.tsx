import { Plus, Dumbbell, UserPlus, CalendarRange } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QuickActionsCardProps {
  onCreateSession: () => void;
  onNavigate: (path: string) => void;
}

export default function QuickActionsCard({ onCreateSession, onNavigate }: QuickActionsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <div className="px-4 pb-4 space-y-2">
        <Button
          className="w-full basketball-orange basketball-orange-hover text-white justify-start"
          onClick={onCreateSession}
        >
          <Plus className="w-4 h-4 mr-2" strokeWidth={2} aria-hidden="true" />
          Create Training Session
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => onNavigate('/exercise-library')}
        >
          <Dumbbell className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
          Add New Exercise
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => onNavigate('/players')}
        >
          <UserPlus className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
          Add Player
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => onNavigate('/weekly-schedule')}
        >
          <CalendarRange className="w-4 h-4 mr-2" strokeWidth={1.75} aria-hidden="true" />
          Weekly Schedule
        </Button>
      </div>
    </Card>
  );
}
