import { useState } from "react"
import { useLocation } from "wouter"
import { FileText, Loader2, UploadCloud, X } from "lucide-react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { LoadingOverlay } from "@/components/common/LoadingOverlay"
import { useApp } from "@/context/AppContext"
import { useApiKey } from "@/context/ApiKeyContext"
import { useApiKeyModal } from "@/components/common/ApiKeyModal"
import { useTestHistory } from "@/hooks/useTestHistory"
import { gradeFromScript } from "@/lib/gemini"
import { pdfToImages } from "@/lib/pdfInput"
import { extractText, isTextDoc } from "@/lib/docInput"
import { resizeImageToFit } from "@/lib/imageUtils"
import { uuid } from "@/lib/utils"
import type { GeneratedTest } from "@/types/test"

interface UploadAnswerScriptProps {
  test: GeneratedTest
}

const MAX_PAGES = 20

interface PagePreview {
  id: string
  dataUrl: string
  name: string
}

export function UploadAnswerScript({ test }: UploadAnswerScriptProps) {
  const [, navigate] = useLocation()
  const { saveResult } = useApp()
  const { apiKey, isKeySet } = useApiKey()
  const { open: openApiKey } = useApiKeyModal()
  const { addEntry } = useTestHistory()

  const [pages, setPages] = useState<PagePreview[]>([])
  // Typed answer scripts (.txt/.docx) graded directly from text (no OCR).
  const [textDocs, setTextDocs] = useState<{ id: string; name: string; text: string }[]>([])
  const [isProcessing, setIsProcessing] = useState(false) // parsing uploads
  const [isGrading, setIsGrading] = useState(false) // AI grading
  // Per-page grading progress (reuses LoadingOverlay's section-checklist UI).
  const [gradingProgress, setGradingProgress] = useState<{
    completed: number
    total: number
  } | null>(null)
  const startedAtRef = useState(() => Date.now())[0]

  const addFiles = async (files: File[]) => {
    setIsProcessing(true)
    try {
      const nextPages: PagePreview[] = []
      const nextTexts: { id: string; name: string; text: string }[] = []
      for (const file of files) {
        // .txt / .docx — extracted to text, graded directly.
        if (isTextDoc(file)) {
          try {
            const text = await extractText(file)
            if (text.trim()) {
              nextTexts.push({ id: uuid(), name: file.name, text })
            } else {
              toast.error("File was empty", { description: file.name })
            }
          } catch (e) {
            toast.error("Could not read document", {
              description: e instanceof Error ? e.message : file.name,
            })
          }
          continue
        }
        if (pages.length + nextPages.length >= MAX_PAGES) {
          toast.warning("Page limit reached", {
            description: `Max ${MAX_PAGES} image pages per submission.`,
          })
          break
        }
        if (file.type === "application/pdf") {
          try {
            const { dataUrls, pageCount } = await pdfToImages(file)
            dataUrls.slice(0, MAX_PAGES - pages.length - nextPages.length).forEach((d, i) => {
              nextPages.push({ id: uuid(), dataUrl: d, name: `${file.name} · p${i + 1}/${pageCount}` })
            })
          } catch (e) {
            toast.error("Could not read PDF", {
              description: e instanceof Error ? e.message : file.name,
            })
          }
        } else if (file.type.startsWith("image/")) {
          try {
            const { dataUrl } = await resizeImageToFit(file)
            nextPages.push({ id: uuid(), dataUrl, name: file.name })
          } catch {
            toast.error("Could not read image", { description: file.name })
          }
        }
      }
      if (nextPages.length) setPages((prev) => [...prev, ...nextPages])
      if (nextTexts.length) setTextDocs((prev) => [...prev, ...nextTexts])
    } finally {
      setIsProcessing(false)
    }
  }

  const { getRootProps, getInputProps, open: openPicker, isDragActive } = useDropzone({
    onDrop: (accepted) => void addFiles(accepted),
    accept: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "text/plain": [".txt"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxSize: 25 * 1024 * 1024, // 25 MB per file
    multiple: true,
    noClick: true,
    noKeyboard: true,
  })

  const removePage = (id: string) =>
    setPages((prev) => prev.filter((p) => p.id !== id))

  const removeTextDoc = (id: string) =>
    setTextDocs((prev) => prev.filter((d) => d.id !== id))

  const handleGrade = async () => {
    if (!isKeySet) {
      openApiKey()
      return
    }
    const imagePages = pages.map((p) => p.dataUrl)
    const combinedText = textDocs.map((d) => d.text).join("\n\n").trim()
    if (imagePages.length === 0 && !combinedText) return
    setIsGrading(true)
    // Progress is image-page based; a text-only submission shows indeterminate.
    setGradingProgress(
      imagePages.length > 0 ? { completed: 0, total: imagePages.length } : null,
    )
    try {
      const elapsed = Math.round((Date.now() - startedAtRef) / 1000)
      const result = await gradeFromScript(
        test,
        imagePages,
        apiKey,
        elapsed,
        {
          textContent: combinedText || undefined,
          onProgress: (p) => setGradingProgress(p),
        },
      )
      saveResult(result)
      addEntry(test, result)
      toast.success("Answer script graded", {
        description: `${result.score}/${result.total} marks.`,
      })
      navigate(`/results/${test.id}`)
    } catch (err) {
      setIsGrading(false)
      setGradingProgress(null)
      toast.error("Grading failed", {
        description: err instanceof Error ? err.message : "Please try again.",
        action: { label: "Retry", onClick: () => void handleGrade() },
      })
    }
  }

  return (
    <div className="relative space-y-4">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
          onClick={openPicker}
        >
          <input {...getInputProps()} />
          {isProcessing ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Reading pages…</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drop your answer script here</p>
              <p className="text-xs text-muted-foreground">
                PDF · JPG · PNG · TXT · DOCX
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-1">
                Browse files
              </Button>
            </>
          )}
        </div>

        {/* Previews */}
        {pages.length + textDocs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {pages.length + textDocs.length} item{pages.length + textDocs.length === 1 ? "" : "s"} ready
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPages([])
                  setTextDocs([])
                }}
              >
                Clear all
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {pages.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-lg border bg-muted">
                  <img
                    src={p.dataUrl}
                    alt={p.name}
                    className="h-32 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePage(p.id)}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <span className="block truncate bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <FileText className="mr-1 inline h-3 w-3" />
                    {p.name}
                  </span>
                </div>
              ))}
              {textDocs.map((d) => (
                <div key={d.id} className="group relative overflow-hidden rounded-lg border bg-muted">
                  <div className="flex h-32 w-full flex-col gap-1 overflow-hidden p-2">
                    <div className="flex items-center gap-1 text-xs font-medium">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate">{d.name}</span>
                    </div>
                    <p className="flex-1 overflow-hidden text-[10px] leading-tight text-muted-foreground">
                      {d.text.slice(0, 240)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTextDoc(d.id)}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label={`Remove ${d.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grade button */}
        <div className="flex justify-end">
          <Button
            size="lg"
            className="gap-2"
            disabled={(pages.length === 0 && textDocs.length === 0) || isGrading || isProcessing}
            onClick={() => void handleGrade()}
          >
            <FileText className="h-4 w-4" />
            Grade My Answers
          </Button>
        </div>

      {isGrading && (
        <LoadingOverlay
          absolute
          title="Grading your answer script"
          progress={
            gradingProgress
              ? {
                  completed: gradingProgress.completed,
                  total: gradingProgress.total,
                  sections: Array.from({ length: gradingProgress.total }, (_, i) => ({
                    name: `Page ${i + 1}`,
                    done: i < gradingProgress.completed,
                  })),
                }
              : null
          }
          onCancel={() => {
            setIsGrading(false)
            setGradingProgress(null)
            toast.info("Grading cancelled")
          }}
        />
      )}
    </div>
  )
}
