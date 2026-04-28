import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

/**
 * Top-level error boundary — catches any render/lifecycle error in the tree
 * and shows a graceful recovery screen instead of crashing the whole app.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console (replace with Sentry/logging service in production)
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', gap: 24,
        background: '#0d0d1a', color: '#e2e8f0', textAlign: 'center',
        padding: '0 24px',
      }}>
        <div style={{ fontSize: 64 }}>♟️</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#ef4444' }}>
          Something went wrong
        </h1>
        <p style={{ color: '#94a3b8', maxWidth: 420, margin: 0 }}>
          An unexpected error occurred. Your game data is safe — please reload to continue.
        </p>
        {this.state.error && (
          <details style={{
            background: '#1c1c2e', border: '1px solid #2a2a40',
            borderRadius: 8, padding: '12px 16px', maxWidth: 520,
            textAlign: 'left', fontSize: 12, color: '#64748b',
          }}>
            <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>Error details</summary>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error.message}
            </pre>
          </details>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: '#6fcf97', color: '#000', fontWeight: 700,
              fontSize: 14, cursor: 'pointer',
            }}
          >
            🔄 Reload
          </button>
          <button
            onClick={this.handleGoHome}
            style={{
              padding: '10px 24px', borderRadius: 8,
              border: '1px solid #2a2a40', background: 'transparent',
              color: '#e2e8f0', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            🏠 Go Home
          </button>
        </div>
      </div>
    );
  }
}
