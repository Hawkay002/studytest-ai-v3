import type { LucideIcon } from "lucide-react"
import { BookOpen, Star, Target, TrendingUp, Trophy } from "lucide-react"

import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScoreRing } from "@/components/results/ScoreRing"
import { TypeBreakdown } from "@/components/results/TypeBreakdown"
import { getAllQuestions } from "@/lib/questions"
import type { GeneratedTest, TestResult } from "@/types/test"

interface ScoreCardProps {
  test: GeneratedTest
  result: TestResult
}

interface Performance {
  label: string
  icon: LucideIcon
}

function performance(pct: number): Performance {
  if (pct >= 90) return { label: "Outstanding!", icon: Trophy }
  if (pct >= 75) return { label: "Great work!", icon: Star }
  if (pct >= 60) return { label: "Good effort!", icon: TrendingUp }
  if (pct >= 40) return { label: "Keep practicing", icon: Target }
  return { label: "More review needed", icon: BookOpen }
}

function formatDuration(seconds?: number): string | null {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function ScoreCard({ test, result }: ScoreCardProps) {
  const pct = result.total > 0 ? (result.score / result.total) * 100 : 0
  const perf = performance(pct)
  const duration = formatDuration(result.timeTakenSeconds)

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-6">
        <ScoreRing score={result.score} total={result.total} />

        <div className="flex items-center gap-2 text-center">
          <perf.icon className="h-5 w-5 text-primary" />
          <p className="text-lg font-semibold">{perf.label}</p>
        </div>

        <Separator className="my-1" />

        <div className="w-full">
          <TypeBreakdown questions={getAllQuestions(test)} result={result} />
        </div>

        {duration && (
          <>
            <Separator className="my-1" />
            <p className="text-sm text-muted-foreground">
              Time taken:{" "}
              <span className="font-mono font-medium text-foreground">
                {duration}
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}