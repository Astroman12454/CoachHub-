import { AlertTriangle, RotateCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry: () => void;
}

// Shown instead of the page's normal content whenever its query failed —
// distinct from EmptyState (which means "this really has zero items") so a
// network/server failure never gets silently mistaken for an empty list.
export default function ErrorState({
  title = "Couldn't load this",
  description = "Something went wrong while fetching this data. Check your connection and try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <Card className="text-center py-14">
      <CardContent>
        <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h3 className="font-display font-semibold uppercase tracking-tight text-lg text-foreground mb-1.5">{title}</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">{description}</p>
        <Button onClick={onRetry} variant="outline">
          <RotateCw className="w-4 h-4 mr-1.5" strokeWidth={2} aria-hidden="true" />
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}
