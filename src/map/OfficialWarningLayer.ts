import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import type { OfficialWarning, WarningSeverity } from '../types/weather'
import type { TranslationKey } from '../i18n/translations'

type Translate = (
  key: TranslationKey,
  values?: Record<string, string | number>
) => string

const PANE_NAME = 'official-warning-pane'

export class OfficialWarningLayer {
  private readonly layer = L.layerGroup()
  private language: string
  private translate: Translate

  constructor(map: L.Map, language: string, translate: Translate) {
    this.language = language
    this.translate = translate

    const pane = map.getPane(PANE_NAME) ?? map.createPane(PANE_NAME)

    pane.style.zIndex = '430'
    this.layer.addTo(map)
  }

  setLanguage(language: string, translate: Translate) {
    this.language = language
    this.translate = translate
  }

  setWarnings(warnings: OfficialWarning[]) {
    this.layer.clearLayers()

    for (const warning of warnings) {
      if (!warning.geometry) {
        continue
      }

      const geometry = L.geoJSON(warning.geometry as GeoJsonObject, {
        pane: PANE_NAME,
        style: warningStyle(warning),
        onEachFeature: (_, featureLayer) => {
          featureLayer.bindTooltip(warning.title, {
            className: 'official-warning-tooltip',
            sticky: true
          })
          featureLayer.bindPopup(this.createPopup(warning), {
            className: 'official-warning-popup',
            maxWidth: 360
          })
        }
      })

      geometry.addTo(this.layer)
    }
  }

  destroy() {
    this.layer.remove()
  }

  private createPopup(warning: OfficialWarning) {
    const root = document.createElement('article')

    root.className = 'official-warning-popup-content'
    appendText(root, 'strong', warning.title, 'official-warning-popup-title')
    appendText(
      root,
      'span',
      this.translate('warning.officialBadge'),
      'official-warning-popup-badge'
    )
    appendText(root, 'p', warning.description)
    appendText(root, 'p', [
      this.translate('warning.hazard', { value: warning.hazard }),
      this.translate('warning.severity', { value: warning.severity }),
      this.translate('warning.certainty', { value: warning.certainty })
    ].join(' · '), 'official-warning-popup-meta')

    if (warning.area) {
      appendText(
        root,
        'p',
        this.translate('warning.area', { value: warning.area }),
        'official-warning-popup-meta'
      )
    }

    const windowText = formatWindow(
      warning,
      this.language,
      this.translate
    )

    if (windowText) {
      appendText(root, 'p', windowText, 'official-warning-popup-meta')
    }

    if (warning.updatedAt) {
      appendText(
        root,
        'p',
        this.translate('warning.updated', {
          age: formatAge(warning.updatedAt, this.translate)
        }),
        'official-warning-popup-meta'
      )
    }

    if (warning.instructions) {
      appendText(
        root,
        'p',
        this.translate('warning.instructions', { value: warning.instructions }),
        'official-warning-popup-instructions'
      )
    }

    if (warning.state === 'grace') {
      appendText(
        root,
        'p',
        this.translate('warning.grace'),
        'official-warning-popup-grace'
      )
    }

    const source = appendText(
      root,
      'p',
      this.translate('warning.source', { source: warning.source }),
      'official-warning-popup-source'
    )

    if (warning.sourceUrl?.startsWith('https://')) {
      const link = document.createElement('a')

      link.href = warning.sourceUrl
      link.target = '_blank'
      link.rel = 'noreferrer'
      link.textContent = this.translate('warning.openSource')
      source.append(' · ', link)
    }

    return root
  }
}

function warningStyle(warning: OfficialWarning): L.PathOptions {
  const color = severityColor(warning.severity)

  return {
    color,
    fillColor: color,
    fillOpacity: warning.state === 'grace' ? 0.08 : 0.16,
    opacity: warning.state === 'grace' ? 0.62 : 0.9,
    weight: warning.severity === 'extreme' ? 3 : 2,
    dashArray: warning.state === 'grace' ? '7 6' : undefined
  }
}

function severityColor(severity: WarningSeverity) {
  if (severity === 'extreme') {
    return '#d946ef'
  }

  if (severity === 'severe') {
    return '#ef4444'
  }

  if (severity === 'moderate') {
    return '#f59e0b'
  }

  return severity === 'minor' ? '#facc15' : '#38bdf8'
}

function appendText(
  parent: HTMLElement,
  tag: 'strong' | 'span' | 'p',
  text: string,
  className?: string
) {
  const element = document.createElement(tag)

  element.textContent = text

  if (className) {
    element.className = className
  }

  parent.append(element)
  return element
}

function formatWindow(
  warning: OfficialWarning,
  language: string,
  translate: Translate
) {
  const effective = formatDate(warning.effectiveAt, language)
  const expires = formatDate(warning.expiresAt, language)

  if (effective && expires) {
    return translate('warning.window', { effective, expires })
  }

  if (expires) {
    return translate('warning.expires', { value: expires })
  }

  return effective ? translate('warning.effective', { value: effective }) : ''
}

function formatDate(value: string | null, language: string) {
  return value
    ? new Intl.DateTimeFormat(language, {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(value))
    : null
}

function formatAge(value: string, translate: Translate) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000))

  if (minutes < 1) {
    return translate('data.ageNow')
  }

  if (minutes < 60) {
    return translate('data.ageMinutes', { count: minutes })
  }

  const hours = Math.floor(minutes / 60)

  return hours < 24
    ? translate('data.ageHours', { count: hours })
    : translate('data.ageDays', { count: Math.floor(hours / 24) })
}
