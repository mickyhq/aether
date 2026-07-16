export type CachedPayloadRecord<T> = {
  updatedAt: number
  payload: T
}

export function readValidatedCacheRecords<T>(
  raw: string | null,
  validatePayload: (value: unknown) => value is T
) {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}')

    if (!isRecord(parsed)) {
      return {} as Record<string, CachedPayloadRecord<T>>
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, CachedPayloadRecord<T>] => {
          const record = entry[1]

          return isRecord(record) &&
            isFiniteNumber(record.updatedAt) &&
            validatePayload(record.payload)
        }
      )
    )
  } catch {
    return {} as Record<string, CachedPayloadRecord<T>>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
