type BudgetLevel = 'normal' | 'low' | 'critical'

const LOW_SAMPLE_LIMIT = 24
const CRITICAL_SAMPLE_LIMIT = 12
const NORMAL_SAMPLE_LIMIT = 48
const PRESSURE_WINDOW = 15 * 60 * 1000

let level: BudgetLevel = 'normal'
let pressuredUntil = 0

export function observeUpstreamBudget(response: Response) {
  const remaining = readNumberHeader(
    response,
    'x-aether-ratelimit-remaining'
  )
  const limit = readNumberHeader(response, 'x-aether-ratelimit-limit')
  const budgetStatus = response.headers.get('x-aether-upstream-budget')

  if (response.status === 429 || budgetStatus === 'critical') {
    setPressure('critical', getRetryUntil(response))
    return
  }

  if (budgetStatus === 'low') {
    setPressure('low', Date.now() + PRESSURE_WINDOW)
  }

  if (remaining === null) {
    return
  }

  const ratio = limit && limit > 0 ? remaining / limit : null

  if (remaining <= 0 || (ratio !== null && ratio <= 0.1)) {
    setPressure('critical', Date.now() + PRESSURE_WINDOW)
  } else if (remaining <= 100 || (ratio !== null && ratio <= 0.25)) {
    setPressure('low', Date.now() + PRESSURE_WINDOW)
  }
}

export function getMapSampleLimit() {
  clearExpiredPressure()

  if (level === 'critical') {
    return CRITICAL_SAMPLE_LIMIT
  }

  if (level === 'low') {
    return LOW_SAMPLE_LIMIT
  }

  return NORMAL_SAMPLE_LIMIT
}

export function getJetStreamGridSize() {
  const sampleLimit = getMapSampleLimit()

  if (sampleLimit === CRITICAL_SAMPLE_LIMIT) {
    return { columns: 5, rows: 3 }
  }

  if (sampleLimit === LOW_SAMPLE_LIMIT) {
    return { columns: 5, rows: 3 }
  }

  return { columns: 9, rows: 5 }
}

function setPressure(nextLevel: BudgetLevel, until: number) {
  if (
    nextLevel === 'critical' ||
    level === 'normal' ||
    pressuredUntil <= Date.now()
  ) {
    level = nextLevel
  }

  pressuredUntil = Math.max(pressuredUntil, until)
}

function clearExpiredPressure() {
  if (pressuredUntil > Date.now()) {
    return
  }

  level = 'normal'
  pressuredUntil = 0
}

function getRetryUntil(response: Response) {
  const retryAfter = Number(response.headers.get('retry-after'))

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Date.now() + retryAfter * 1000
  }

  return Date.now() + PRESSURE_WINDOW
}

function readNumberHeader(response: Response, name: string) {
  const value = response.headers.get(name)

  if (value === null) {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}
