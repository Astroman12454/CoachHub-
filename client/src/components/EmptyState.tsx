import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: string;
  iconWrapperClassName?: string;
  iconClassName?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    icon?: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon,
  iconWrapperClassName = "bg-gray-200 dark:bg-gray-700",
  iconClassName = "text-gray-400 dark:text-gray-500",
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Card className="text-center py-12">
      <CardContent>
        <div className={`w-24 h-24 ${iconWrapperClassName} rounded-full flex items-center justify-center mx-auto mb-4`}>
          <i className={`${icon} ${iconClassName} text-3xl`}></i>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{description}</p>
        {action && (
          <Button
            onClick={action.onClick}
            className="basketball-orange basketball-orange-hover text-white"
          >
            {action.icon && <i className={`${action.icon} mr-2`}></i>}
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
