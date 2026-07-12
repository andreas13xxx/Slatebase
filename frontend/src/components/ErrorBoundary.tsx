import { Component, type ReactNode, type ErrorInfo } from 'react'
import './ErrorBoundary.css'

/**
 * Props for the ErrorBoundary component.
 */
export interface ErrorBoundaryProps {
  /** Content to render when no error has occurred. */
  children: ReactNode
  /** Optional custom fallback UI. Defaults to a generic error message. */
  fallback?: ReactNode
  /** Optional callback invoked when an error is caught. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

/**
 * State for the ErrorBoundary component.
 */
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * React Error Boundary that catches render errors in its subtree
 * and displays a fallback UI instead of crashing the entire app.
 *
 * Wrap around risky components (GraphView, CanvasView, TabContent)
 * to isolate failures and keep the rest of the UI functional.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo)
  }

  /** Resets the error state so children can re-render. */
  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="error-boundary-fallback" role="alert">
          <div className="error-boundary-content">
            <h3 className="error-boundary-title">Etwas ist schiefgelaufen</h3>
            <p className="error-boundary-message">
              {this.state.error?.message ?? 'Ein unerwarteter Fehler ist aufgetreten.'}
            </p>
            <button
              className="error-boundary-reset"
              onClick={this.handleReset}
              type="button"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
