// .txt / .docx → plain-text extraction for the answer-script upload flow.
//
// .txt needs no dependency (native file.text()). .docx uses mammoth, loaded
// dynamically so it isn't bundled into the main chunk — only fetched when a
// user actually uploads a .docx.

/**
 * Extract plain text from a .txt or .docx File. Returns the text content
 * suitable for the answer-script text-grading path. Throws on unsupported
 * types or unreadable files.
 */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith(".txt") || file.type === "text/plain") {
    return file.text()
  }
  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    const mammoth = await import("mammoth/mammoth.browser")
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value || ""
  }
  throw new Error(`Unsupported text file type: ${file.name}`)
}

/** Whether a file is a supported text document (.txt or .docx). */
export function isTextDoc(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith(".txt") ||
    file.type === "text/plain" ||
    name.endsWith(".docx") ||
    file.type.includes("wordprocessingml")
  )
}
