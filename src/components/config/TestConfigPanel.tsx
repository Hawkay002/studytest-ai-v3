import { ArrowLeft, Sparkles, GraduationCap, Languages, Hash } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { QuestionTypeSelector } from "@/components/config/QuestionTypeSelector"
import { DifficultySelector } from "@/components/config/DifficultySelector"
import { FocusSelector } from "@/components/config/FocusSelector"
import { TimerConfig } from "@/components/config/TimerConfig"
import { useApp } from "@/context/AppContext"
import type { Difficulty, StudyFocus, TestConfig, QuestionType } from "@/types/test"

interface TestConfigPanelProps {
  onBack: () => void
  onGenerate: () => void
}

export function TestConfigPanel({
  onBack,
  onGenerate,
}: TestConfigPanelProps) {
  const { config, setConfig } = useApp()

  const update = <K extends keyof TestConfig>(
    key: K,
    value: TestConfig[K],
  ) => setConfig((prev) => ({ ...prev, [key]: value }))

  const updateMarksDist = (type: QuestionType, marks: number) => {
    setConfig(prev => {
      const marksDistribution = { ...prev.marksDistribution, [type]: marks }
      // Keep totalMarks in sync with the distribution so the two can never
      // diverge (the prompt derives its total from the distribution anyway,
      // but staying consistent in stored state avoids surprises elsewhere).
      const totalMarks = Object.values(marksDistribution).reduce<number>(
        (sum, m) => sum + (Number(m) || 0),
        0,
      )
      return { ...prev, marksDistribution, totalMarks }
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configure your test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stream & Language */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                Academic Stream
              </Label>
              <Input
                value={config.stream}
                onChange={(e) => update("stream", e.target.value)}
                placeholder="e.g. Medicine, Engineering, Law..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                Language
              </Label>
              <Select
                value={config.language}
                onValueChange={(v) => update("language", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Spanish">Spanish</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                  <SelectItem value="German">German</SelectItem>
                  <SelectItem value="Hindi">Hindi</SelectItem>
                  <SelectItem value="Chinese">Chinese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Choice Mode Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">Choice Mode</Label>
              <p className="text-xs text-muted-foreground">
                Enable "Answer X of Y" patterns for later sections.
              </p>
            </div>
            <Switch
              checked={config.choiceMode}
              onCheckedChange={(v) => update("choiceMode", v)}
            />
          </div>

          <Separator />

          {/* Question types */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Question types
            </Label>
            <QuestionTypeSelector
              value={config.questionTypes}
              onChange={(next) => update("questionTypes", next)}
            />
          </div>

          {/* Marks Distribution */}
          <div className="space-y-3 p-4 rounded-xl border bg-card">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 font-semibold">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                Marks Allocation
              </Label>
              <Badge variant="secondary" className="tabular-nums">
                Total: {Object.values(config.marksDistribution).reduce((a, b) => a + b, 0)}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {config.questionTypes.map((type) => (
                <div key={type} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground capitalize">{type.replace('_', ' ')}</span>
                  <Input
                    type="number"
                    className="h-8 w-20 text-right"
                    value={config.marksDistribution[type] || 0}
                    onChange={(e) => updateMarksDist(type, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Difficulty */}
          <div className="space-y-2">
            <Label>Difficulty</Label>
            <DifficultySelector
              value={config.difficulty}
              onChange={(next) => update("difficulty", next as Difficulty)}
            />
          </div>

          <Separator />

          {/* Focus */}
          <div className="space-y-2">
            <Label>Study focus</Label>
            <FocusSelector
              value={config.focus}
              onChange={(next) => update("focus", next as StudyFocus)}
            />
          </div>

          <Separator />

          {/* Timer */}
          <TimerConfig
            enabled={config.timerEnabled}
            minutes={config.timerMinutes}
            onChange={({ enabled, minutes }) =>
              setConfig((prev) => ({
                ...prev,
                timerEnabled: enabled,
                timerMinutes: minutes,
              }))
            }
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-20 mt-2 flex items-center gap-2 border-t bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:z-auto sm:mt-0 sm:justify-between sm:border-0 sm:bg-transparent sm:py-0 sm:backdrop-blur-none">
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <Button onClick={onGenerate} size="lg" className="flex-1 gap-2 sm:flex-initial">
          <Sparkles className="h-4 w-4" />
          Generate Test
        </Button>
      </div>
    </div>
  )
}