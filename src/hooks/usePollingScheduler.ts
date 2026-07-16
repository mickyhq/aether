import { useEffect, useRef } from 'react'

type PollingSchedulerOptions = {
  enabled: boolean
  intervalMs: number
  initialDelayMs?: number
  restartKey: string
  task: (signal: AbortSignal) => Promise<void>
  onError?: (error: unknown) => void
}

export function usePollingScheduler({
  enabled,
  intervalMs,
  initialDelayMs = 0,
  restartKey,
  task,
  onError
}: PollingSchedulerOptions) {
  const taskRef = useRef(task)
  const errorRef = useRef(onError)

  taskRef.current = task
  errorRef.current = onError

  useEffect(() => {
    if (!enabled) {
      return
    }

    let active = true
    let running = false
    let rerunRequested = false
    let timer = 0
    let controller: AbortController | null = null

    const clearTimer = () => {
      window.clearTimeout(timer)
      timer = 0
    }

    const canRun = () => (
      document.visibilityState !== 'hidden' && navigator.onLine
    )

    const schedule = (delayMs: number) => {
      clearTimer()

      if (!active || !canRun()) {
        return
      }

      timer = window.setTimeout(run, delayMs)
    }

    const run = async () => {
      timer = 0

      if (!active || !canRun()) {
        return
      }

      if (running) {
        rerunRequested = true
        return
      }

      running = true
      controller = new AbortController()

      try {
        await taskRef.current(controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) {
          errorRef.current?.(error)
        }
      } finally {
        running = false
        controller = null

        if (active && canRun()) {
          const delay = rerunRequested ? 0 : intervalMs

          rerunRequested = false
          schedule(delay)
        }
      }
    }

    const resume = () => {
      if (running) {
        rerunRequested = true
        return
      }

      schedule(0)
    }

    const pause = () => {
      clearTimer()
      rerunRequested = false
      controller?.abort()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pause()
      } else {
        resume()
      }
    }

    schedule(initialDelayMs)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', resume)
    window.addEventListener('offline', pause)

    return () => {
      active = false
      clearTimer()
      controller?.abort()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', pause)
    }
  }, [enabled, initialDelayMs, intervalMs, restartKey])
}
