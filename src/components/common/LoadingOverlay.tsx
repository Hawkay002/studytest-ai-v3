import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CheckCircle2, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { GenerationProgress } from "@/lib/gemini"

// Generic cycling copy used when we have no granular progress to report
// (e.g. the single-call image path). The chunked text path supplies a real
// per-section GenerationProgress instead.
const MESSAGES = [
  "Reading your content...",
  "Identifying key concepts...",
  "Crafting questions...",
  "Writing answer explanations...",
  "Finalizing your test...",
]

interface LoadingOverlayProps {
  onCancel: () => void
  // When provided (text/chunked path), the overlay switches to determinate
  // mode: a labelled progress bar with a percentage and a per-section
  // checklist showing which sections are done vs in progress.
  progress?: GenerationProgress | null
  title?: string
  /**
   * When true, the overlay is positioned absolutely to cover its nearest
   * positioned ancestor (instead of the viewport via `fixed`). Use this when
   * the overlay lives inside a scrollable container — e.g. a Dialog — so it
   * covers the FULL scrollable area (including the scrolled-off bottom) rather
   * than leaving an unblurred strip.
   */
  absolute?: boolean
}

export function LoadingOverlay({
  onCancel,
  progress = null,
  title = "Generating your test",
  absolute = false,
}: LoadingOverlayProps) {
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGES.length)
    }, 2000)
    return () => window.clearInterval(id)
  }, [])

  const hasProgress = !!progress && progress.total > 0
  const pct = hasProgress
    ? Math.round((progress!.completed / progress!.total) * 100)
    : 0

  return (
    <div
      className={`${
        absolute ? "absolute" : "fixed"
      } inset-0 z-50 flex flex-col items-center justify-center bg-background/80 px-6 backdrop-blur-sm`}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />

        <div className="space-y-1">
          <p className="text-lg font-semibold">{title}</p>
          {hasProgress ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {progress!.completed} of {progress!.total} sections ready · {pct}%
            </p>
          ) : (
            <div className="h-5 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p
                  key={index}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm text-muted-foreground"
                >
                  {MESSAGES[index]}
                </motion.p>
              </AnimatePresence>
            </div>
          )}
        </div>

        {hasProgress && (
          <div className="w-full space-y-4">
            {/* Progress bar (smoothed via CSS transition as sections resolve). */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: 0.5, ease: "easeOut" }
                }
              />
            </div>

            {/* Per-section checklist: check when done, spinner while in progress. */}
            <ul className="space-y-2 text-left">
              {progress!.sections.map((s) => (
                <li
                  key={s.name}
                  className={cn(
                    "flex items-center gap-2.5 text-sm transition-colors",
                    s.done
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {s.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  )}
                  <span>{s.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1">
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  )
}
