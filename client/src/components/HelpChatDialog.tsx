import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Loader2, Send, Sparkles, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import { startCheckout } from "@/lib/billing";
import { canUseAiHelp } from "@shared/entitlements";

interface HelpMessage {
  role: "user" | "assistant";
  content: string;
}

// Matches the server's own cap (see helpChatSchema in server/routes.ts) —
// trimming here too means a very long conversation degrades gracefully
// (the model just loses early context) instead of the send button
// starting to fail outright once the history grows past what the server
// will accept.
const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 2000;

interface HelpChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// A conversational "how do I..." helper, answered by the same model behind
// the AI practice-plan generator — see server/ai-help.ts for what it's
// told about the app. Stateless client-side too: closing the dialog drops
// the conversation, so reopening always starts fresh (no chat history to
// manage, load, or let grow stale as the app changes).
export default function HelpChatDialog({ open, onOpenChange }: HelpChatDialogProps) {
  const { t } = useTranslation();
  const { account } = useAuth();
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      restoreFocus();
      setMessages([]);
      setDraft("");
      setErrorMessage(null);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const canUse = account ? canUseAiHelp(account.plan) : false;

  const askMutation = useMutation({
    mutationFn: async (nextMessages: HelpMessage[]) => {
      const res = await apiRequest("POST", "/api/ai/help-chat", { messages: nextMessages.slice(-MAX_HISTORY) });
      return res.json() as Promise<{ reply: string }>;
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(extractErrorMessage(error) ?? t("common.tryAgain"));
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || askMutation.isPending) return;
    const nextMessages: HelpMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setDraft("");
    setErrorMessage(null);
    askMutation.mutate(nextMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight flex items-center gap-2">
            <Bot className="w-5 h-5 text-basketball-orange" strokeWidth={1.75} aria-hidden="true" />
            {t("helpChat.title")}
          </DialogTitle>
          <DialogDescription>{t("helpChat.description")}</DialogDescription>
        </DialogHeader>

        {!canUse ? (
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <Sparkles className="w-8 h-8 text-basketball-orange" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("helpChat.upgradeRequired")}</p>
            <Button type="button" onClick={() => startCheckout()} className="basketball-orange basketball-orange-hover text-white">
              {t("sessionModal.upgrade")}
            </Button>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-2 min-h-[240px]">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("helpChat.emptyState")}</p>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center mt-0.5 ${m.role === "user" ? "bg-muted" : "basketball-orange"}`}>
                      {m.role === "user"
                        ? <UserIcon className="w-3 h-3 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
                        : <Bot className="w-3 h-3 text-white" strokeWidth={2} aria-hidden="true" />}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.role === "user" ? "basketball-orange text-white" : "bg-muted text-foreground"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {askMutation.isPending && (
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 flex-shrink-0 rounded-full basketball-orange flex items-center justify-center mt-0.5">
                    <Bot className="w-3 h-3 text-white" strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    {t("helpChat.thinking")}
                  </div>
                </div>
              )}
            </div>

            {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}

            <form onSubmit={handleSend} className="flex items-end gap-2 pt-2 border-t border-border">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                onKeyDown={handleKeyDown}
                placeholder={t("helpChat.placeholder")}
                aria-label={t("helpChat.placeholder")}
                rows={1}
                className="resize-none min-h-[2.5rem]"
                disabled={askMutation.isPending}
              />
              <Button
                type="submit"
                size="icon"
                className="flex-shrink-0 basketball-orange basketball-orange-hover text-white"
                disabled={!draft.trim() || askMutation.isPending}
                aria-label={t("helpChat.send")}
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
