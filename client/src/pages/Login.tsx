import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";
import { apiRequest, extractErrorMessage } from "@/lib/queryClient";

export default function Login() {
  const { t } = useTranslation();
  const { login, isLoggingIn, loginError, signup, isSigningUp, signupError } = useAuth();
  // A link from outside the app (e.g. the "create your team" CTA on the
  // read-only player/parent portal) can land straight on the signup form
  // instead of making a visitor find and click the toggle themselves.
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(
    () => (new URLSearchParams(window.location.search).get("signup") ? "signup" : "login"),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isPending = isLoggingIn || isSigningUp;
  const error = mode === "login" ? loginError : mode === "signup" ? signupError : null;

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/forgot-password", { email });
      return res.json() as Promise<{ message: string }>;
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "forgot") {
      forgotPasswordMutation.mutate(email);
      return;
    }
    const action = mode === "login" ? login(email, password) : signup(email, password);
    action.catch(() => {
      // Error state is already surfaced reactively via loginError/signupError.
    });
  };

  const switchMode = (next: "login" | "signup" | "forgot") => {
    setMode(next);
    forgotPasswordMutation.reset();
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
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">Coach Hub</h1>
          <p className="text-muted-foreground text-sm">{t("sidebar.tagline")}</p>
        </div>

        {mode === "forgot" && forgotPasswordMutation.isSuccess ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground text-center" role="status">
              {t("login.forgotPasswordSent")}
            </p>
            <Button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full basketball-orange basketball-orange-hover text-white"
            >
              {t("login.backToLogIn")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                {t("login.email")}
              </label>
              <Input
                id="email"
                type="email"
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="focus:border-basketball-orange"
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-sm font-medium text-foreground">
                    {t("login.password")}
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs text-basketball-orange hover:underline"
                    >
                      {t("login.forgotPassword")}
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? t("login.passwordPlaceholderSignup") : t("login.passwordPlaceholderLogin")}
                  className="focus:border-basketball-orange"
                />
              </div>
            )}

            {(error || (mode === "forgot" && forgotPasswordMutation.isError)) && (
              <p className="text-sm text-red-600" role="alert">
                {mode === "forgot" ? (extractErrorMessage(forgotPasswordMutation.error) ?? t("login.forgotPasswordFailed")) : error}
              </p>
            )}

            <Button
              type="submit"
              disabled={mode === "forgot" ? (forgotPasswordMutation.isPending || !email) : (isPending || !email || !password)}
              className="w-full basketball-orange basketball-orange-hover text-white"
            >
              {mode === "forgot"
                ? (forgotPasswordMutation.isPending ? t("login.sendingResetLink") : t("login.sendResetLink"))
                : isPending
                ? (mode === "login" ? t("login.loggingIn") : t("login.creatingAccount"))
                : (mode === "login" ? t("login.logIn") : t("login.createAccount"))}
            </Button>
          </form>
        )}

        {mode !== "forgot" && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === "login" ? t("login.newToCoachHub") : t("login.alreadyHaveAccount")}{" "}
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "signup" : "login")}
              className="text-basketball-orange font-medium hover:underline"
            >
              {mode === "login" ? t("login.createAnAccount") : t("login.logInAction")}
            </button>
          </p>
        )}

        {mode === "forgot" && !forgotPasswordMutation.isSuccess && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-basketball-orange font-medium hover:underline"
            >
              {t("login.backToLogIn")}
            </button>
          </p>
        )}

        {mode === "signup" && (
          <p className="text-center text-xs text-muted-foreground mt-3">
            {t("login.agreeToTermsPrefix")}{" "}
            {/* underline, not hover:underline: a link inline with body text
                needs a non-color cue at rest, not just on hover — color
                alone fails WCAG 1.4.1 for anyone who can't distinguish the
                orange from the surrounding gray. */}
            <Link href="/terms" className="text-basketball-orange underline">
              {t("login.termsOfUse")}
            </Link>{" "}
            {t("login.and")}{" "}
            <Link href="/privacy" className="text-basketball-orange underline">
              {t("login.privacyPolicy")}
            </Link>
            .
          </p>
        )}
      </div>

      {/* text-rail-muted, not text-muted-foreground: this sits directly on
          bg-rail (near-black) rather than the white card above, and
          muted-foreground is tuned for a light surface — same token bug
          Sidebar.tsx already avoids by using the rail-* set throughout. */}
      <p className="text-center text-xs text-rail-muted mt-4">
        <Link href="/privacy" className="hover:text-rail-foreground hover:underline">
          {t("login.privacyPolicy")}
        </Link>
        {" · "}
        <Link href="/terms" className="hover:text-rail-foreground hover:underline">
          {t("login.termsOfUse")}
        </Link>
        {" · "}
        <Link href="/support" className="hover:text-rail-foreground hover:underline">
          {t("login.support")}
        </Link>
      </p>
    </main>
  );
}
