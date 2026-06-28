// PDF → image rasterization for the answer-script upload flow.
//
// Uses pdfjs-dist (Mozilla pdf.js) loaded dynamically so it isn't bundled into
// the main chunk — it's only fetched when a user actually uploads a PDF. Each
// page is rendered to a JPEG data URL (same shape as resizeImageToFit output)
// so it drops straight into the existing grading pipeline (InlineImagePart).

const MAX_PAGES = 20
const RENDER_SCALE = 1.6 // crisp enough for OCR; keeps payload reasonable
const JPEG_QUALITY = 0.85

export interface PdfPageResult {
  /** data: URL (image/jpeg) per page, in document order. */
  dataUrls: string[]
  pageCount: number
}

/**
 * Rasterize a PDF File into one JPEG data URL per page (capped at MAX_PAGES).
 * Throws on unreadable/corrupt PDFs or when pdf.js fails to load.
 */
export async function pdfToImages(file: File): Promise<PdfPageResult> {
  if (file.type !== "application/pdf") {
    throw new Error("That file isn't a PDF.")
  }

  // Dynamic import keeps pdf.js out of the main bundle.
  const pdfjs = await import("pdfjs-dist")
  // v4+ ships the worker as a separate module URL; importing it this way lets
  // Vite resolve and bundle the worker asset correctly.
  const workerUrl = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: buffer })
  const doc = await loadingTask.promise
  const pageCount = Math.min(doc.numPages, MAX_PAGES)
  const dataUrls: string[] = []

  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas 2D context unavailable for PDF render.")
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      dataUrls.push(canvas.toDataURL("image/jpeg", JPEG_QUALITY))
    }
  } finally {
    // destroy() lives on the loading task; releases the worker + memory.
    await loadingTask.destroy()
  }
  return { dataUrls, pageCount }
}
