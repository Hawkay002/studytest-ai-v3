import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface LongAnswerBoxProps {
  value: string
  onChange: (next: string) => void
}

export function LongAnswerBox({ value, onChange }: LongAnswerBoxProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="long-answer" className="sr-only">
        Your answer
      </Label>
      <Textarea
        id="long-answer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your detailed answer..."
        className="min-h-48 resize-y"
      />
      <div className="flex justify-end">
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.length} characters
        </span>
      </div>
    </div>
  )
}
