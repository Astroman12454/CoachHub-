import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

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
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <i className="fas fa-triangle-exclamation text-red-500 text-2xl" aria-hidden="true"></i>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
            This page ran into an unexpected error. Reloading usually fixes it.
          </p>
          <Button onClick={this.handleReload} className="basketball-orange basketball-orange-hover text-white">
            Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
