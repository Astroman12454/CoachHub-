import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import TrainingSessions from "@/pages/TrainingSessions";
import ExerciseLibrary from "@/pages/ExerciseLibrary";
import Players from "@/pages/Players";
import WeeklySchedule from "@/pages/WeeklySchedule";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/Sidebar";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 overflow-hidden">
          {children}
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
      <Route path="/exercise-library" component={() => <Layout><ExerciseLibrary /></Layout>} />
      <Route path="/players" component={() => <Layout><Players /></Layout>} />
      <Route path="/weekly-schedule" component={() => <Layout><WeeklySchedule /></Layout>} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-[hsl(16,100%,60%)] rounded-full animate-spin"></div>
      </div>
    );
  }

  return isAuthenticated ? <Router /> : <Login />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AuthGate />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
