import { useState } from "react"
import { useLocation, useParams } from "wouter"
import {
  BookOpen,
  ChevronLeft,
  Eye,
  FileDown,
  PenLine,
  Plus,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/common/EmptyState"
import { PageTransition } from "@/components/layout/PageTransition"
import { UploadAnswerScript } from "@/components/test/UploadAnswerScript"
import { useApp } from "@/context/AppContext"
import { exportAnswerKey, exportTestSheet } from "@/lib/pdf"
import { getAllQuestions } from "@/lib/questions"
import { cn } from "@/lib/utils"

export function TestDetailPage() {
  const params = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const { getTest, getResult, resetInput } = useApp()
  const [busy, setBusy] = useState<"sheet" | "key" | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const test = params.id ? getTest(params.id) : undefined

  if (!test) {
    return (
      <PageTransition>
        <EmptyState
          icon={BookOpen}
          title="Test not found"
          description="This test may have been deleted."
          action={{ label: "Go to My Tests", onClick: () => navigate("/my-tests") }}
        />
      </PageTransition>
    )
  }

  const questions = getAllQuestions(test)
  const marks = Object.values(test.config.marksDistribution).reduce(
    (a, b) => a + b,
    0,
  )
  const result = getResult(test.id)
  const completed = !!result
  const pct =
    completed && result!.total > 0
      ? Math.round((result!.score / result!.total) * 100)
      : 0

  const safeName = (test.topic || "test").replace(/[^\w-]+/g, "_").slice(0, 40)

  const exportPdf = async (which: "sheet" | "key") => {
    setBusy(which)
    try {
      const opts = {
        filename:
          which === "sheet"
            ? `${safeName}_questions.pdf`
            : `${safeName}_answer_key.pdf`,
      }
      if (which === "sheet") await exportTestSheet(test, opts)
      else await exportAnswerKey(test, opts)
      toast.success("PDF downloaded")
    } catch {
      toast.error("Could not generate PDF", { description: "Try again in a moment." })
    } finally {
      setBusy(null)
    }
  }

  const startNewTest = () => {
    resetInput()
    navigate("/app")
  }

  return (
    <PageTransition>
      <div className="container max-w-3xl py-8 md:py-12">
        <Button
          variant="ghost"
          onClick={() => navigate("/my-tests")}
          className="mb-4 gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          My Tests
        </Button>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{test.topic}</h1>
            <Badge
              variant="outline"
              className={cn(
                "font-medium",
                completed
                  ? pct >= 80
                    ? "bg-green-100 text-green-700 border-green-200"
                    : pct >= 60
                      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                      : "bg-red-100 text-red-700 border-red-200"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {completed ? `Completed · ${pct}%` : "Not started"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {test.sections.length} section(s), {questions.length} question(s), {marks} marks
          </p>
        </div>

        {/* Primary CTAs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            size="lg"
            className="h-auto flex-col gap-1 py-4"
            onClick={() => navigate(`/test/${test.id}/take`)}
          >
            <PenLine className="h-5 w-5" />
            Take This Test
            <span className="text-xs font-normal opacity-80">Answer online, get graded</span>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-auto flex-col gap-1 py-4"
            onClick={() => setShowUpload(true)}
          >
            <Upload className="h-5 w-5" />
            Upload Answer Script
            <span className="text-xs font-normal opacity-80">PDF, images, or text — AI grades it</span>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-auto flex-col gap-1 py-4"
            disabled={busy !== null}
            onClick={() => exportPdf("sheet")}
          >
            <FileDown className="h-5 w-5" />
            {busy === "sheet" ? "Working..." : "Download Questions"}
            <span className="text-xs font-normal opacity-80">Printable PDF, no answer spaces</span>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-auto flex-col gap-1 py-4"
            disabled={busy !== null}
            onClick={() => exportPdf("key")}
          >
            <FileDown className="h-5 w-5" />
            {busy === "key" ? "Working..." : "Download Answer Key"}
            <span className="text-xs font-normal opacity-80">Model answers + explanations</span>
          </Button>
        </div>

        {/* Secondary actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {completed && (
            <Button variant="ghost" className="gap-1.5" onClick={() => navigate(`/results/${test.id}`)}>
              <Eye className="h-4 w-4" />
              Review results
            </Button>
          )}
          <Button variant="ghost" className="gap-1.5" onClick={startNewTest}>
            <Plus className="h-4 w-4" />
            New Test
          </Button>
        </div>

        {/* Section breakdown */}
        <Card className="mt-8">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Test sections</h2>
            {test.sections.map((section) => (
              <div key={section.id} className="rounded-lg border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">{section.name}</span>
                  <span className="text-sm text-muted-foreground">{section.description}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {section.questions.map((q) => (
                    <div key={q.id} className="flex items-center gap-2 rounded bg-muted/50 p-2 text-sm">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
                        {q.type.replace("_", " ")}
                      </span>
                      <span className="flex-1 truncate">{q.question.substring(0, 60)}…</span>
                      <span className="font-semibold text-primary">{q.marks}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upload answer script — modal */}
        <Dialog open={showUpload} onOpenChange={setShowUpload}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload your answer script</DialogTitle>
              <DialogDescription>
                Number each answer (Q1, Q2…) so the AI can match it to the right
                question. Supports PDF, images, and text documents.
              </DialogDescription>
            </DialogHeader>
            <UploadAnswerScript test={test} />
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  )
}
