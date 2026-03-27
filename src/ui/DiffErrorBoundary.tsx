import { Component, type ReactNode } from "react";

interface DiffErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface DiffErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class DiffErrorBoundary extends Component<DiffErrorBoundaryProps, DiffErrorBoundaryState> {
  state: DiffErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): DiffErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: DiffErrorBoundaryProps) {
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <>
          {this.props.fallback}
          <pre style={{ padding: "1rem", color: "#f85149", fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
            {this.state.error?.message}
            {"\n"}
            {this.state.error?.stack}
          </pre>
        </>
      );
    }

    return this.props.children;
  }
}
