import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface ShortAnswerBoxProps {
  value: string
  onChange: (next: string) => void
}

export function ShortAnswerBox({ value, onChange }: ShortAnswerBoxProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="short-answer" className="sr-only">
        Your answer
      </Label>
      <Textarea
        id="short-answer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer..."
        className="min-h-32 resize-y"
      />
      <div className="flex justify-end">
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.length} characters
        </span>
      </div>
    </div>
  )
}
