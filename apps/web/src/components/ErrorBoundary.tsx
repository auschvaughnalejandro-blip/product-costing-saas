import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time errors anywhere below it so the user sees a clear message
 * and a way to recover — never a blank white screen with the real error hidden
 * in the console.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it for debugging; in a real deployment this would go to a logger.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="card">
            <h1>Something went wrong</h1>
            <p className="muted">
              The page hit an unexpected error and couldn&apos;t finish loading. Your data is safe.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={this.reset}>
                Try again
              </button>
              <button className="btn" onClick={() => window.location.assign('/')}>
                Go to home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
