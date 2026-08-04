import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandMark from "@/components/BrandMark";

export default function Login() {
  const { login, isLoggingIn, loginError, signup, isSigningUp, signupError } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isPending = isLoggingIn || isSigningUp;
  const error = mode === "login" ? loginError : signupError;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const action = mode === "login" ? login(email, password) : signup(email, password);
    action.catch(() => {
      // Error state is already surfaced reactively via loginError/signupError.
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-rail p-4">
      <div className="w-full max-w-sm bg-card rounded-lg shadow-2xl p-8 fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">Coach Hub</h1>
          <p className="text-muted-foreground text-sm">Basketball Training</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email
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

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              className="focus:border-basketball-orange"
            />
            {error && (
              <p className="text-sm text-red-600 mt-2" role="alert">
                {error}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isPending || !email || !password}
            className="w-full basketball-orange basketball-orange-hover text-white"
          >
            {isPending
              ? (mode === "login" ? "Logging in..." : "Creating account...")
              : (mode === "login" ? "Log In" : "Create Account")}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {mode === "login" ? "New to Coach Hub?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-basketball-orange font-medium hover:underline"
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </div>
    </main>
  );
}
