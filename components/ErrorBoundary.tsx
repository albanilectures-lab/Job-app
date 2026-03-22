"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle size={40} className="text-red-400 mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-4 max-w-md">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="inline-flex items-center gap-2 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
