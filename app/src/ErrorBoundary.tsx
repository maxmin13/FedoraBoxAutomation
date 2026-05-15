import { Component } from 'react'

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    window.electronAPI.logError(error.message, info.componentStack ?? '')
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-red-400">
          <p className="font-semibold">Something went wrong.</p>
          <p className="text-sm mt-1 text-zinc-400">
            The error has been logged. Restart the app to continue.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
