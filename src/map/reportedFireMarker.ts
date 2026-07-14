import L from 'leaflet'

export function createReportedFireIcon(index: number) {
  return L.divIcon({
    className: 'reported-fire-marker',
    html: buildFireFlameMarkup(index),
    iconSize: [28, 34],
    iconAnchor: [14, 32],
    popupAnchor: [0, -28]
  })
}

export function buildFireFlameMarkup(index: number, className = '') {
  const delay = getAnimationDelay(index)

  return `
      <span
        class="reported-fire-flame ${className}"
        style="--fire-delay: ${delay}s"
        aria-hidden="true"
      >
        <span class="reported-fire-glow"></span>
        <svg viewBox="0 0 28 34" focusable="false">
          <path
            class="reported-fire-flame-outer"
            d="M14 33C6.7 33 2.8 27.9 3.8 20.9c.7-5 4.3-8.7 6.2-13.1.8 3.1 2.3 4.5 3.6 5.6C14.7 9 18 5.2 17.4 1c5.4 4.8 8.6 11.3 7.4 18.3C23.7 27.5 19.7 33 14 33Z"
          />
          <path
            class="reported-fire-flame-middle"
            d="M14 31.6c-4.8 0-7.7-3.6-6.8-8.2.6-3.4 2.9-5.6 4.3-8.5.7 2.3 2 3.3 3 4.2 1.2-2.8 3.4-5.2 3.3-7.7 3.5 3.8 5.2 7.5 4.3 12.4-.8 4.8-3.6 7.8-8.1 7.8Z"
          />
          <path
            class="reported-fire-flame-inner"
            d="M14.2 30.5c-2.7 0-4.4-2-4-4.8.3-2 1.8-3.5 3-5.3.3 1.5 1 2.3 1.8 3.1.8-1.7 2-3.1 2-4.6 2.1 2.4 2.9 4.8 2.2 7.5-.5 2.6-2.2 4.1-5 4.1Z"
          />
          <circle class="reported-fire-ember is-one" cx="5" cy="15" r="1.2" />
          <circle class="reported-fire-ember is-two" cx="22" cy="10" r="1" />
        </svg>
      </span>
    `
}

export function buildTileFireMarkup(index: number) {
  return `
    <span
      class="reported-fire-flame is-tile-detection"
      style="--fire-delay: ${getAnimationDelay(index)}s"
      aria-hidden="true"
    >
      <span class="reported-fire-glow"></span>
      <span class="animated-fire-emoji">🔥</span>
    </span>
  `
}

function getAnimationDelay(index: number) {
  return -((index % 9) * 0.09).toFixed(2)
}
