import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="min-h-screen flex items-center justify-center basketball-orange basketball-pattern p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 bounce-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 basketball-orange rounded-2xl flex items-center justify-center shadow-lg mb-4 pulse-orange">
            <i className="fas fa-basketball-ball text-white text-2xl"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Coach Hub</h1>
          <p className="text-gray-600 text-sm">Basketball Training</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="passcode" className="block text-sm font-medium text-gray-700 mb-2">
              Passcode
            </label>
            <Input
              id="passcode"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Ingresá el passcode"
              className="border-2 border-orange-200 focus:border-basketball-orange"
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
            {isLoggingIn ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
