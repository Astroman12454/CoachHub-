import { useState } from "react";
import { Wand2, Loader2, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { startCheckout } from "@/lib/billing";
import { useAuth } from "@/hooks/use-auth";
import { canGenerateAiSessionPlan } from "@shared/entitlements";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TrainingSession } from "@shared/schema";

type ParsedCommand =
  | { action: "create_session"; name: string | null; date: string; time: string | null; duration: number | null }
  | { action: "duplicate_session"; sourceSessionId: number; date: string }
  | { action: "unrecognized" };

interface CommandBarProps {
  sessions: TrainingSession[];
  onCreateSession: (prefill: { name?: string | null; date?: string; time?: string | null; duration?: number | null }) => void;
  onDuplicateSession: (source: TrainingSession, date: string) => void;
}

// A single-line shortcut for the two scheduling requests a coach types most
// — "create a session tomorrow at 6" and "repeat Tuesday's practice" —
// instead of navigating to a form and filling every field by hand. Never
// saves anything on its own: a parsed command just opens SessionModal
// prefilled, so the coach still reviews and hits Save.
export default function CommandBar({ sessions, onCreateSession, onDuplicateSession }: CommandBarProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { account } = useAuth();
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canUseCommands = canGenerateAiSessionPlan(account?.plan ?? "free");
  // The full two-example placeholder reads fine on desktop but gets cut
  // off mid-word on a phone-width input with no ellipsis (native
  // placeholder text doesn't reliably ellipsize) — a shorter, single
  // example fits cleanly instead.
  const isMobile = useIsMobile();
  const placeholder = isMobile ? t("commandBar.placeholderShort") : t("commandBar.placeholder");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isSubmitting) return;

    if (!canUseCommands) {
      toast({
        title: t("commandBar.freePlan"),
        description: t("commandBar.upgradeToUse"),
        action: (
          <ToastAction altText={t("sessionModal.upgrade")} onClick={() => startCheckout()}>
            {t("sessionModal.upgrade")}
          </ToastAction>
        ),
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/ai/parse-command", { text: text.trim() });
      const parsed = (await res.json()) as ParsedCommand;

      if (parsed.action === "create_session") {
        onCreateSession({ name: parsed.name, date: parsed.date, time: parsed.time, duration: parsed.duration });
        setText("");
      } else if (parsed.action === "duplicate_session") {
        const source = sessions.find((s) => s.id === parsed.sourceSessionId);
        if (source) {
          onDuplicateSession(source, parsed.date);
          setText("");
        } else {
          toast({ title: t("commandBar.couldntUnderstand"), description: t("commandBar.tryRephrasing") });
        }
      } else {
        toast({ title: t("commandBar.couldntUnderstand"), description: t("commandBar.tryRephrasing") });
      }
    } catch (error) {
      toast({
        title: t("commandBar.couldntUnderstand"),
        description: extractErrorMessage(error) ?? t("commandBar.tryRephrasing"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Wand2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" strokeWidth={1.75} aria-hidden="true" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={t("commandBar.placeholder")}
          className="pl-9 truncate"
          disabled={isSubmitting}
        />
      </div>
      {!canUseCommands && <Badge variant="secondary" className="flex-shrink-0 text-xs">{t("sessionModal.paid")}</Badge>}
      <Button type="submit" size="icon" variant="outline" disabled={!text.trim() || isSubmitting} aria-label={t("commandBar.submit")}>
        {isSubmitting
          ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          : <ArrowRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
      </Button>
    </form>
  );
}
