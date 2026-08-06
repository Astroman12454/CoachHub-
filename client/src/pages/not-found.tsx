import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex items-center mb-4 gap-3">
            <AlertCircle className="h-6 w-6 text-red-500" strokeWidth={1.75} />
            <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">{t("notFound.title")}</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {t("notFound.description")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
