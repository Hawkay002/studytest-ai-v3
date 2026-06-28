import { useState } from "react"
import { FileDown, Plus, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { exportAnswerKey, exportTestSheet } from "@/lib/pdf"
import type { GeneratedTest } from "@/types/test"

interface ExportButtonsProps {
  test: GeneratedTest
  onRetake: () => void
  onNewTest: () => void
}

export function ExportButtons({
  test,
  onRetake,
  onNewTest,
}: ExportButtonsProps) {
  const [busy, setBusy] = useState<"sheet" | "key" | null>(null)

  const safeName = (test.topic || "test").replace(/[^\w-]+/g, "_").slice(0, 40)

  const exportPdf = async (which: "sheet" | "key") => {
    setBusy(which)
    try {
      const opts = {
        filename:
          which === "sheet"
            ? `${safeName}_test_sheet.pdf`
            : `${safeName}_answer_key.pdf`,
      }
      if (which === "sheet") await exportTestSheet(test, opts)
      else await exportAnswerKey(test, opts)
      toast.success("PDF downloaded")
    } catch {
      toast.error("Could not generate PDF", {
        description: "Try again in a moment.",
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="sticky bottom-4 z-30 grid grid-cols-2 gap-2 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur sm:grid-cols-4">
      <Button
        variant="outline"
        onClick={() => exportPdf("sheet")}
        disabled={busy !== null}
        className="gap-1.5"
      >
        <FileDown className="h-4 w-4" />
        {busy === "sheet" ? "Working..." : "Test Sheet"}
      </Button>
      <Button
        variant="outline"
        onClick={() => exportPdf("key")}
        disabled={busy !== null}
        className="gap-1.5"
      >
        <FileDown className="h-4 w-4" />
        {busy === "key" ? "Working..." : "Answer Key"}
      </Button>
      <Button variant="outline" onClick={onRetake} className="gap-1.5">
        <RotateCcw className="h-4 w-4" />
        Retake
      </Button>
      <Button onClick={onNewTest} className="gap-1.5">
        <Plus className="h-4 w-4" />
        New Test
      </Button>
    </div>
  )
}
