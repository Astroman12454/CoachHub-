import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, extractErrorMessage, SESSION_QUERY_KEY } from "@/lib/queryClient";

interface InviteInfo {
  email: string;
  ownerEmail: string;
}

// Public — a coach opens this from the invite email before necessarily
// having a Coach Hub account at all. Signup/login happen inline here
// (reusing useAuth's mutations, same as Login.tsx) rather than bouncing
// through the normal login page and back, since there's nowhere for that
// page to remember "come back and accept this invite" afterward.
export default function AcceptInvite() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const { isAuthenticated, login, signup, isLoggingIn, loginError, isSigningUp, signupError } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [password, setPassword] = useState("");

  const inviteQuery = useQuery<InviteInfo>({
    queryKey: [`/api/invites/${token}`],
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invites/${token}/accept`);
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] });
      setLocation("/dashboard");
    },
  });

  // Once logged in (either just now, or already), accept right away — there's
  // nothing else for the visitor to configure first.
  useEffect(() => {
    if (isAuthenticated && token && inviteQuery.data && acceptMutation.isIdle) {
      acceptMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, inviteQuery.data]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inviteQuery.data) return;
    const action = mode === "login"
      ? login(inviteQuery.data.email, password)
      : signup(inviteQuery.data.email, password);
    action.catch(() => {
      // Error state is already surfaced reactively via loginError/signupError.
    });
  };

  const isPending = isLoggingIn || isSigningUp;
  const authError = mode === "login" ? loginError : signupError;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-rail p-4 relative">
      {/* top-[max(...)] reserves space under iOS's black-translucent status
          bar when this app is added to the home screen — see TopBar.tsx. */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm bg-card rounded-lg shadow-2xl p-8 fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground text-center">
            {t("acceptInvite.title")}
          </h1>
        </div>

        {!token || inviteQuery.isError ? (
          <p className="text-sm text-red-600 text-center" role="alert">{t("acceptInvite.invalidInvite")}</p>
        ) : inviteQuery.isLoading ? (
          <p className="text-sm text-muted-foreground text-center">{t("common.loading")}</p>
        ) : acceptMutation.isSuccess ? (
          <p className="text-sm text-foreground text-center" role="status">{t("acceptInvite.joined")}</p>
        ) : acceptMutation.isError ? (
          <div className="space-y-4">
            <p className="text-sm text-red-600 text-center" role="alert">
              {extractErrorMessage(acceptMutation.error) ?? t("acceptInvite.couldntJoin")}
            </p>
            <Link href="/">
              <Button className="w-full basketball-orange basketball-orange-hover text-white">
                {t("login.backToLogIn")}
              </Button>
            </Link>
          </div>
        ) : isAuthenticated ? (
          <p className="text-sm text-muted-foreground text-center">{t("acceptInvite.joining")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground text-center mb-4">
              {t("acceptInvite.invitedBy", { email: inviteQuery.data!.ownerEmail })}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="invite-email" className="block text-sm font-medium text-foreground mb-2">
                  {t("login.email")}
                </label>
                <Input id="invite-email" type="email" value={inviteQuery.data!.email} readOnly disabled />
              </div>
              <div>
                <label htmlFor="invite-password" className="block text-sm font-medium text-foreground mb-2">
                  {t("login.password")}
                </label>
                <Input
                  id="invite-password"
                  type="password"
                  autoFocus
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? t("login.passwordPlaceholderSignup") : t("login.passwordPlaceholderLogin")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:border-basketball-orange"
                />
                {authError && (
                  <p className="text-sm text-red-600 mt-2" role="alert">{authError}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isPending || !password}
                className="w-full basketball-orange basketball-orange-hover text-white"
              >
                {isPending
                  ? (mode === "signup" ? t("login.creatingAccount") : t("login.loggingIn"))
                  : (mode === "signup" ? t("acceptInvite.createAccountAndJoin") : t("acceptInvite.logInAndJoin"))}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              {mode === "signup" ? (
                <>
                  {t("login.alreadyHaveAccount")}{" "}
                  <button type="button" onClick={() => setMode("login")} className="text-basketball-orange underline">
                    {t("login.logInAction")}
                  </button>
                </>
              ) : (
                <>
                  {t("login.newToCoachHub")}{" "}
                  <button type="button" onClick={() => setMode("signup")} className="text-basketball-orange underline">
                    {t("login.createAnAccount")}
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
