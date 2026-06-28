import { useState } from "react"
import { useLocation } from "wouter"
import {
  CalendarDays,
  ClipboardList,
  Eye,
  FileStack,
  PenLine,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EmptyState } from "@/components/common/EmptyState"
import { PageTransition } from "@/components/layout/PageTransition"
import { useApp } from "@/context/AppContext"
import { getAllQuestions } from "@/lib/questions"
import { cn } from "@/lib/utils"

export function MyTestsPage() {
  const [, navigate] = useLocation()
  const { tests, removeTest, getResult } = useApp()
  const [confirmClear, setConfirmClear] = useState(false)

  if (tests.length === 0) {
    return (
      <PageTransition>
        <EmptyState
          icon={FileStack}
          title="No tests yet"
          description="Generated tests live here. Create your first one to get started."
          action={{
            label: "Generate a test",
            onClick: () => navigate("/app"),
          }}
        />
      </PageTransition>
    )
  }

  const totalMarksOf = (t: (typeof tests)[number]) =>
    Object.values(t.config.marksDistribution).reduce((a, b) => a + b, 0)

  return (
    <PageTransition>
      <div className="container max-w-3xl py-8 md:py-12">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileStack className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-bold">My Tests</h1>
          </div>

          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        </div>

        <div className="space-y-3">
          {tests.map((test) => {
            const questions = getAllQuestions(test)
            const marks = totalMarksOf(test)
            const result = getResult(test.id)
            const completed = !!result
            const pct =
              completed && result!.total > 0
                ? Math.round((result!.score / result!.total) * 100)
                : 0

            return (
              <Card
                key={test.id}
                className="overflow-hidden transition-colors hover:bg-muted/50"
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 truncate font-semibold leading-none">
                          {test.topic}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 font-medium",
                            completed
                              ? pct >= 80
                                ? "bg-green-100 text-green-700 border-green-200"
                                : pct >= 60
                                  ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                                  : "bg-red-100 text-red-700 border-red-200"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {completed ? `${pct}% · ${result!.score}/${result!.total}` : "Not started"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(test.createdAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" />
                          {questions.length} questions · {marks} marks
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => navigate(`/test/${test.id}`)}
                      >
                        <PenLine className="h-4 w-4" />
                        Open
                      </Button>
                      {completed && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => navigate(`/results/${test.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                          Review
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeTest(test.id)}
                        aria-label="Delete test"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all generated tests?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes every test from your library. Completed results in
                History are kept. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  tests.forEach((t) => removeTest(t.id))
                  setConfirmClear(false)
                }}
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  )
}
