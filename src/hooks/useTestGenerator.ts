import { useCallback, useRef, useState } from "react"

import {
  generateTest as generateTestApi,
  type ProgressCallback,
} from "@/lib/gemini"
import type { InlineImagePart } from "@/lib/imageUtils"
import type { GeneratedTest, TestConfig } from "@/types/test"

export interface GenerateArgs {
  topic: string
  context: string
  inputType: "image" | "text"
  images?: InlineImagePart[]
  config: TestConfig
}

/** Outcome returned by generate/retry so callers read the error without a
 *  stale-closure race against React state. */
export interface GenerateOutcome {
  test: GeneratedTest | null
  error: string | null
}

export interface UseTestGeneratorResult {
  generate: (
    apiKey: string,
    args: GenerateArgs,
    onProgress?: ProgressCallback,
  ) => Promise<GenerateOutcome>
  isGenerating: boolean
  error: string | null
  cancelGeneration: () => void
  retryGeneration: (
    apiKey: string,
    args: GenerateArgs,
    onProgress?: ProgressCallback,
  ) => Promise<GenerateOutcome>
  clearError: () => void
}

/**
 * Wraps generateTest with cancel + retry semantics and loading/error state.
 * Cancellation is cooperative: the in-flight promise still resolves but its
 * result is discarded if the caller already navigated away.
 *
 * The error is returned in the resolved outcome (in addition to being kept in
 * state) so consumers can react immediately after `await` without depending on
 * a potentially stale render-time snapshot of `error`.
 *
 * onProgress is forwarded straight to generateTest so the UI can show a real
 * per-section progress bar (chunked/text path) instead of a static spinner.
 */
export function useTestGenerator(): UseTestGeneratorResult {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const lastArgsRef = useRef<{ apiKey: string; args: GenerateArgs } | null>(null)

  const run = useCallback(
    async (
      apiKey: string,
      args: GenerateArgs,
      onProgress?: ProgressCallback,
    ): Promise<GenerateOutcome> => {
      setIsGenerating(true)
      setError(null)
      cancelledRef.current = false
      lastArgsRef.current = { apiKey, args }
      try {
        const test = await generateTestApi({ apiKey, ...args }, onProgress)
        if (cancelledRef.current) return { test: null, error: null }
        return { test, error: null }
      } catch (err) {
        if (cancelledRef.current) return { test: null, error: null }
        const msg =
          err instanceof Error ? err.message : "Generation failed."
        setError(msg)
        return { test: null, error: msg }
      } finally {
        setIsGenerating(false)
      }
    },
    [],
  )

  const cancelGeneration = useCallback(() => {
    cancelledRef.current = true
    setIsGenerating(false)
  }, [])

  const retryGeneration = useCallback(
    (
      apiKey: string,
      args: GenerateArgs,
      onProgress?: ProgressCallback,
    ) => run(apiKey, args, onProgress),
    [run],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    generate: run,
    isGenerating,
    error,
    cancelGeneration,
    retryGeneration,
    clearError,
  }
}
