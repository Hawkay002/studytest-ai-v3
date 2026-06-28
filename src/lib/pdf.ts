// PDF export: native jsPDF rendering for crisp, properly paginated test papers.
//
// Earlier versions rasterized a hidden DOM node with html2canvas and sliced
// the resulting image across pages. That caused edge-to-edge margins, text
// cut mid-line at page breaks, and no real answer space. Rendering natively
// with a layout cursor gives selectable text, exact pagination, and clean
// per-question-type formatting (lettered options, True/False marks, writing
// lines).

import { jsPDF } from "jspdf"

import type { ChoiceSection, GeneratedTest, Question } from "@/types/test"

export interface PdfOptions {
  filename: string
}

// A4 page size in PostScript points.
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48
const CONTENT_W = PAGE_W - MARGIN * 2
const LINE_H = 15

type Mode = "sheet" | "key"
type RGB = [number, number, number]
type Style = "normal" | "bold" | "italic"

const INK: RGB = [33, 33, 33]
const MUTED: RGB = [120, 120, 120]
const FAINT: RGB = [150, 150, 150]
const RULE: RGB = [205, 205, 205]
const ACCENT: RGB = [30, 90, 160]

/**
 * Cursor-based PDF layout helper. Tracks the y position, inserts page breaks
 * before content would overflow the bottom margin, and draws a footer with
 * page numbers across every page at the end.
 */
class PdfBuilder {
  doc = new jsPDF({ unit: "pt", format: "a4" })
  y = MARGIN
  page = 1

  /** Reserve vertical space, breaking to a new page if needed. */
  space(h: number) {
    if (this.y + h > PAGE_H - MARGIN) this.newPage()
    this.y += h
  }

  private newPage() {
    this.doc.addPage()
    this.page++
    this.y = MARGIN
  }

  /** Draw a wrapped text block at the given indent, advancing the cursor. */
  text(
    str: string,
    opts: {
      x?: number
      size?: number
      style?: Style
      color?: RGB
      gap?: number
    } = {},
  ) {
    const { x = MARGIN, size = 11, style = "normal", color = INK, gap = 0 } =
      opts
    const width = CONTENT_W - (x - MARGIN)
    this.doc.setFont("helvetica", style)
    this.doc.setFontSize(size)
    this.doc.setTextColor(color[0], color[1], color[2])
    const lines = this.doc.splitTextToSize(str, width) as string[]
    for (const line of lines) {
      if (this.y + LINE_H > PAGE_H - MARGIN) this.newPage()
      this.doc.text(line, x, this.y)
      this.y += LINE_H
    }
    this.y += gap
  }

  /** A thin horizontal rule at the current cursor, then a small gap. */
  rule(color: RGB = RULE) {
    if (this.y + 4 > PAGE_H - MARGIN) this.newPage()
    this.doc.setDrawColor(color[0], color[1], color[2])
    this.doc.setLineWidth(0.75)
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y)
    this.y += 10
  }

  /** Stamp a centered brand line and right-aligned page numbers on every page. */
  footer() {
    const total = this.doc.getNumberOfPages()
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i)
      this.doc.setFont("helvetica", "normal")
      this.doc.setFontSize(9)
      this.doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
      this.doc.text("StudyTest AI", PAGE_W / 2, PAGE_H - 26, {
        align: "center",
      })
      this.doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, PAGE_H - 26, {
        align: "right",
      })
    }
  }

  save(filename: string) {
    this.doc.save(filename)
  }
}

/** Type label for printable output. */
export function typeLabel(type: string): string {
  switch (type) {
    case "mcq":
      return "Multiple Choice"
    case "true_false":
      return "True / False"
    case "fill_blank":
      return "Fill in the Blank"
    case "short_answer":
      return "Short Answer"
    case "long_answer":
      return "Long Answer"
    default:
      return type
  }
}

/** Strip a leading "A. " / "A)" letter prefix from a normalized option. */
function stripLetter(opt: string): string {
  return opt.replace(/^[A-D][\).:\s]+/i, "").trim()
}

/** The display text for a question's prompt (fill-blank keeps its blank). */
function promptOf(q: Question): string {
  return q.question
}

/** Human-readable model answer for the answer key. */
function answerText(q: Question): string {
  if (q.type === "mcq") {
    const idx = ["A", "B", "C", "D"].indexOf(q.answer)
    const option = idx >= 0 ? q.options[idx] : undefined
    return option ? `${q.answer}. ${stripLetter(option)}` : q.answer
  }
  return q.answer
}

function header(b: PdfBuilder, test: GeneratedTest, mode: Mode) {
  const totalMarks = Object.values(test.config.marksDistribution).reduce(
    (a, m) => a + m,
    0,
  )
  const totalQuestions = test.sections.reduce(
    (n, s) => n + s.questions.length,
    0,
  )

  b.text(test.topic, { size: 20, style: "bold", color: INK, gap: 2 })
  b.text(mode === "sheet" ? "Practice test paper" : "Answer key", {
    size: 11,
    style: "italic",
    color: MUTED,
    gap: 8,
  })
  b.text(
    `${totalQuestions} questions   ·   ${totalMarks} marks   ·   ${new Date(
      test.createdAt,
    ).toLocaleDateString()}`,
    { size: 10, color: MUTED, gap: 8 },
  )
  b.text(
    mode === "sheet"
      ? "Instructions: Answer every question in the space provided. Write clearly; unreadable answers may not be marked."
      : "Model answers and explanations, one entry per question.",
    { size: 10, style: "italic", color: MUTED, gap: 8 },
  )
  b.rule()
}

function sectionHeader(b: PdfBuilder, section: ChoiceSection) {
  b.space(6)
  b.text(section.name, { size: 13, style: "bold", color: ACCENT, gap: 1 })
  if (section.description) {
    b.text(section.description, { size: 10, style: "italic", color: MUTED, gap: 6 })
  }
  b.rule(RULE)
}

/**
 * Render one question onto the downloadable test sheet. QUESTIONS ONLY — no
 * answer spaces, no MCQ checkboxes, no writing lines. The sheet is meant for
 * printing and answering on separate paper (or uploading a filled script for
 * AI grading), so it stays a clean exam paper. MCQ options are still listed
 * (they're part of the question), but without selection affordances.
 */
function questionSheet(b: PdfBuilder, q: Question, num: number) {
  b.space(8)
  b.text(`Q${num}.  ${promptOf(q)}`, { style: "bold", gap: 1 })
  b.text(`${typeLabel(q.type)}  ·  ${q.marks} mark${q.marks === 1 ? "" : "s"}`, {
    size: 9,
    color: FAINT,
    gap: 6,
  })

  // MCQ options are part of the question itself, so list them — but as plain
  // lettered options (no "choose one" framing), since the student answers
  // elsewhere.
  if (q.type === "mcq") {
    q.options.forEach((opt, i) => {
      const letter = "ABCD"[i]
      b.text(`${letter}.  ${stripLetter(opt)}`, { x: MARGIN + 18, size: 11, gap: 2 })
    })
  }
}

/** Render one question onto the answer key with its model answer. */
function questionKey(b: PdfBuilder, q: Question, num: number) {
  b.space(8)
  b.text(`Q${num}.  ${promptOf(q)}`, { style: "bold", gap: 2 })
  b.text(`Answer: ${answerText(q)}`, { color: INK, gap: 2 })
  if (q.explanation) {
    b.text(`Explanation: ${q.explanation}`, {
      size: 10,
      style: "italic",
      color: MUTED,
      gap: 4,
    })
  }
}

async function exportPdf(
  test: GeneratedTest,
  mode: Mode,
  { filename }: PdfOptions,
): Promise<void> {
  const multi = test.sections.length > 1
  const b = new PdfBuilder()
  header(b, test, mode)

  let num = 0
  for (const section of test.sections) {
    if (multi) sectionHeader(b, section)
    for (const q of section.questions) {
      num++
      if (mode === "sheet") questionSheet(b, q, num)
      else questionKey(b, q, num)
    }
  }

  b.footer()
  b.save(filename)
}

/** Render the student-facing test sheet (questions + answer space). */
export function exportTestSheet(
  test: GeneratedTest,
  opts: PdfOptions,
): Promise<void> {
  return exportPdf(test, "sheet", opts)
}

/** Render the teacher-facing answer key (model answers + explanations). */
export function exportAnswerKey(
  test: GeneratedTest,
  opts: PdfOptions,
): Promise<void> {
  return exportPdf(test, "key", opts)
}
