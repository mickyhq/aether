import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type WeatherErrorBoundaryProps = {
  area: 'map' | 'forecast'
  children: ReactNode
  resetKey: string
}

type WeatherErrorBoundaryState = {
  hasError: boolean
}

export class WeatherErrorBoundary extends Component<
  WeatherErrorBoundaryProps,
  WeatherErrorBoundaryState
> {
  state: WeatherErrorBoundaryState = {
    hasError: false
  }

  static getDerivedStateFromError(): WeatherErrorBoundaryState {
    return {
      hasError: true
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aether rendering error', {
      area: this.props.area,
      error,
      componentStack: info.componentStack
    })
  }

  componentDidUpdate(previousProps: WeatherErrorBoundaryProps) {
    if (
      this.state.hasError &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const isMap = this.props.area === 'map'

    return (
      <div
        className={isMap
          ? 'render-error render-error-map'
          : 'weather-panel render-error'
        }
        role="alert"
      >
        <strong>{isMap ? 'Map could not render' : 'Forecast could not render'}</strong>
        <span>Try reloading Aether.</span>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
