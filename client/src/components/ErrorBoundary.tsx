import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import i18n from "@/i18n";
import { captureException } from "@/lib/monitoring";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// React only offers this via a class component (no hook equivalent as of
// React 18) — without it, any render error anywhere in the tree unmounts
// the whole app to a blank white screen with nothing in the UI explaining
// why, which is a rough failure mode on a phone with no console to check.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in component tree:", error, info.componentStack);
    captureException(error, info.componentStack ?? undefined);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2 className="font-display uppercase tracking-tight text-lg text-foreground mb-2">{i18n.t("errorBoundary.title")}</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            {i18n.t("errorBoundary.description")}
          </p>
          <Button onClick={this.handleReload} className="basketball-orange basketball-orange-hover text-white">
            {i18n.t("errorBoundary.reload")}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
