import { useRef } from "react"
import { AnimatePresence } from "motion/react"
import { Hash, Plus } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { TopicChip } from "@/components/input/TopicChip"

const SEP = "|"

const QUICK_ADD = ["Chapter 1", "Introduction", "Key Terms", "Summary"]

interface TopicChipInputProps {
  value: string // pipe-joined topics
  onChange: (next: string) => void
}

function parse(value: string): string[] {
  return value
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function TopicChipInput({ value, onChange }: TopicChipInputProps) {
  const chips = parse(value)
  // Mirror of `chips` kept in sync on every commit. Lets rapid, same-tick
  // mutations (e.g. blur committing pending text the instant before a
  // quick-add button is clicked) chain correctly instead of overwriting.
  const chipsRef = useRef<string[]>(chips)
  chipsRef.current = chips
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (next: string[]) => {
    const cleaned = next.map((c) => c.trim()).filter(Boolean)
    chipsRef.current = cleaned
    onChange(cleaned.join(` ${SEP} `))
  }

  // Accepts comma- or pipe-separated input and merges new, non-duplicate
  // topics onto the existing chips. Lets users type "math, science, history"
  // in one go — no Enter needed, which is especially handy on mobile keyboards.
  const addChips = (raw: string) => {
    const labels = raw
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (labels.length === 0) return
    const seen = new Set(chipsRef.current.map((c) => c.toLowerCase()))
    const next = [...chipsRef.current]
    for (const label of labels) {
      const key = label.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        next.push(label)
      }
    }
    commit(next)
  }

  const removeChip = (label: string) =>
    commit(chipsRef.current.filter((c) => c !== label))

  // Commit whatever is in the input field (splitting on commas) and clear it.
  const flush = () => {
    const el = inputRef.current
    if (!el) return
    const pending = el.value
    if (pending.trim()) {
      addChips(pending)
      el.value = ""
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-input bg-transparent p-2">
        <AnimatePresence mode="popLayout">
          {chips.map((chip) => (
            <TopicChip
              key={chip}
              label={chip}
              onRemove={() => removeChip(chip)}
            />
          ))}
        </AnimatePresence>

        <Input
          ref={inputRef}
          type="text"
          inputMode="text"
          placeholder="Type topics, separated by commas..."
          className="h-8 min-w-[180px] flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            // Enter commits the pending text; blur (tap away on mobile) also
            // commits, so pressing Enter is optional.
            if (e.key === "Enter") {
              e.preventDefault()
              flush()
            }
            if (e.key === "Backspace" && e.currentTarget.value === "") {
              const last = chipsRef.current[chipsRef.current.length - 1]
              if (last) removeChip(last)
            }
          }}
          onBlur={flush}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Hash className="h-3 w-3" />
          Quick add:
        </span>
        {QUICK_ADD.map((label) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => addChips(label)}
          >
            <Plus className="h-3 w-3" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
