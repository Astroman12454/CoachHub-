import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { apiRequest, extractErrorMessage, SESSION_QUERY_KEY } from "@/lib/queryClient";
import { applyTeamTheme } from "@/lib/teamTheme";
import type { Team, Plan } from "@shared/schema";

interface AccountInfo {
  id: number;
  email: string;
  plan: Plan;
  // True when this login accepted a Club invite — every team/exercise/plan
  // check already resolves to the club owner's account server-side, but the
  // client still needs this to know whether to show billing/coach-
  // management actions (owner-only) versus a "managed by" note.
  isClubMember: boolean;
  ownerEmail?: string;
}

interface SessionResponse {
  authenticated: boolean;
  account?: AccountInfo;
  teams?: Team[];
  currentTeamId?: number;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  account: AccountInfo | null;
  teams: Team[];
  currentTeamId: number | null;
  signup: (email: string, password: string) => Promise<void>;
  isSigningUp: boolean;
  signupError: string | null;
  login: (email: string, password: string) => Promise<void>;
  isLoggingIn: boolean;
  loginError: string | null;
  logout: () => void;
  switchTeam: (teamId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();

  const { data, isLoading } = useQuery<SessionResponse>({
    queryKey: [SESSION_QUERY_KEY],
  });

  const currentTeam = data?.teams?.find((team) => team.id === data.currentTeamId);
  useEffect(() => {
    applyTeamTheme(currentTeam?.themeColor, resolvedTheme === "dark");
  }, [currentTeam?.themeColor, resolvedTheme]);

  const signupMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/signup", { email, password });
      return res.json() as Promise<SessionResponse>;
    },
    onSuccess: (session) => {
      queryClient.setQueryData([SESSION_QUERY_KEY], session);
    },
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/login", { email, password });
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

  const switchTeamMutation = useMutation({
    mutationFn: async (teamId: number) => {
      const res = await apiRequest("PUT", "/api/session/team", { teamId });
      return res.json() as Promise<SessionResponse>;
    },
    onSuccess: (session) => {
      queryClient.setQueryData([SESSION_QUERY_KEY], session);
      // Every team-scoped query (players, sessions, attendance, stats) is
      // now stale for the newly-selected team.
      queryClient.invalidateQueries();
    },
  });

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated: !!data?.authenticated,
    isLoading,
    account: data?.account ?? null,
    teams: data?.teams ?? [],
    currentTeamId: data?.currentTeamId ?? null,
    signup: async (email: string, password: string) => {
      await signupMutation.mutateAsync({ email, password });
    },
    isSigningUp: signupMutation.isPending,
    signupError: signupMutation.isError ? (extractErrorMessage(signupMutation.error) ?? "Couldn't create account") : null,
    login: async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.isError ? (extractErrorMessage(loginMutation.error) ?? "Incorrect email or password") : null,
    logout: () => logoutMutation.mutate(),
    switchTeam: async (teamId: number) => {
      await switchTeamMutation.mutateAsync(teamId);
    },
  }), [
    data,
    isLoading,
    signupMutation.isPending,
    signupMutation.isError,
    signupMutation.error,
    signupMutation.mutateAsync,
    loginMutation.isPending,
    loginMutation.isError,
    loginMutation.error,
    loginMutation.mutateAsync,
    logoutMutation.mutate,
    switchTeamMutation.mutateAsync,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
