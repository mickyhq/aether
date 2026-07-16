import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useI18n } from '../i18n/I18nContext'

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
    void fetch('/api/client-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        area: this.props.area,
        message: error.message
      }),
      keepalive: true
    }).catch(() => undefined)
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

    return <WeatherErrorFallback area={this.props.area} />
  }
}

function WeatherErrorFallback({ area }: { area: 'map' | 'forecast' }) {
  const { t } = useI18n()
  const isMap = area === 'map'

  return (
    <div
      className={isMap
        ? 'render-error render-error-map'
        : 'weather-panel render-error'
      }
      role="alert"
    >
      <strong>{t(isMap ? 'error.map' : 'error.forecast')}</strong>
      <span>{t('error.reloadHint')}</span>
      <button type="button" onClick={() => window.location.reload()}>
        {t('error.reload')}
      </button>
    </div>
  )
}
