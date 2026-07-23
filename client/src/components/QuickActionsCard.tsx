import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <CardContent className="space-y-3">
        <Button
          className="w-full basketball-orange basketball-orange-hover text-white"
          onClick={onCreateSession}
        >
          <i className="fas fa-plus mr-2"></i>
          Create Training Session
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onNavigate('/exercise-library')}
        >
          <i className="fas fa-dumbbell mr-2"></i>
          Add New Exercise
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onNavigate('/players')}
        >
          <i className="fas fa-user-plus mr-2"></i>
          Add Player
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onNavigate('/weekly-schedule')}
        >
          <i className="fas fa-calendar-week mr-2"></i>
          Weekly Schedule
        </Button>
      </CardContent>
    </Card>
  );
}
