import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Card className="text-center py-14">
      <CardContent>
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h3 className="font-display font-semibold uppercase tracking-tight text-lg text-foreground mb-1.5">{title}</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">{description}</p>
        {action && (
          <Button
            onClick={action.onClick}
            className="basketball-orange basketball-orange-hover text-white"
          >
            {action.icon && <action.icon className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />}
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
