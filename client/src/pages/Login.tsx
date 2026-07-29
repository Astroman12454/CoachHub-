import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandMark from "@/components/BrandMark";

export default function Login() {
  const { login, isLoggingIn, loginError } = useAuth();
  const [passcode, setPasscode] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    login(passcode).catch(() => {
      // Error state is already surfaced reactively via loginError.
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
            <label htmlFor="passcode" className="block text-sm font-medium text-foreground mb-2">
              Passcode
            </label>
            <Input
              id="passcode"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter your passcode"
              className="focus:border-basketball-orange"
            />
            {loginError && (
              <p className="text-sm text-red-600 mt-2" role="alert">
                {loginError}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoggingIn || !passcode}
            className="w-full basketball-orange basketball-orange-hover text-white"
          >
            {isLoggingIn ? "Logging in..." : "Log In"}
          </Button>
        </form>
      </div>
    </main>
  );
}
