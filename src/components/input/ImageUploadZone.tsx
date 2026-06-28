import { useCallback, useState } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import { motion } from "motion/react"
import { AlertCircle, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { ImageThumbnailGrid } from "@/components/input/ImageThumbnailGrid"
import type { ThumbnailData } from "@/components/input/ImageThumbnailCard"
import { resizeImageToFit } from "@/lib/imageUtils"
import { cn, uuid } from "@/lib/utils"

const MAX_IMAGES = 5
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB per file
const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
}

interface ImageUploadZoneProps {
  images: ThumbnailData[]
  onChange: (next: ThumbnailData[]) => void
}

export function ImageUploadZone({ images, onChange }: ImageUploadZoneProps) {
  const [error, setError] = useState<string | null>(null)

  const addFiles = useCallback(
    async (files: File[]) => {
      setError(null)
      const room = MAX_IMAGES - images.length
      if (room <= 0) {
        setError(`You can upload at most ${MAX_IMAGES} images.`)
        return
      }
      const accepted = files.slice(0, room)
      const overflow = files.slice(room)

      const next: ThumbnailData[] = []
      for (const file of accepted) {
        if (file.size > MAX_BYTES) {
          toast.warning("Image skipped", {
            description: `${file.name} is larger than 10 MB.`,
          })
          continue
        }
        try {
          const before = file.size
          const { dataUrl, bytes } = await resizeImageToFit(file)
          next.push({
            id: uuid(),
            name: file.name,
            dataUrl,
            bytes,
            compressed: bytes < before,
          })
          if (bytes < before) {
            toast.warning("Image compressed", {
              description: `${file.name} resized to fit API limits.`,
            })
          }
        } catch {
          toast.error("Could not read image", { description: file.name })
        }
      }

      if (next.length) onChange([...images, ...next])
      if (overflow.length) {
        setError(`Only ${room} more image${room === 1 ? "" : "s"} allowed.`)
      }
    },
    [images, onChange],
  )

  const onDrop = useCallback(
    (acceptedFiles: File[], rejections: FileRejection[]) => {
      if (rejections.length) {
        setError("Some files were the wrong type. Use JPG, PNG, or WEBP.")
      }
      if (acceptedFiles.length) void addFiles(acceptedFiles)
    },
    [addFiles],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: true,
    noKeyboard: true,
  })

  const removeImage = (id: string) =>
    onChange(images.filter((img) => img.id !== id))

  return (
    <div className="space-y-4">
      {images.length === 0 ? (
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : error
                ? "border-destructive bg-destructive/5"
                : "border-border bg-muted/30 hover:border-primary/50",
          )}
        >
          <input {...getInputProps()} />
          <motion.div
            animate={isDragActive ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ repeat: isDragActive ? Infinity : 0, duration: 1 }}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full",
              error
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
            )}
          >
            {error ? (
              <AlertCircle className="h-6 w-6" />
            ) : (
              <UploadCloud className="h-6 w-6" />
            )}
          </motion.div>

          <div className="space-y-0.5">
            <p className="font-medium">
              {error
                ? error
                : isDragActive
                  ? "Drop to upload"
                  : "Drag & drop your textbook pages"}
            </p>
            {!error && (
              <p className="text-sm text-muted-foreground">
                or click to browse
              </p>
            )}
          </div>

          {!error && (
            <p className="text-xs text-muted-foreground">
              JPG &middot; PNG &middot; WEBP &middot; Max {MAX_IMAGES} images
              &middot; 10MB each
            </p>
          )}
        </div>
      ) : (
        <ImageThumbnailGrid
          images={images}
          onRemove={removeImage}
          onAddMore={open}
          maxReached={images.length >= MAX_IMAGES}
        />
      )}
    </div>
  )
}
