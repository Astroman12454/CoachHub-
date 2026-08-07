import { useState, useMemo, type FormEvent } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";

export default function ResetPassword() {
  const { t } = useTranslation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [password, setPassword] = useState("");

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reset-password", { token, password });
      return res.json() as Promise<{ message: string }>;
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (resetMutation.isPending || !password) return;
    resetMutation.mutate();
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-rail p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm bg-card rounded-lg shadow-2xl p-8 fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">{t("resetPassword.title")}</h1>
        </div>

        {!token ? (
          <p className="text-sm text-red-600 text-center" role="alert">{t("resetPassword.missingToken")}</p>
        ) : resetMutation.isSuccess ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground text-center" role="status">{t("resetPassword.success")}</p>
            <Link href="/">
              <Button className="w-full basketball-orange basketball-orange-hover text-white">
                {t("login.backToLogIn")}
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-foreground mb-2">
                {t("resetPassword.newPassword")}
              </label>
              <Input
                id="new-password"
                type="password"
                autoFocus
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="focus:border-basketball-orange"
              />
              {resetMutation.isError && (
                <p className="text-sm text-red-600 mt-2" role="alert">
                  {extractErrorMessage(resetMutation.error) ?? t("resetPassword.failed")}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={resetMutation.isPending || !password}
              className="w-full basketball-orange basketball-orange-hover text-white"
            >
              {resetMutation.isPending ? t("resetPassword.saving") : t("resetPassword.save")}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
