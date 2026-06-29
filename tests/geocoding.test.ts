import { afterEach, describe, expect, test, vi } from 'vitest'
import { reverseGeocode } from '../src/services/geocoding'

describe('Nominatim rate limit', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('starts no more than one reverse-geocoding request per second', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-29T10:00:00Z'))

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      address: {
        city: 'Test City',
        country: 'Test Country'
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }))

    vi.stubGlobal('fetch', fetchMock)

    const first = reverseGeocode(48, 2)
    const second = reverseGeocode(49, 3)

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await expect(Promise.all([first, second])).resolves.toEqual([
      'Test City, Test Country',
      'Test City, Test Country'
    ])
  })

  test('cancels an outdated reverse-geocoding request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-29T11:00:00Z'))

    const fetchMock = vi.fn((
      _url: string,
      init?: RequestInit
    ) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal?.reason)
      }, { once: true })
    }))

    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const request = reverseGeocode(48, 2, controller.signal)

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    controller.abort()

    await expect(request).rejects.toMatchObject({
      name: 'AbortError'
    })
  })
})
