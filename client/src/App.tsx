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
import BottomTabBar from "@/components/BottomTabBar";
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
const CommunityPlays = lazy(() => import("@/pages/CommunityPlays"));
const PlayEditor = lazy(() => import("@/pages/PlayEditor"));
const ExerciseLibrary = lazy(() => import("@/pages/ExerciseLibrary"));
const CommunityExercises = lazy(() => import("@/pages/CommunityExercises"));
const CoachProfile = lazy(() => import("@/pages/CoachProfile"));
const ExerciseDiagramEditor = lazy(() => import("@/pages/ExerciseDiagramEditor"));
const Evaluations = lazy(() => import("@/pages/Evaluations"));
const CommunityEvaluations = lazy(() => import("@/pages/CommunityEvaluations"));
const Players = lazy(() => import("@/pages/Players"));
const PlayerProfile = lazy(() => import("@/pages/PlayerProfile"));
const WeeklySchedule = lazy(() => import("@/pages/WeeklySchedule"));
const BillingStatus = lazy(() => import("@/pages/BillingStatus"));
const Portal = lazy(() => import("@/pages/Portal"));
const SeasonSummary = lazy(() => import("@/pages/SeasonSummary"));
const ExerciseShare = lazy(() => import("@/pages/ExerciseShare"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));
const GuardianAuthorization = lazy(() => import("@/pages/GuardianAuthorization"));
const CoachSettings = lazy(() => import("@/pages/CoachSettings"));
const AccountSettings = lazy(() => import("@/pages/AccountSettings"));
const AdminReports = lazy(() => import("@/pages/AdminReports"));
const ClubOverview = lazy(() => import("@/pages/ClubOverview"));

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-4 border-muted border-t-basketball-orange rounded-full animate-spin"></div>
    </div>
  );
}

// Wraps a page component for use as a wouter <Route component={...}>. Must
// be called at module scope, not inline inside Router()'s JSX: wouter treats
// a changed `component` function reference as a changed component *type* and
// remounts that whole subtree from scratch — so an inline `component={() =>
// <Layout><X /></Layout>}` gets a fresh closure (and therefore a full
// Layout+page remount, wiping any local state like an open dialog) on every
// single re-render of Router, not just on actual navigation. A name defined
// once up here stays the same reference across renders, so React just
// updates the existing instance like normal.
function withLayout<P extends object>(PageComponent: React.ComponentType<P>) {
  return function RouteWithLayout(props: P) {
    return (
      <Layout>
        <PageComponent {...props} />
      </Layout>
    );
  };
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background">
        <Sidebar />
        {/* A column, not a bare div: BottomTabBar (mobile-only) takes its
            natural height as a normal flex sibling below the page content,
            so the content area shrinks to fit above it automatically —
            no fixed positioning, no manually-tuned bottom padding to keep
            in sync with the bar's height. */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Layout remounts on an actual route change (each route maps to
              its own stable component reference — see withLayout above), so
              a plain entrance animation here already fires once per real
              navigation and stays put across unrelated re-renders — no
              location-tracking needed for a page that "arrives" instead of
              just appearing. */}
          <div className="flex-1 overflow-hidden fade-in">
            <ErrorBoundary>
              <Suspense fallback={<PageLoadingFallback />}>
                {children}
              </Suspense>
            </ErrorBoundary>
          </div>
          <BottomTabBar />
        </div>
      </div>
    </SidebarProvider>
  );
}

const DashboardRoute = withLayout(Dashboard);
const TrainingSessionsRoute = withLayout(TrainingSessions);
const GamesRoute = withLayout(Games);
const PlaybookRoute = withLayout(Playbook);
const CommunityPlaysRoute = withLayout(CommunityPlays);
const PlayEditorRoute = withLayout(PlayEditor);
const ExerciseLibraryRoute = withLayout(ExerciseLibrary);
const CommunityExercisesRoute = withLayout(CommunityExercises);
const CoachProfileRoute = withLayout(CoachProfile);
const ExerciseDiagramEditorRoute = withLayout(ExerciseDiagramEditor);
const EvaluationsRoute = withLayout(Evaluations);
const CommunityEvaluationsRoute = withLayout(CommunityEvaluations);
const PlayersRoute = withLayout(Players);
const PlayerProfileRoute = withLayout(PlayerProfile);
const WeeklyScheduleRoute = withLayout(WeeklySchedule);
const CoachSettingsRoute = withLayout(CoachSettings);
const AccountSettingsRoute = withLayout(AccountSettings);
const AdminReportsRoute = withLayout(AdminReports);
const ClubOverviewRoute = withLayout(ClubOverview);
// BillingStatus takes a fixed `status` prop per route rather than one read
// from the URL, so it gets its own two stable wrappers instead of routing
// through withLayout's generic prop passthrough.
const BillingSuccessRoute = () => <Layout><BillingStatus status="success" /></Layout>;
const BillingCancelRoute = () => <Layout><BillingStatus status="cancel" /></Layout>;
// Deliberately outside <Layout> — no sidebar, no chrome. A coach running a
// practice needs the full screen for the timer, not a nav rail eating a
// fifth of it.
const TrainingModeRoute = () => (
  <ErrorBoundary>
    <Suspense fallback={<PageLoadingFallback />}>
      <TrainingMode />
    </Suspense>
  </ErrorBoundary>
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardRoute} />
      <Route path="/dashboard" component={DashboardRoute} />
      <Route path="/training-sessions" component={TrainingSessionsRoute} />
      <Route path="/training-sessions/:id/live" component={TrainingModeRoute} />
      <Route path="/games" component={GamesRoute} />
      <Route path="/playbook" component={PlaybookRoute} />
      <Route path="/playbook/community" component={CommunityPlaysRoute} />
      <Route path="/playbook/:id" component={PlayEditorRoute} />
      <Route path="/exercise-library" component={ExerciseLibraryRoute} />
      <Route path="/exercise-library/community" component={CommunityExercisesRoute} />
      <Route path="/coaches/:accountId" component={CoachProfileRoute} />
      <Route path="/exercise-library/:id/diagram" component={ExerciseDiagramEditorRoute} />
      <Route path="/evaluations" component={EvaluationsRoute} />
      <Route path="/evaluations/community" component={CommunityEvaluationsRoute} />
      <Route path="/players" component={PlayersRoute} />
      <Route path="/players/:id" component={PlayerProfileRoute} />
      <Route path="/weekly-schedule" component={WeeklyScheduleRoute} />
      <Route path="/club" component={ClubOverviewRoute} />
      <Route path="/settings/coaches" component={CoachSettingsRoute} />
      <Route path="/settings/account" component={AccountSettingsRoute} />
      <Route path="/admin/reports" component={AdminReportsRoute} />
      <Route path="/billing/success" component={BillingSuccessRoute} />
      <Route path="/billing/cancel" component={BillingCancelRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Same reasoning as TrainingModeRoute/withLayout above: a stable reference
// per lazy public page, not an inline closure recreated on every render of
// App (which AuthProvider's own state changes cause plenty of).
const ResetPasswordRoute = () => (
  <Suspense fallback={<PageLoadingFallback />}>
    <ResetPassword />
  </Suspense>
);
const AcceptInviteRoute = () => (
  <Suspense fallback={<PageLoadingFallback />}>
    <AcceptInvite />
  </Suspense>
);
const GuardianAuthorizationRoute = () => (
  <Suspense fallback={<PageLoadingFallback />}>
    <GuardianAuthorization />
  </Suspense>
);
const PortalRoute = () => (
  <Suspense fallback={<PageLoadingFallback />}>
    <Portal />
  </Suspense>
);
const SeasonSummaryRoute = () => (
  <Suspense fallback={<PageLoadingFallback />}>
    <SeasonSummary />
  </Suspense>
);
const ExerciseShareRoute = () => (
  <Suspense fallback={<PageLoadingFallback />}>
    <ExerciseShare />
  </Suspense>
);

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
                <Route path="/reset-password" component={ResetPasswordRoute} />
                <Route path="/accept-invite" component={AcceptInviteRoute} />
                <Route path="/guardian-authorization/:token" component={GuardianAuthorizationRoute} />
                <Route path="/portal/:token" component={PortalRoute} />
                <Route path="/portal/:token/summary" component={SeasonSummaryRoute} />
                <Route path="/exercise/:token" component={ExerciseShareRoute} />
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
