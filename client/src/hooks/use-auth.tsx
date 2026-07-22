import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, SESSION_QUERY_KEY } from "@/lib/queryClient";

interface SessionResponse {
  authenticated: boolean;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (passcode: string) => Promise<void>;
  isLoggingIn: boolean;
  loginError: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SessionResponse>({
    queryKey: [SESSION_QUERY_KEY],
  });

  const loginMutation = useMutation({
    mutationFn: async (passcode: string) => {
      const res = await apiRequest("POST", "/api/login", { passcode });
      return res.json() as Promise<SessionResponse>;
    },
    onSuccess: (session) => {
      queryClient.setQueryData([SESSION_QUERY_KEY], session);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/logout");
      return res.json() as Promise<SessionResponse>;
    },
    onSuccess: (session) => {
      queryClient.setQueryData([SESSION_QUERY_KEY], session);
      queryClient.clear();
    },
  });

  const value: AuthContextValue = {
    isAuthenticated: !!data?.authenticated,
    isLoading,
    login: async (passcode: string) => {
      await loginMutation.mutateAsync(passcode);
    },
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.isError ? "Passcode incorrecto" : null,
    logout: () => logoutMutation.mutate(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
