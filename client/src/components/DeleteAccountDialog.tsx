import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";
import { useAuth } from "@/hooks/use-auth";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Password re-entry gates this the same way a bank re-asks for a PIN before
// closing an account — it's the one action in the app with no undo. On
// success the session query is cleared (see deleteAccountMutation in
// use-auth.tsx), which flips AuthGate over to the login screen on its own;
// nothing here needs to redirect explicitly.
export default function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { t } = useTranslation();
  const { deleteAccount, isDeletingAccount, deleteAccountError } = useAuth();
  const [password, setPassword] = useState("");

  const restoreFocus = useDialogFocusReturn(open);
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPassword("");
      restoreFocus();
    }
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeletingAccount || !password) return;
    deleteAccount(password).catch(() => {
      // Surfaced reactively below via deleteAccountError — the account is
      // untouched, the dialog just stays open so the coach can retry.
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{t("deleteAccountDialog.title")}</DialogTitle>
          <DialogDescription>{t("deleteAccountDialog.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="delete-account-password">{t("deleteAccountDialog.passwordLabel")}</Label>
            <Input
              id="delete-account-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2"
            />
          </div>
          {deleteAccountError && (
            <p className="text-sm text-red-600" role="alert">{deleteAccountError}</p>
          )}
          <div className="flex items-center justify-end space-x-4 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            {/* Not disabled by isDeletingAccount: disabling the button that
                currently holds focus yanks focus out to <body>, which Radix's
                Dialog reads as a click outside and closes on — right as the
                mutation is in flight, discarding the error before it can
                render. handleSubmit's own isDeletingAccount check already
                blocks a duplicate submit. */}
            <Button type="submit" variant="destructive" disabled={!password}>
              {isDeletingAccount ? t("common.deleting") : t("deleteAccountDialog.confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
