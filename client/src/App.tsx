import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { ThemeProvider } from "next-themes";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Login from "@/pages/Login";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Support from "@/pages/Support";
import Pricing from "@/pages/Pricing";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

// Each page ships as its own chunk instead of all five bundling into the
// initial download, so a cold load only pays for the page that's actually
// shown — the rest fetch on first visit and are cached after that.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const TrainingSessions = lazy(() => import("@/pages/TrainingSessions"));
const TrainingMode = lazy(() => import("@/pages/TrainingMode"));
const Games = lazy(() => import("@/pages/Games"));
const Playbook = lazy(() => import("@/pages/Playbook"));
const PlayEditor = lazy(() => import("@/pages/PlayEditor"));
const ExerciseLibrary = lazy(() => import("@/pages/ExerciseLibrary"));
const PhysicalTests = lazy(() => import("@/pages/PhysicalTests"));
const Players = lazy(() => import("@/pages/Players"));
const PlayerProfile = lazy(() => import("@/pages/PlayerProfile"));
const WeeklySchedule = lazy(() => import("@/pages/WeeklySchedule"));
const BillingStatus = lazy(() => import("@/pages/BillingStatus"));
const Portal = lazy(() => import("@/pages/Portal"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));
const CoachSettings = lazy(() => import("@/pages/CoachSettings"));

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-4 border-muted border-t-basketball-orange rounded-full animate-spin"></div>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background">
        <Sidebar />
        {/* Layout itself remounts on every route change (each route maps to
            a distinct component reference), so a plain entrance animation
            here already fires once per navigation — no location-tracking
            needed for a page that "arrives" instead of just appearing. */}
        <div className="flex-1 overflow-hidden fade-in">
          <ErrorBoundary>
            <Suspense fallback={<PageLoadingFallback />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Layout><Dashboard /></Layout>} />
      <Route path="/dashboard" component={() => <Layout><Dashboard /></Layout>} />
      <Route path="/training-sessions" component={() => <Layout><TrainingSessions /></Layout>} />
      {/* Deliberately outside <Layout> — no sidebar, no chrome. A coach
          running a practice needs the full screen for the timer, not a
          nav rail eating a fifth of it. */}
      <Route
        path="/training-sessions/:id/live"
        component={() => (
          <ErrorBoundary>
            <Suspense fallback={<PageLoadingFallback />}>
              <TrainingMode />
            </Suspense>
          </ErrorBoundary>
        )}
      />
      <Route path="/games" component={() => <Layout><Games /></Layout>} />
      <Route path="/playbook" component={() => <Layout><Playbook /></Layout>} />
      <Route path="/playbook/:id" component={() => <Layout><PlayEditor /></Layout>} />
      <Route path="/exercise-library" component={() => <Layout><ExerciseLibrary /></Layout>} />
      <Route path="/physical-tests" component={() => <Layout><PhysicalTests /></Layout>} />
      <Route path="/players" component={() => <Layout><Players /></Layout>} />
      <Route path="/players/:id" component={() => <Layout><PlayerProfile /></Layout>} />
      <Route path="/weekly-schedule" component={() => <Layout><WeeklySchedule /></Layout>} />
      <Route path="/settings/coaches" component={() => <Layout><CoachSettings /></Layout>} />
      <Route path="/billing/success" component={() => <Layout><BillingStatus status="success" /></Layout>} />
      <Route path="/billing/cancel" component={() => <Layout><BillingStatus status="cancel" /></Layout>} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-muted border-t-basketball-orange rounded-full animate-spin"></div>
      </div>
    );
  }

  return isAuthenticated ? <Router /> : <Login />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              {/* Privacy/Terms/Support/Portal must be reachable with no
                  session at all — app store reviewers, logged-out users,
                  and a player/parent with a shared portal link all need
                  them — so they're matched here, ahead of AuthGate's
                  login/loading gate. */}
              <Switch>
                <Route path="/privacy" component={Privacy} />
                <Route path="/terms" component={Terms} />
                <Route path="/support" component={Support} />
                <Route path="/pricing" component={Pricing} />
                <Route
                  path="/reset-password"
                  component={() => (
                    <Suspense fallback={<PageLoadingFallback />}>
                      <ResetPassword />
                    </Suspense>
                  )}
                />
                <Route
                  path="/accept-invite"
                  component={() => (
                    <Suspense fallback={<PageLoadingFallback />}>
                      <AcceptInvite />
                    </Suspense>
                  )}
                />
                <Route
                  path="/portal/:token"
                  component={() => (
                    <Suspense fallback={<PageLoadingFallback />}>
                      <Portal />
                    </Suspense>
                  )}
                />
                <Route component={AuthGate} />
              </Switch>
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
