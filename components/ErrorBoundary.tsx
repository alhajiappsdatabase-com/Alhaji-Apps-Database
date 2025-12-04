import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card } from './ui';

interface ErrorBoundaryProps {
    children?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
                    <Card className="max-w-md w-full text-center">
                        <div className="mb-4 text-red-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Something went wrong</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">
                            An unexpected error occurred. We've logged the issue. Please try reloading the page.
                        </p>
                        {this.state.error && (
                            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded text-xs text-left font-mono text-red-600 mb-6 overflow-auto max-h-32">
                                {this.state.error instanceof Error 
                                    ? this.state.error.toString() 
                                    : typeof this.state.error === 'object' 
                                        ? JSON.stringify(this.state.error, null, 2)
                                        : String(this.state.error)
                                }
                            </div>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
                        >
                            Reload Application
                        </button>
                    </Card>
                </div>
            );
        }

        return (this as any).props.children;
    }
}