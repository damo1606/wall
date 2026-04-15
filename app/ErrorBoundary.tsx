"use client"

import { Component, type ReactNode } from "react"

type Props = { children: ReactNode; fallback?: string }
type State = { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" }

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err)
    return { hasError: true, message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="text-4xl text-red-400">⚠</div>
            <p className="text-gray-300 font-medium">
              {this.props.fallback ?? "Ocurrió un error inesperado"}
            </p>
            <p className="text-gray-500 text-sm font-mono">{this.state.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
