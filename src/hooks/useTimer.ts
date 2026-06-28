import { useCallback, useEffect, useRef, useState } from "react"

const MINUTE = 60

export interface UseTimerResult {
  timeLeft: number
  formattedTime: string
  isRunning: boolean
  isExpired: boolean
  percentage: number
  start: () => void
  pause: () => void
  reset: (totalSeconds?: number) => void
}

function format(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / MINUTE)
  const r = s % MINUTE
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
}

/**
 * Countdown timer for the test page. Derives the remaining time from a
 * wall-clock deadline rather than decrementing a counter, so a single
 * setInterval runs for the whole countdown without drift accumulation and
 * without tearing down/restarting on each tick. `onExpire` fires exactly once.
 */
export function useTimer(
  initialSeconds: number,
  onExpire?: () => void,
): UseTimerResult {
  const [total, setTotal] = useState(initialSeconds)
  const [timeLeft, setTimeLeft] = useState(initialSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const firedRef = useRef(false)
  const deadlineRef = useRef<number | null>(null)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  // Start a single interval when running; cleared on pause/unmount.
  // timeLeft is intentionally omitted from deps: the remaining time is
  // recomputed from the deadline each tick, so we never restart the interval.
  useEffect(() => {
    if (!isRunning) return
    deadlineRef.current = Date.now() + timeLeft * 1000

    const id = window.setInterval(() => {
      const remaining = Math.round(
        ((deadlineRef.current ?? 0) - Date.now()) / 1000,
      )
      if (remaining <= 0) {
        setTimeLeft(0)
        window.clearInterval(id)
        setIsRunning(false)
        if (!firedRef.current) {
          firedRef.current = true
          onExpireRef.current?.()
        }
        return
      }
      setTimeLeft(remaining)
    }, 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning])

  const start = useCallback(() => setIsRunning(true), [])
  const pause = useCallback(() => setIsRunning(false), [])

  const reset = useCallback((next?: number) => {
    setIsRunning(false)
    firedRef.current = false
    deadlineRef.current = null
    if (typeof next === "number") {
      setTotal(next)
      setTimeLeft(next)
    } else {
      setTimeLeft(total)
    }
  }, [total])

  return {
    timeLeft,
    formattedTime: format(timeLeft),
    isRunning,
    isExpired: timeLeft === 0 && total > 0,
    percentage: total > 0 ? (timeLeft / total) * 100 : 0,
    start,
    pause,
    reset,
  }
}
