// ============================================================
// FLOWER GAME — ERROR BOUNDARY
// Catches React crashes and shows the error for debugging.
// ============================================================

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] React crash:', error);
    console.error('[ErrorBoundary] Stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100%', height: '100%',
          background: '#1a1a2e',
          color: '#fff',
          padding: 40,
          fontFamily: 'Teebai, monospace',
          fontSize: 42,
          overflow: 'auto',
          zIndex: 999999,
        }}>
          <h2 style={{ color: '#e94560' }}>🐛 Game Crashed</h2>
          <p style={{ color: '#888' }}>Please screenshot this and send it:</p>
          <pre style={{
            background: '#0f0f1e',
            padding: 20,
            borderRadius: 8,
            marginTop: 20,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.error?.message || 'Unknown error'}
            {'\n\n'}
            {this.state.error?.stack || ''}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              background: '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 48,
            }}
          >
            Reload Game
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
