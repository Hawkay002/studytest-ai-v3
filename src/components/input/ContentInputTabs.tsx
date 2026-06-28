import { ArrowRight, Image as ImageIcon, Type } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { ImageUploadZone } from "@/components/input/ImageUploadZone"
import { TopicChipInput } from "@/components/input/TopicChipInput"
import { ContextTextarea } from "@/components/input/ContextTextarea"
import type { ThumbnailData } from "@/components/input/ImageThumbnailCard"
import { useApp } from "@/context/AppContext"
import type { InputMode } from "@/types/test"

interface ContentInputTabsProps {
  onNext: () => void
}

export function ContentInputTabs({ onNext }: ContentInputTabsProps) {
  const { input, setInput } = useApp()

  const canProceed =
    input.inputMode === "image"
      ? input.images.length > 0
      : input.topic.trim().length > 0

  const thumbnails: ThumbnailData[] = input.images.map((dataUrl, i) => ({
    id: `${i}-${dataUrl.slice(0, 8)}`,
    name: `Image ${i + 1}`,
    dataUrl,
    bytes: 0,
    compressed: false,
  }))

  const setThumbnails = (next: ThumbnailData[]) =>
    setInput((prev) => ({ ...prev, images: next.map((t) => t.dataUrl) }))

  return (
    <div className="space-y-6">
      <Tabs
        value={input.inputMode}
        onValueChange={(v) =>
          setInput((prev) => ({ ...prev, inputMode: v as InputMode }))
        }
      >
        <TabsList className="mx-auto grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="image" className="gap-1.5">
            <ImageIcon className="h-4 w-4" />
            Upload Images
          </TabsTrigger>
          <TabsTrigger value="text" className="gap-1.5">
            <Type className="h-4 w-4" />
            Enter Topics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="mt-4">
          <ImageUploadZone images={thumbnails} onChange={setThumbnails} />
        </TabsContent>

        <TabsContent value="text" className="mt-4">
          <TopicChipInput
            value={input.topic}
            onChange={(next) =>
              setInput((prev) => ({ ...prev, topic: next }))
            }
          />
        </TabsContent>
      </Tabs>

      <ContextTextarea
        value={input.context}
        onChange={(next) => setInput((prev) => ({ ...prev, context: next }))}
      />

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="gap-2"
        >
          Next: Configure
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
