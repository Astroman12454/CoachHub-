import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Check, Link2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";
import type { Player } from "@shared/schema";

interface PlayerPortalDialogProps {
  player: Player | null;
  onOpenChange: (open: boolean) => void;
}

// A share link the coach hands to a player/parent — read-only, no account
// needed on their end (see server's /api/portal/:token). Generates (or
// reuses) the link the moment the dialog opens, since there's nothing else
// to configure first.
export default function PlayerPortalDialog({ player, onOpenChange }: PlayerPortalDialogProps) {
  const open = !!player;
  const restoreFocus = useDialogFocusReturn(open);
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const linkMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const res = await apiRequest("POST", `/api/players/${playerId}/portal-link`);
      return (await res.json()) as { token: string };
    },
    onSuccess: (data) => {
      setUrl(`${window.location.origin}/portal/${data.token}`);
    },
    onError: (error) => {
      toast({ title: "Couldn't create link", description: extractErrorMessage(error) ?? "Try again.", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (playerId: number) => apiRequest("DELETE", `/api/players/${playerId}/portal-link`),
    onSuccess: () => {
      setUrl(null);
      setCopied(false);
      toast({ title: "Link revoked", description: "The old link no longer works. You can generate a new one anytime." });
    },
    onError: (error) => {
      toast({ title: "Couldn't revoke link", description: extractErrorMessage(error) ?? "Try again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (player) {
      setUrl(null);
      setCopied(false);
      linkMutation.mutate(player.id);
    }
    // Only re-run when the dialog is opened for a (possibly different) player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  const handleOpenChange = (next: boolean) => {
    if (!next) restoreFocus();
    onOpenChange(next);
  };

  const copyLink = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Copied", description: "Portal link copied to clipboard." });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight flex items-center gap-2">
            <Link2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            Portal Link
          </DialogTitle>
          <DialogDescription>
            Share this read-only link with {player?.name}'s parent or the player. It shows upcoming
            practices, games, attendance, and stats — no access to your coach dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={linkMutation.isPending ? "Generating…" : url ?? ""}
            readOnly
            aria-label="Portal link"
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" size="icon" variant="outline" onClick={copyLink} disabled={!url} aria-label="Copy link">
            {copied ? <Check className="w-4 h-4" strokeWidth={2} aria-hidden="true" /> : <Copy className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
          </Button>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-red-700 hover:text-red-800 dark:hover:text-red-400"
            onClick={() => player && revokeMutation.mutate(player.id)}
            disabled={!url || revokeMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1.5" strokeWidth={1.75} aria-hidden="true" />
            Revoke Link
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
