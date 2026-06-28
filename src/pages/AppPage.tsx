import { useEffect, useRef, useState } from "react"
import { useLocation } from "wouter"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronLeft, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { StepIndicator } from "@/components/common/StepIndicator"
import { LoadingOverlay } from "@/components/common/LoadingOverlay"
import { ContentInputTabs } from "@/components/input/ContentInputTabs"
import { TestConfigPanel } from "@/components/config/TestConfigPanel"
import { useApp } from "@/context/AppContext"
import { useApiKey } from "@/context/ApiKeyContext"
import { useApiKeyModal } from "@/components/common/ApiKeyModal"
import { useTestGenerator } from "@/hooks/useTestGenerator"
import { dataUrlToInlinePart } from "@/lib/imageUtils"
import type { GenerationProgress } from "@/lib/gemini"
import { PageTransition } from "@/components/layout/PageTransition"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function AppPage() {
  const { step, setStep, input, config, saveTest, setActiveTestId } = useApp()
  const { apiKey, isKeySet } = useApiKey()
  const { open: openApiKey } = useApiKeyModal()
  const { generate, isGenerating, cancelGeneration } =
    useTestGenerator()
  const [, navigate] = useLocation()
  const reduce = useReducedMotion()

  // Per-section progress for the chunked/text generation overlay.
  const [progress, setProgress] = useState<GenerationProgress | null>(null)

  // Auto-open the API key modal on /app if no key is set.
  const askedForOpen = useRef(false)
  useEffect(() => {
    if (!isKeySet && !askedForOpen.current) {
      askedForOpen.current = true
      openApiKey()
    }
  }, [isKeySet, openApiKey])

  const startGeneration = async () => {
    if (!isKeySet) {
      openApiKey()
      return
    }
    setStep("generating")
    setProgress(null)
    const images =
      input.inputMode === "image"
        ? input.images.map(dataUrlToInlinePart)
        : undefined

    const { test, error } = await generate(
      apiKey,
      {
        topic: input.topic,
        context: input.context,
        inputType: input.inputMode,
        images,
        config,
      },
      setProgress,
    )

    if (!test) {
      setStep("config")
      setProgress(null)
      if (error) {
        toast.error("Generation failed", {
          description: error,
          action: {
            label: "Retry",
            onClick: () => void startGeneration(),
          },
        })
      }
      return
    }

    saveTest(test)
    setActiveTestId(test.id)
    setProgress(null)
    toast.success("Test generated!", {
      description: `${test.sections.flatMap(s => s.questions).length} questions ready.`,
    })
    // Land on the test hub (Take / Upload / Download PDFs) rather than an
    // in-page preview — the hub is the single post-generation home for a test.
    navigate(`/test/${test.id}`)
  }

  return (
    <PageTransition>
      <div className="container max-w-3xl py-8 md:py-12">
        <div className="mb-8">
          <StepIndicator current={step} />
        </div>

        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div
              key="input"
              initial={reduce ? false : { opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -80 }}
              transition={{ duration: 0.25 }}
            >
              <ContentInputTabs onNext={() => setStep("config")} />
            </motion.div>
          )}

          {step === "config" && (
            <motion.div
              key="config"
              initial={reduce ? false : { opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -80 }}
              transition={{ duration: 0.25 }}
            >
              <TestConfigPanel
                onBack={() => setStep("input")}
                onGenerate={startGeneration}
              />
            </motion.div>
          )}

          {/* The "generating" step normally shows the full-screen LoadingOverlay
              while a request is in flight. This branch is the safety net for
              when generation is NOT actively running (cancelled, or stranded
              while a slow request resolves) so the step is never a blank
              dead-end — the user always has a Generate button to retry. */}
          {step === "generating" && !isGenerating && (
            <motion.div
              key="generating-idle"
              initial={reduce ? false : { opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -80 }}
              transition={{ duration: 0.25 }}
            >
              <Card>
                <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">Ready to generate</p>
                    <p className="text-sm text-muted-foreground">
                      Generation was stopped. Build your test now, or go back to
                      tweak the configuration.
                    </p>
                  </div>
                  <div className="flex w-full gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setStep("config")}
                      className="gap-1.5"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Config
                    </Button>
                    <Button
                      onClick={startGeneration}
                      size="lg"
                      className="flex-1 gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate Test
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isGenerating && (
        <LoadingOverlay
          progress={progress}
          onCancel={() => {
            cancelGeneration()
            setProgress(null)
            // Return to the config screen so the user can adjust and retry,
            // instead of stranding them on a blank "generating" step while
            // the in-flight request winds down.
            setStep("config")
          }}
        />
      )}
    </PageTransition>
  )
}