import { jsonrepair } from "jsonrepair"

import type { ChoiceSection, Difficulty, GeneratedTest, Question, StudyFocus, QuestionType } from "@/types/test"
import { uuid } from "@/lib/utils"
const FOCUS_LABEL: Record<StudyFocus, string> = { concepts: "core concepts and how they fit together", definitions: "precise definitions of key terms", dates: "important dates and chronological order", cause_effect: "cause-and-effect relationships", application: "real-world application and worked examples", critical_analysis: "critical analysis and evaluation of arguments", synthesis: "synthesis of information from multiple sources", mixed: "a balanced mix of all the above", };
const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "easy (recall / direct recognition)", medium: "medium (some synthesis required)", hard: "extremely challenging (deep conceptual synthesis, creative application, and integration of multiple sub-topics; requires deep subject mastery)", mixed: "a mix of easy, medium, and hard", };

export interface PromptInputs {
  topic: string
  context: string
  totalMarks: number
  marksDistribution: Record<QuestionType, number>
  difficulty: Difficulty
  questionTypes: QuestionType[]
  focus: StudyFocus
  stream: string
  language: string
  choiceMode: boolean
}

export function buildGenerationPrompt(inputs: PromptInputs): {
  system: string
  user: string
} {
  const {
    topic,
    context,
    totalMarks,
    marksDistribution,
    difficulty,
    focus,
    stream,
    language,
    choiceMode,
  } = inputs

  const system = [
    `You are StudyTest AI, an elite academic examiner specializing in ${stream}.`,
    `Your sole job is to create a professional examination paper in ${language} from the given study material, returned as JSON.`,
    "OUTPUT CONTRACT (non-negotiable):",
    "- Your ENTIRE response must be a single JSON object. The first character MUST be '{' and the last MUST be '}'.",
    "- Do NOT summarize, echo, or restate the requirements. Do NOT write bullet points. Do NOT write any prose, reasoning, chain-of-thought, or commentary before or after the JSON.",
    "- Do NOT wrap the JSON in markdown fences. Do NOT add any text outside the JSON object.",
    "- Just emit the finished exam as JSON. Nothing else.",
    "The marks distribution is authoritative: the sum of every question's 'marks' must equal the stated Total Marks.",
    "Complexity: ~60% standard (direct application), ~20% twisted (careful reading), ~20% deep knowledge (synthesis and mastery).",
  ].join(" ")

  const schema = [
    "{",
    '  "topic": string,',
    '  "sections": [',
    '    {',
    '      "id": string,',
    '      "name": string,',
    '      "description": string,',
    '      "requiredCount": number,',
    '      "questions": [',
    '        {',
    '          "id": number,',
    '          "type": "mcq" | "true_false" | "fill_blank" | "short_answer" | "long_answer",',
    '          "question": string,',
    '          "options": string[] | null,',
    '          "answer": string,',
    '          "explanation": string,',
    '          "marks": number,',
    '          "difficulty": "easy" | "medium" | "hard"',
    '        }',
    '      ],',
    '    }',
    '  ],',
    '}',
  ].join("\n")

  // A complete, concrete few-shot example. Demonstrating the exact target
  // format is the single most effective way to make a non-JSON-mode model
  // (like Gemma) emit valid JSON — it pattern-matches a shown example far
  // better than it follows prose commands. Content is deliberately
  // placeholder so the model writes fresh questions for the real topics.
  const example = [
    "{",
    '  "topic": "Ohm\'s Law",',
    '  "sections": [',
    "    {",
    '      "id": "sec_1", "name": "Section A", "description": "Answer all.", "requiredCount": 2,',
    '      "questions": [',
    '        {"id":1,"type":"mcq","question":"Unit of resistance?","options":["A. Volt","B. Ohm","C. Ampere","D. Watt"],"answer":"B","explanation":"Resistance is measured in Ohms.","marks":2,"difficulty":"easy"},',
    '        {"id":2,"type":"long_answer","question":"Derive Ohm\'s law.","options":null,"answer":"V=IR follows from...","explanation":"Key steps...","marks":8,"difficulty":"hard"}',
    "      ]",
    "    }",
    "  ]",
    "}",
  ].join("\n")

  const user = [
    `Language: ${language}`,
    `Academic Stream: ${stream}`,
    `Study material:`,
    context.trim() ? `Context notes: ${context.trim()}` : "",
    topic.trim() ? `Topics: ${topic.trim()}` : "",
    "(Images of the source pages are attached separately, if any.)",
    "",
    `TEST REQUIREMENTS:`,
    `Total Marks: ${totalMarks}`,
    `Distribution: ${JSON.stringify(marksDistribution)}`,
    `Difficulty: ${DIFFICULTY_LABEL[difficulty]}.`,
    `Focus: ${FOCUS_LABEL[focus]}.`,
    "",
    "INSTRUCTIONS:",
    "1. Determine the number of questions per type to exactly hit the marks distribution.",
    "2. Group questions into logical sections (e.g., Section A: MCQ, Section B: Long Answers).",
    "3. For Long Answers, ensure the question requires deep synthesis.",
    choiceMode
      ? "4. Implement internal choice: set each section's 'requiredCount' BELOW its question count so students choose which to answer (e.g., 'Answer 4 of 6')."
      : "4. Set each section's 'requiredCount' equal to its question count (no internal choice).",
    "",
    "Output schema (the shape to follow):",
    schema,
    "",
    "EXAMPLE — exact JSON format to mimic (do NOT reuse this content; write NEW questions about the topics above):",
    example,
    "",
    "CRITICAL: Output ONLY the JSON object. No bullets, no summary, no reasoning. Begin your response with '{'.",
  ]
    .filter(Boolean)
    .join("\n")

  return { system, user }
}

export function parseTestResponse(
  raw: string,
  fallbackTopic: string,
  inputType: "image" | "text",
  config: any,
): GeneratedTest {
  const cleaned = stripFences(raw).trim()
  const jsonText = extractFirstJsonObject(cleaned) ?? cleaned

  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    // Gemma (no native JSON mode) can emit near-valid JSON: unescaped quotes,
    // trailing commas, smart quotes, or output truncated mid-object. jsonrepair
    // salvages those cases. We try the extracted object first, then the whole
    // response; if neither repairs, the parse genuinely failed (e.g. pure prose).
    parsed = salvageJson(jsonText) ?? salvageJson(cleaned)
    if (parsed === null) {
      throw new Error("The model response was not valid JSON.")
    }
  }

  const obj = parsed as any
  const sections = coerceSections(obj.sections)
  if (sections.length === 0) {
    throw new Error("The model returned no usable sections.")
  }

  return {
    id: uuid(),
    topic:
      typeof obj.topic === "string" && obj.topic.trim()
        ? obj.topic.trim()
        : fallbackTopic,
    sections,
    config,
    createdAt: new Date().toISOString(),
    inputType,
  }
}

// ---------------------------------------------------------------------------
// Chunked generation (text/Gemma path).
//
// Instead of one giant call asking Gemma for a full 200-mark, 5-type paper
// (where it drifts into prose), we make one small, focused call per question
// type. Each chunk asks for a single type worth a fixed mark allocation and
// expects a small JSON array. A focused prompt + concrete per-type example
// makes non-JSON-mode models comply far more reliably, and a failure only
// retries that one small chunk.
// ---------------------------------------------------------------------------

export interface ChunkPromptInputs {
  type: QuestionType
  /** Marks for EVERY question in this chunk (uniform by design). */
  marksPerQuestion: number
  /** How many questions to write. */
  count: number
  topic: string
  context: string
  difficulty: Difficulty
  focus: StudyFocus
  language: string
  stream: string
}

/**
 * Per-type allowed per-question marks and a sensible target question count.
 * Enforces the house rules:
 *   - mcq / true_false / fill_blank: 1 or 2 marks each, all the same
 *   - short_answer: 5 marks each
 *   - long_answer: 10, 15, or 20 marks each, all the same
 * Within a chunk all questions share one marks value, so a test never mixes
 * 1-mark and 2-mark MCQs, etc.
 */
const MARKS_CANDIDATES: Record<QuestionType, number[]> = {
  mcq: [2, 1],
  true_false: [1, 2],
  fill_blank: [1, 2],
  short_answer: [5],
  long_answer: [10, 20, 15],
}
const IDEAL_COUNT: Record<QuestionType, number> = {
  mcq: 10,
  true_false: 10,
  fill_blank: 10,
  short_answer: 6,
  long_answer: 5,
}

/**
 * Pick a uniform per-question mark value and a question count for a chunk.
 * Prefers a value that divides the target total evenly (so the section total
 * stays exact); among those, the one whose count is closest to the ideal.
 * Falls back to flooring the count if nothing divides evenly — uniformity is
 * the priority, the actual total may then differ slightly from the configured
 * distribution.
 */
export function planQuestions(
  type: QuestionType,
  totalMarks: number,
): { marksPerQuestion: number; count: number } {
  const candidates = MARKS_CANDIDATES[type]
  const ideal = IDEAL_COUNT[type]

  const exacts = candidates
    .map((m) => ({ m, c: totalMarks / m }))
    .filter((x) => Number.isInteger(x.c) && x.c >= 1 && x.c <= 25)
  if (exacts.length) {
    exacts.sort((a, b) => Math.abs(a.c - ideal) - Math.abs(b.c - ideal))
    return { marksPerQuestion: exacts[0].m, count: exacts[0].c }
  }

  let best = { m: candidates[0], c: 1, dist: Infinity }
  for (const m of candidates) {
    const c = Math.max(1, Math.floor(totalMarks / m))
    const dist = Math.abs(c - ideal)
    if (dist < best.dist) best = { m, c, dist }
  }
  return { marksPerQuestion: best.m, count: best.c }
}

const TYPE_NAME: Record<QuestionType, string> = {
  mcq: "multiple choice (MCQ)",
  true_false: "true / false",
  fill_blank: "fill in the blank",
  short_answer: "short answer",
  long_answer: "long answer",
}

/** Per-type concrete example array the model mimics, with the given per-question marks. */
function exampleForType(type: QuestionType, marksPerQuestion: number): string {
  const m = marksPerQuestion
  switch (type) {
    case "mcq":
      return `[{"id":1,"type":"mcq","question":"Unit of electrical resistance?","options":["A. Volt","B. Ohm","C. Ampere","D. Watt"],"answer":"B","explanation":"Resistance is measured in Ohms.","marks":${m},"difficulty":"easy"}]`
    case "true_false":
      return `[{"id":1,"type":"true_false","question":"A diode conducts current in only one direction.","answer":"True","explanation":"Diodes allow current flow from anode to cathode when forward-biased.","marks":${m},"difficulty":"easy"}]`
    case "fill_blank":
      return `[{"id":1,"type":"fill_blank","question":"The device that converts AC to DC is called a ___.","answer":"rectifier","explanation":"A rectifier converts alternating current to direct current.","marks":${m},"difficulty":"easy"}]`
    case "short_answer":
      return `[{"id":1,"type":"short_answer","question":"Define duty cycle in PWM.","answer":"The fraction of one period in which a signal is active (high).","explanation":"Duty cycle is Ton/(Ton+Toff), expressed as a percentage.","marks":${m},"difficulty":"medium"}]`
    case "long_answer":
      return `[{"id":1,"type":"long_answer","question":"Explain the working principle of a full-bridge inverter.","answer":"A full-bridge inverter uses four switches arranged in an H-bridge...","explanation":"Diagonal switch pairs conduct alternately to reverse the load voltage, producing AC from DC.","marks":${m},"difficulty":"hard"}]`
    default:
      return `[]`
  }
}

export function buildChunkPrompt(inputs: ChunkPromptInputs): {
  system: string
  user: string
} {
  const {
    type,
    marksPerQuestion,
    count,
    topic,
    context,
    difficulty,
    focus,
    language,
    stream,
  } = inputs
  const typeName = TYPE_NAME[type]

  // Deliberately MINIMAL. Constraint-heavy prompts cause chatty models
  // (Gemma) to echo the rules back as bullets instead of emitting the
  // artifact. So: no rule wall, no "OUTPUT CONTRACT", no "you must not".
  // Just one terse instruction + one concrete example to imitate. For LLMs,
  // imitation of a shown pattern reliably beats compliance with a rule list.
  const system = `${stream} examiner. Returns JSON only.`

  const user = [
    `${language}. Write exactly ${count} ${typeName} question${count === 1 ? "" : "s"} about these topics.`,
    topic.trim() ? `Topics: ${topic.trim()}` : "",
    context.trim() ? `Notes: ${context.trim()}` : "",
    `Difficulty: ${DIFFICULTY_LABEL[difficulty]}. ${FOCUS_LABEL[focus]}.`,
    `Each question must be worth exactly ${marksPerQuestion} mark${marksPerQuestion === 1 ? "" : "s"}.`,
    "",
    "Respond with a JSON array in this exact format (write new questions about the topics):",
    exampleForType(type, marksPerQuestion),
    `Write exactly ${count} questions, each "marks": ${marksPerQuestion}. Output the array only.`,
  ]
    .filter(Boolean)
    .join("\n")

  return { system, user }
}

/**
 * Parse a single chunk's response into a normalized Question[] of the expected
 * type. Tolerates wrapped shapes ({questions: [...]}), bare objects, prose
 * around the array, and near-valid JSON via the jsonrepair salvage layer.
 */
export function parseQuestionsArray(
  raw: string,
  type: QuestionType,
): Question[] {
  const cleaned = stripFences(raw).trim()

  let parsed: any = null
  // 1. Direct parse of the whole response.
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // 2. Pull out the first balanced array/object and parse (or salvage) it.
    const arrayText = extractFirstJsonArray(cleaned)
    if (arrayText !== null) {
      try {
        parsed = JSON.parse(arrayText)
      } catch {
        parsed = salvageJson(arrayText)
      }
    }
    if (parsed === null) {
      const objectText = extractFirstJsonObject(cleaned)
      if (objectText !== null) {
        try {
          parsed = JSON.parse(objectText)
        } catch {
          parsed = salvageJson(objectText)
        }
      }
    }
    // 3. Last resort: repair the entire response.
    if (parsed === null) parsed = salvageJson(cleaned)
  }

  // Normalize whatever we got into an array of raw question objects.
  let arr: unknown[]
  if (Array.isArray(parsed)) arr = parsed
  else if (parsed && Array.isArray((parsed as any).questions))
    arr = (parsed as any).questions
  else if (parsed && typeof parsed === "object") arr = [parsed]
  else throw new Error(`Expected a JSON array of ${TYPE_NAME[type]} questions.`)

  const questions = coerceQuestions(arr, type)
  if (questions.length === 0) {
    throw new Error(`No usable ${TYPE_NAME[type]} questions were parsed.`)
  }
  return questions
}

/**
 * Attempt to salvage a near-valid JSON string via jsonrepair, then parse it.
 * Returns the parsed object on success, or null if the input can't be repaired
 * (e.g. it's pure prose with no JSON structure at all). Closes truncated
 * objects, strips trailing commas, fixes unescaped quotes, normalizes quotes.
 */
function salvageJson(input: string): any {
  try {
    const repaired = jsonrepair(input)
    return JSON.parse(repaired)
  } catch {
    return null
  }
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
}

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === "\\") escape = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/** Extract the first balanced '[...]' JSON array from a string (string-aware). */
function extractFirstJsonArray(s: string): string | null {
  const start = s.indexOf("[")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === "\\") escape = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === "[") depth++
    else if (ch === "]") {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function coerceSections(raw: any): ChoiceSection[] {
  if (!Array.isArray(raw)) return []
  const out: ChoiceSection[] = []
  let sectionId = 1
  for (const s of raw) {
    if (!s || typeof s !== "object") continue
    const questions = coerceQuestions(s.questions)
    if (questions.length === 0) continue
    out.push({
      id: `sec_${sectionId++}`,
      name: String(s.name ?? "Section"),
      description: String(s.description ?? ""),
      requiredCount: Number(s.requiredCount) || questions.length,
      questions,
    })
  }
  return out
}

/**
 * Normalize a model-supplied type string to one of the canonical QuestionType
 * values. Models (especially Gemma) drift on naming: "long-answer", "long
 * answer", "essay", "Long Answer", "long", etc. Without this, such questions
 * are silently dropped by the exact-match branches below.
 */
function normalizeType(raw: string): QuestionType | null {
  const s = raw.toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z_]/g, "")
  const ALIASES: Record<string, QuestionType> = {
    mcq: "mcq",
    multiple_choice: "mcq",
    multiplechoice: "mcq",
    mc: "mcq",
    true_false: "true_false",
    truefalse: "true_false",
    tf: "true_false",
    trueorfalse: "true_false",
    boolean: "true_false",
    fill_blank: "fill_blank",
    fillblank: "fill_blank",
    fill_in_blank: "fill_blank",
    fill_in_the_blank: "fill_blank",
    blanks: "fill_blank",
    short_answer: "short_answer",
    shortanswer: "short_answer",
    short: "short_answer",
    long_answer: "long_answer",
    longanswer: "long_answer",
    long: "long_answer",
    essay: "long_answer",
    long_form: "long_answer",
    longform: "long_answer",
    descriptive: "long_answer",
  }
  return ALIASES[s] ?? null
}

export function coerceQuestions(
  raw: any,
  expectedType?: QuestionType,
): Question[] {
  if (!Array.isArray(raw)) return []
  const out: Question[] = []
  let id = 1
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const q = item as any
    // Resolve the type from the model's label, falling back to the chunk's
    // known type when missing/unrecognized (a chunk asks for one type, so
    // that is authoritative for anything parseable in its response).
    const type = normalizeType(String(q.type ?? "")) ?? expectedType ?? null
    const marks = Number(q.marks) || 1
    const base = {
      id,
      question: String(q.question ?? "").trim(),
      explanation: String(q.explanation ?? "").trim(),
      marks,
      difficulty: normalizeDifficulty(q.difficulty),
    }
    if (!base.question) continue

    if (type === "mcq") {
      const options = Array.isArray(q.options)
        ? (q.options as unknown[]).map((o) => String(o))
        : []
      if (options.length < 2) continue
      out.push({
        ...base,
        type: "mcq",
        options: normalizeOptions(options),
        answer: normalizeLetter(q.answer),
      })
    } else if (type === "true_false") {
      const answer =
        String(q.answer).toLowerCase().startsWith("t") ? "True" : "False"
      out.push({ ...base, type: "true_false", answer })
    } else if (type === "fill_blank") {
      const question = base.question.includes("___")
        ? base.question
        : `${base.question} ___`
      out.push({
        ...base,
        type: "fill_blank",
        question,
        answer: String(q.answer ?? "").trim(),
      })
    } else if (type === "long_answer" || type === "short_answer") {
      out.push({
        ...base,
        type: type as "short_answer" | "long_answer",
        answer: String(q.answer ?? "").trim(),
      })
    }
    id++
  }
  return out
}

function normalizeDifficulty(v: any): any {
  const s = String(v ?? "").toLowerCase()
  if (s === "easy" || s === "medium" || s === "hard") return s
  return undefined
}

function normalizeLetter(v: any): any {
  const s = String(v ?? "").toUpperCase().charAt(0)
  return s === "A" || s === "B" || s === "C" || s === "D" ? s : "A"
}

function normalizeOptions(options: string[]): string[] {
  const letters = ["A", "B", "C", "D"]
  return options.slice(0, 4).map((opt, i) => {
    const trimmed = opt.replace(/^[A-D][\).:\s]+/i, "").trim()
    return `${letters[i]}. ${trimmed}`
  })
}

