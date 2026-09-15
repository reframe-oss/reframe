"use client";

import React from "react";

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {
        hasError: false,
        error: null,
    };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Unhandled application error:", error, errorInfo);
    }

    handleRetry = () => {
        this.setState({
            hasError: false,
            error: null,
        });
    };

    handleReset = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div
                    role="alert"
                    aria-live="assertive"
                    className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
                >
                    <div className="max-w-md space-y-4">
                        <h2 className="text-3xl font-bold">
                            Something went wrong
                        </h2>

                        <p className="text-sm opacity-80">
                            {this.state.error?.message || "An unexpected error occurred."}
                        </p>

                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={this.handleRetry}
                                className="rounded-lg border px-4 py-2 transition hover:opacity-80"
                                aria-label="Try rendering the application again"
                            >
                                Try Again
                            </button>

                            <button
                                type="button"
                                onClick={this.handleReset}
                                className="rounded-lg border px-4 py-2 transition hover:opacity-80"
                                aria-label="Reload the application"
                            >
                                Reload App
                            </button>

                            <a
                                href="https://github.com/reframe-oss/reframe/issues"
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border px-4 py-2 transition hover:opacity-80"
                                aria-label="Report this issue on GitHub"
                            >
                                Report Issue
                            </a>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;