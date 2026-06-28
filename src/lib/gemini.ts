// Thin fetch/SDK wrapper for the Gemini API.
// Uses @google/generative-ai with the user's own key (BYO-key). All requests
// go browser -> Google directly; no third-party server sees the key.

import { GoogleGenerativeAI, Part } from "@google/generative-ai"

import {
  ChoiceSection,
  GeneratedTest,
  Question,
  QuestionType,
  TestConfig,
  TestResult,
  UserAnswer,
} from "@/types/test"
import {
  buildChunkPrompt,
  buildGenerationPrompt,
  parseQuestionsArray,
  parseTestResponse,
  planQuestions,
} from "@/lib/prompts"
import { dataUrlToInlinePart, type InlineImagePart } from "@/lib/imageUtils"
import { uuid } from "@/lib/utils"

// Text generation + API-key validation. Gemma lacks the Gemini API's native
// structured-output mode, so reliability here is handled by strong JSON-only
// prompting plus a jsonrepair salvage pass in parseTestResponse (fixes
// truncated/malformed JSON that Gemma occasionally emits), and a one-time
// auto-retry in generateTest for the rare pure-prose case.
const TEXT_MODEL = "gemma-4-31b-it"
const VISION_MODEL = "gemini-3.5-flash"
// Older but stable flash model used as a fallback when the newest flagship
// (gemini-3.5-flash) returns 503 "high demand" during spikes.
const VISION_MODEL_FALLBACK = "gemini-2.5-flash"

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1200

type GenerativeModel = ReturnType<GoogleGenerativeAI["getGenerativeModel"]>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Transient provider errors worth retrying: 5xx overload, 429 quota, and
 * network/fetch blips. Non-transient errors (auth, bad request) are not
 * retried — retrying those just wastes time.
 */
function isTransientError(msg: string): boolean {
  return /\b(429|500|502|503|504)\b|high demand|overloaded|overload|temporarily|try again later|internal error|ECONNRESET|ETIMEDOUT|deadline exceeded|network error|fetch failed/i.test(
    msg,
  )
}

/**
 * Map a provider error to a clear, accurate user-facing message. Crucially
 * distinguishes 503 (Google's servers overloaded — their problem) from 429
 * (your account quota — your problem), instead of lumping them together.
 */
function mapProviderError(msg: string): Error {
  if (/api key|api_key|permission|denied|invalid/i.test(msg)) {
    return new Error("Your API key was rejected. Check it at aistudio.google.com.")
  }
  if (/\b503\b|high demand|overloaded|service unavailable|temporarily unavailable|backend error/i.test(msg)) {
    return new Error("Google's servers are temporarily overloaded. Please try again in a moment.")
  }
  if (/quota|rate limit|\b429\b|resource_exhausted/i.test(msg)) {
    return new Error("Rate limit or quota hit. Wait a moment and try again.")
  }
  return new Error(`Generation failed: ${msg}`)
}

/**
 * Run a single model call with exponential backoff on transient errors.
 * Returns the raw response on success; throws the last error once the retry
 * budget is exhausted (or immediately on non-transient errors).
 */
async function generateWithRetry(
  model: GenerativeModel,
  parts: Part[],
): Promise<{ text: string; finishReason: string | undefined }> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await model.generateContent({
        contents: [{ parts, role: "user" }],
      })
      return {
        text: res.response.text(),
        finishReason: res.response.candidates?.[0]?.finishReason as
          | string
          | undefined,
      }
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      if (!isTransientError(msg) || attempt === MAX_RETRIES) break
      // Exponential backoff with jitter to avoid thundering-herd retries.
      const delay = BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 400
      await sleep(delay)
    }
  }
  throw lastErr
}

/**
 * Send parts to a model, trying candidate model IDs in order. Each candidate
 * is retried with backoff via generateWithRetry; on exhaustion the next
 * candidate is tried (model fallback). Auth errors short-circuit immediately
 * since they aren't model-specific. Returns the first successful response.
 */
async function callModel(
  apiKey: string,
  opts: {
    systemInstruction?: string
    generationConfig: Record<string, unknown>
    parts: Part[]
    models: string[]
  },
): Promise<{ text: string; finishReason: string | undefined }> {
  const { systemInstruction, generationConfig, parts, models } = opts
  let lastMsg = "Unknown error from Gemini."
  for (let i = 0; i < models.length; i++) {
    const model = new GoogleGenerativeAI(apiKey.trim()).getGenerativeModel({
      model: models[i],
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig,
    })
    try {
      return await generateWithRetry(model, parts)
    } catch (err) {
      lastMsg = err instanceof Error ? err.message : String(err)
      // Auth errors won't be fixed by switching models — fail fast.
      if (/api key|api_key|permission|denied|invalid/i.test(lastMsg)) break
      if (i < models.length - 1) {
        console.warn(
          `[StudyTest] ${models[i]} failed ("${lastMsg}"), falling back to ${models[i + 1]}`,
        )
        continue
      }
    }
  }
  throw mapProviderError(lastMsg)
}

export async function validateApiKey(key: string): Promise<boolean> {
  if (!key.trim()) return false
  try {
    const genAI = new GoogleGenerativeAI(key.trim())
    const model = genAI.getGenerativeModel({ model: TEXT_MODEL })
    const res = await model.generateContent("ping")
    return !!res.response.text
  } catch {
    return false
  }
}

export interface GenerateOptions {
  apiKey: string
  topic: string
  context: string
  inputType: "image" | "text"
  images?: InlineImagePart[]
  config: TestConfig
}

export interface GenerationProgress {
  completed: number
  total: number
  sections: Array<{ name: string; done: boolean }>
}
export type ProgressCallback = (p: GenerationProgress) => void

export async function generateTest(
  opts: GenerateOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedTest> {
  const { apiKey, inputType, images } = opts
  if (!apiKey.trim()) throw new Error("Missing API key.")

  // Two paths:
  //  - IMAGE input uses the vision model (gemini-3.5-flash), which honors
  //    structured-output JSON mode. One call works reliably. No per-section
  //    progress to report (single call), so onProgress is unused here.
  //  - TEXT input uses Gemma (no JSON mode), which drifts on one giant call.
  //    So the text path generates the test one small chunk per question type
  //    and stitches the sections together, reporting progress as each chunk
  //    completes.
  const useVision = inputType === "image" && images?.length
  return useVision
    ? generateTestSingle(opts)
    : generateTestChunked(opts, onProgress)
}

/**
 * Single-call generation (vision / image path). The vision model honors JSON
 * mode, so one call for the whole paper is reliable.
 */
async function generateTestSingle(opts: GenerateOptions): Promise<GeneratedTest> {
  const { apiKey, topic, context, inputType, images, config } = opts

  const derivedTotalMarks = Object.values(
    config.marksDistribution,
  ).reduce<number>((sum, m) => sum + (Number(m) || 0), 0)

  const { system, user } = buildGenerationPrompt({
    topic,
    context,
    totalMarks: derivedTotalMarks,
    marksDistribution: config.marksDistribution,
    difficulty: config.difficulty,
    questionTypes: config.questionTypes,
    focus: config.focus,
    stream: config.stream,
    language: config.language,
    choiceMode: config.choiceMode,
  })

  const parts: Part[] = [{ text: user }]
  if (inputType === "image" && images?.length) {
    parts.push(...images)
  }

  const { text: raw, finishReason } = await callModel(apiKey, {
    systemInstruction: system,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
    },
    parts,
    models: [VISION_MODEL, VISION_MODEL_FALLBACK],
  })

  try {
    return parseTestResponse(raw, topic || "Untitled test", inputType, config)
  } catch (err) {
    console.error("[StudyTest] raw model response:", raw)
    console.error("[StudyTest] finishReason:", finishReason)
    if (finishReason && finishReason !== "STOP") {
      throw new Error(
        `The model output was truncated (finishReason: ${finishReason}) before the JSON could finish. ` +
          `Try lowering Total Marks, using fewer question types, or simplifying your context.`,
      )
    }
    const reason =
      err instanceof Error ? err.message : "Could not parse the model response."
    const snippet = raw.trim().slice(0, 400)
    throw new Error(`${reason} (raw output: "${snippet}")`)
  }
}

const SECTION_ORDER: QuestionType[] = [
  "mcq",
  "true_false",
  "fill_blank",
  "short_answer",
  "long_answer",
]
const SECTION_TITLE: Record<QuestionType, string> = {
  mcq: "Multiple Choice",
  true_false: "True / False",
  fill_blank: "Fill in the Blanks",
  short_answer: "Short Answer",
  long_answer: "Long Answer",
}

/**
 * Generate one question-type chunk via Gemma. A focused prompt + concrete
 * per-type example keeps the output a small, valid JSON array. Parse failures
 * (rare at this scope) retry once with a reinforced "JSON array only" nudge.
 */
async function generateSection(
  apiKey: string,
  args: {
    type: QuestionType
    marks: number
    topic: string
    context: string
    config: TestConfig
  },
): Promise<Question[]> {
  const { type, marks, topic, context, config } = args
  // Decide uniform per-question marks + count up front (mcq/tf/fill 1-2,
  // short 5, long 10/15/20). The prompt asks for exactly that, and we also
  // force the marks on every parsed question below so uniformity holds even
  // if the model writes a different value.
  const { marksPerQuestion, count: plannedCount } = planQuestions(type, marks)
  // When choice mode is ON, generate EXTRA questions so students can choose
  // without the section's effective marks dropping. E.g. 80-mark long_answer
  // (planned 4 × 20) becomes 6 × 20, requiredCount stays 4 → still 80 marks.
  // Only fires when choiceMode is enabled; otherwise behavior is unchanged.
  const extra =
    config.choiceMode
      ? type === "long_answer" || type === "short_answer"
        ? 2
        : 3
      : 0
  const generateCount = plannedCount + extra
  const { system, user } = buildChunkPrompt({
    type,
    marksPerQuestion,
    count: generateCount,
    topic,
    context,
    difficulty: config.difficulty,
    focus: config.focus,
    language: config.language,
    stream: config.stream,
  })

  const attempt = async (extra: Part[]): Promise<Question[]> => {
    const { text: raw, finishReason } = await callModel(apiKey, {
      systemInstruction: system,
      generationConfig: {
        // Low temperature is critical for format adherence with non-JSON-mode
        // models like Gemma. At 0.7 it drifts into chatty summaries; at 0.2 it
        // pattern-matches the concrete few-shot example instead.
        temperature: 0.2,
        topP: 0.95,
        // Each chunk is one question type — 8192 tokens is ample and keeps
        // every call small, fast, and well within free-tier token limits.
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
      parts: [{ text: user }, ...extra],
      models: [TEXT_MODEL],
    })
    if (finishReason && finishReason !== "STOP") {
      throw new Error(
        `The ${SECTION_TITLE[type]} section was truncated (finishReason: ${finishReason}).`,
      )
    }
    lastRawRef.current = raw
    const parsed = parseQuestionsArray(raw, type)
    // Force uniform per-question marks (house rule: every question of a type
    // shares one mark value), regardless of what the model wrote.
    return parsed.map((q) => ({ ...q, marks: marksPerQuestion }))
  }

  const lastRawRef = { current: "" }

  try {
    return await attempt([])
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (/truncated/i.test(msg)) throw err
    console.error(`[StudyTest] ${type} chunk raw output:`, lastRawRef.current)
    console.warn(
      `[StudyTest] ${type} chunk parse failed (${msg}), retrying with reinforced instruction`,
    )
    try {
      return await attempt([
        {
          text: "\nIMPORTANT: Your previous response was not a valid JSON array. Output ONLY the raw JSON array now — no reasoning, no markdown, no commentary. Start with [ and end with ].",
        },
      ])
    } catch (err2) {
      const reason =
        err2 instanceof Error ? err2.message : "Could not parse the response."
      const snippet = lastRawRef.current.trim().slice(0, 300)
      throw new Error(
        `${SECTION_TITLE[type]} section: ${reason}` +
          (snippet ? ` (raw: "${snippet}")` : ""),
      )
    }
  }
}

/**
 * Chunked generation (text / Gemma path). Builds one section per question
 * type that has marks > 0, runs them in parallel, and stitches the results
 * into a single GeneratedTest with globally-renumbered question ids. Reports
 * progress to onProgress as each section resolves (so the UI can show a real
 * per-section progress bar instead of a static spinner).
 */
async function generateTestChunked(
  opts: GenerateOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedTest> {
  const { apiKey, topic, context, inputType, config } = opts

  const types = SECTION_ORDER.filter(
    (t) =>
      config.questionTypes.includes(t) &&
      (Number(config.marksDistribution[t]) || 0) > 0,
  )

  if (types.length === 0) {
    throw new Error("No question types have marks allocated. Add marks in the config first.")
  }

  // Per-index results + done flags so we can report which sections have
  // completed as they resolve (parallel execution completes them out of
  // order; the index map keeps the progress list stable).
  const results: Array<
    { ok: true; questions: Question[] } | { ok: false; reason: string }
  > = new Array(types.length)
  const doneFlags = types.map(() => false)

  const report = () => {
    if (!onProgress) return
    onProgress({
      completed: doneFlags.filter(Boolean).length,
      total: types.length,
      sections: types.map((t, i) => ({
        name: SECTION_TITLE[t],
        done: doneFlags[i],
      })),
    })
  }
  report() // initial state: all sections in progress

  // Parallel: each chunk is small and independent, so failures only retry
  // that one section rather than the whole test.
  await Promise.allSettled(
    types.map(async (type, i) => {
      try {
        const questions = await generateSection(apiKey, {
          type,
          marks: Number(config.marksDistribution[type]) || 0,
          topic,
          context,
          config,
        })
        results[i] = { ok: true, questions }
      } catch (e) {
        results[i] = {
          ok: false,
          reason: e instanceof Error ? e.message : String(e),
        }
      }
      doneFlags[i] = true
      report()
    }),
  )

  const failure = results.find((r) => r && !r.ok)
  if (failure && !failure.ok) {
    throw new Error(`Test generation failed: ${failure.reason}`)
  }

  // Stitch into sections with globally-unique question ids and section ids.
  const sections: ChoiceSection[] = []
  let qid = 1
  results.forEach((result, i) => {
    const type = types[i]
    const questions = (result as { ok: true; questions: Question[] }).questions
    // requiredCount is the BASE planned count (before choice-mode inflation),
    // so a section's effective marks never drop: 6 generated × 20 marks with
    // requiredCount=4 stays 80 marks, "Answer 4 of 6". When choice mode is off,
    // every question is required.
    const baseCount = planQuestions(type, Number(config.marksDistribution[type]) || 0).count
    const requiredCount = config.choiceMode
      ? Math.min(baseCount, questions.length)
      : questions.length
    sections.push({
      id: `sec_${i + 1}`,
      name: `Section ${String.fromCharCode(65 + i)}: ${SECTION_TITLE[type]}`,
      description: `Answer ${requiredCount} of ${questions.length}.`,
      requiredCount,
      questions: questions.map((q) => ({ ...q, id: qid++ })),
    })
  })

  return {
    id: uuid(),
    topic: topic.trim() || "Untitled test",
    sections,
    config,
    createdAt: new Date().toISOString(),
    inputType,
  }
}

/**
 * Semantic Grading: Uses LLM to judge if a student's answer (text or image)
 * captures the core principle of the model answer.
 */
export async function gradeSemantic(
  apiKey: string,
  question: Question,
  userAnswer: string | InlineImagePart[],
  language: string,
): Promise<{ score: number; feedback: string }> {
  const prompt = `
    You are an expert academic grader. Grade the following answer based on its conceptual understanding and the "gist" of the topic.

    Model Answer: ${question.answer}
    User Answer: ${typeof userAnswer === "string" ? userAnswer : "[Image Uploaded]"}
    Language: ${language}
    Max Marks: ${question.marks}

    Criteria:
    1. Does the user understand the core principle?
    2. Is the explanation logically sound?
    3. If it's a "twisted" or "deep knowledge" question, does the user show creative synthesis?

    Return ONLY a JSON object:
    { "score": number, "feedback": "concise explanation in ${language} of why this score was given" }
  `

  const parts: Part[] = [{ text: prompt }]
  if (Array.isArray(userAnswer)) {
    parts.push(...userAnswer)
  }

  try {
    const { text } = await callModel(apiKey, {
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
      parts,
      models: [VISION_MODEL, VISION_MODEL_FALLBACK],
    })
    const cleaned = text.replace(/```json|```/g, "").trim()
    const parsed = JSON.parse(cleaned)
    return {
      score: Number(parsed.score) || 0,
      feedback: String(parsed.feedback || "No feedback provided."),
    }
  } catch (err) {
    console.error("Semantic grading failed:", err)
    // Reject so callers can fall back; a transient API failure shouldn't
    // silently zero out a student's free-text answer.
    throw err
  }
}

export function gradeTest(
  test: GeneratedTest,
  answers: Record<number, { text: string; images: string[] }>,
  timeTakenSeconds?: number,
): TestResult {
  // This is now a fallback or for quick local preview. 
  // Real grading now uses gradeSemantic.
  const allAnswers: UserAnswer[] = []
  let totalScore = 0
  let totalPossibleMarks = 0

  test.sections.forEach(section => {
    section.questions.forEach(q => {
      const given = (answers[q.id]?.text ?? "").trim()
      const isCorrect = isCorrectLocal(q, given)
      const score = isCorrect ? q.marks : 0
      
      allAnswers.push({
        questionId: q.id,
        answer: given,
        score,
        maxMarks: q.marks,
        feedback: isCorrect ? "Correct!" : "Incorrect. See explanation."
      })
    })
    
    // Implement Best-X logic
    const sorted = [...section.questions]
      .map(q => ({ q, given: answers[q.id]?.text || "" }))
      .filter(item => item.given.trim().length > 0)
      .sort((a, b) => (isCorrectLocal(b.q, b.given) ? 1 : 0) - (isCorrectLocal(a.q, a.given) ? 1 : 0))
      .slice(0, section.requiredCount)
    
    sorted.forEach(item => {
      if (isCorrectLocal(item.q, item.given)) totalScore += item.q.marks
    })
    
    // Max marks for this section is the sum of the top X highest mark questions
    const maxSectionMarks = [...section.questions]
      .map(q => q.marks)
      .sort((a, b) => b - a)
      .slice(0, section.requiredCount)
      .reduce((sum, m) => sum + m, 0)
    
    totalPossibleMarks += maxSectionMarks
  })

  return {
    testId: test.id,
    answers: allAnswers,
    score: totalScore,
    total: totalPossibleMarks,
    timeTakenSeconds,
    completedAt: new Date().toISOString(),
  }
}

/**
 * Full grading pass used at submit time.
 *
 * - Objective questions (mcq / true_false / fill_blank) are graded locally with
 *   exact matching: fast, deterministic, and the only sensible check.
 * - Free-text questions (short_answer / long_answer) are graded by the LLM via
 *   gradeSemantic for partial credit. If a single AI call fails, that question
 *   falls back to local matching rather than failing the whole submission.
 *
 * Implements the Best-X-of-Y scoring per section (count only the top
 * `requiredCount` answers by score), matching gradeTest's totals.
 */
export async function gradeTestSemantic(
  test: GeneratedTest,
  answers: Record<number, { text: string; images: string[] }>,
  apiKey: string,
  timeTakenSeconds?: number,
): Promise<TestResult> {
  type Grade = {
    score: number
    feedback: string
    answer: string
    answered: boolean
  }
  const grades = new Map<number, Grade>()
  const semantic: Promise<void>[] = []

  for (const section of test.sections) {
    for (const q of section.questions) {
      const entry = answers[q.id]
      const givenText = (entry?.text ?? "").trim()
      const hasImages = !!entry?.images?.length
      const answered = givenText.length > 0 || hasImages
      const isFreeText =
        q.type === "short_answer" || q.type === "long_answer"

      if (isFreeText && answered) {
        const userAnswer: string | InlineImagePart[] = hasImages
          ? entry!.images.map(dataUrlToInlinePart)
          : givenText

        semantic.push(
          gradeSemantic(apiKey, q, userAnswer, test.config.language)
            .then(({ score, feedback }) => {
              grades.set(q.id, {
                score: clampScore(score, q.marks),
                feedback,
                answer: hasImages ? "[Image uploaded]" : givenText,
                answered,
              })
            })
            .catch(() => {
              // Degrade gracefully: fall back to local matching for this answer.
              const ok = isCorrectLocal(q, givenText)
              grades.set(q.id, {
                score: ok ? q.marks : 0,
                feedback: ok
                  ? "Correct!"
                  : "Incorrect. See explanation.",
                answer: givenText,
                answered,
              })
            }),
        )
      } else {
        const ok = answered && isCorrectLocal(q, givenText)
        grades.set(q.id, {
          score: ok ? q.marks : 0,
          feedback: ok ? "Correct!" : "Incorrect. See explanation.",
          answer: givenText,
          answered,
        })
      }
    }
  }

  await Promise.all(semantic)

  const allAnswers: UserAnswer[] = []
  let totalScore = 0
  let totalPossibleMarks = 0

  test.sections.forEach((section) => {
    section.questions.forEach((q) => {
      const g = grades.get(q.id)!
      allAnswers.push({
        questionId: q.id,
        answer: g.answer,
        score: g.score,
        maxMarks: q.marks,
        feedback: g.feedback,
      })
    })

    // Best-X-of-Y: only the top `requiredCount` answered questions by score count.
    const counted = section.questions
      .map((q) => ({ grade: grades.get(q.id)! }))
      .filter((item) => item.grade.answered)
      .sort((a, b) => b.grade.score - a.grade.score)
      .slice(0, section.requiredCount)

    totalScore += counted.reduce((sum, item) => sum + item.grade.score, 0)

    // Max marks for this section is the sum of the top X highest-mark questions.
    const maxSectionMarks = [...section.questions]
      .map((q) => q.marks)
      .sort((a, b) => b - a)
      .slice(0, section.requiredCount)
      .reduce((sum, m) => sum + m, 0)

    totalPossibleMarks += maxSectionMarks
  })

  return {
    testId: test.id,
    answers: allAnswers,
    score: totalScore,
    total: totalPossibleMarks,
    timeTakenSeconds,
    completedAt: new Date().toISOString(),
  }
}

/**
 * Grade an uploaded answer script (handwritten scans, typed PDF/images, or a
 * pasted/extracted text document).
 *
 * Extraction is done PAGE BY PAGE (one small vision call per image), not in a
 * single giant call. This fixes the old 0-score failure mode where one large
 * extraction call would error/truncate and silently zero the whole script:
 * each page is small (no truncation), a page that errors is skipped (not
 * fatal), and progress is reported per page so the UI can show a checklist.
 *
 * For typed text (.txt/.docx), the text is supplied directly and graded from
 * text (more reliable than OCR). Answers are matched to questions by the
 * question number written on the script (Q1, Q2, ...).
 */
export async function gradeFromScript(
  test: GeneratedTest,
  scriptImagePages: string[],
  apiKey: string,
  timeTakenSeconds?: number,
  options?: {
    /** Optional extracted text (.txt/.docx content) graded directly, no OCR. */
    textContent?: string
    /** Per-page progress for the upload overlay checklist. */
    onProgress?: (p: { completed: number; total: number }) => void
  },
): Promise<TestResult> {
  const allQuestions = test.sections.flatMap((s) => s.questions)
  const answerByQid = new Map<number, string>()

  const mergeExtracted = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) {
      const id = Number(k.replace(/^Q/i, "").trim())
      if (!Number.isFinite(id)) continue
      const text = String(v ?? "").trim()
      if (!text) continue
      // last/longest-wins: a fuller transcription on a later page wins.
      const prev = answerByQid.get(id) ?? ""
      answerByQid.set(id, text.length >= prev.length ? text : prev)
    }
  }

  // --- Text path (.txt/.docx): one focused call over the raw text. ---
  if (options?.textContent && options.textContent.trim()) {
    const roster = buildRoster(allQuestions)
    const prompt = [
      "You are an exam script reader. The text below is a student's typed answer script.",
      "Each answer is labelled with a question number like Q1, Q2, etc.",
      "For MCQ give the single letter; for True/False give True or False; otherwise transcribe the answer.",
      'Return ONLY a JSON object mapping the question number (without "Q") to the answer, e.g. {"1":"B","2":"True"}.',
      "If an answer isn't present, omit it.",
      "Question roster:",
      roster,
      "--- ANSWER SCRIPT TEXT ---",
      options.textContent,
    ].join("\n")
    try {
      const { text } = await callModel(apiKey, {
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
        parts: [{ text: prompt }],
        models: [VISION_MODEL, VISION_MODEL_FALLBACK],
      })
      mergeExtracted(JSON.parse(text.replace(/```json|```/g, "").trim()))
    } catch (err) {
      console.error("[StudyTest] text-script extraction failed:", err)
    }
  }

  // --- Image path (scanned/typed PDF or photos): one small call per page. ---
  const totalPages = scriptImagePages.length
  let pagesDone = 0
  // Only pages that still have unfound questions need a roster; we rebuild the
  // unfound list before each call to keep prompts small and focused.
  for (const pageDataUrl of scriptImagePages) {
    const unfound = allQuestions.filter((q) => !answerByQid.has(q.id))
    if (unfound.length === 0) {
      pagesDone++
      options?.onProgress?.({ completed: pagesDone, total: totalPages })
      continue
    }
    const roster = buildRoster(unfound)
    const prompt = [
      "You are an exam script reader. The attached image is ONE page of a student's answer script.",
      "Read the answers on THIS page only. Each answer is labelled with a question number like Q1, Q2, etc.",
      "For MCQ give the single letter; for True/False give True or False; otherwise transcribe the answer.",
      'Return ONLY a JSON object mapping the question number (without "Q") to the answer, e.g. {"1":"B","2":"True"}.',
      "If an answer on this page isn't in the roster, omit it.",
      "Answers to find on this page:",
      roster,
    ].join("\n")
    try {
      const inlinePage = dataUrlToInlinePart(pageDataUrl)
      const { text } = await callModel(apiKey, {
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
        parts: [{ text: prompt }, inlinePage],
        models: [VISION_MODEL, VISION_MODEL_FALLBACK],
      })
      mergeExtracted(JSON.parse(text.replace(/```json|```/g, "").trim()))
    } catch (err) {
      // A single bad page must NOT sink the whole script — skip and continue.
      console.error("[StudyTest] page extraction failed:", err)
    }
    pagesDone++
    options?.onProgress?.({ completed: pagesDone, total: totalPages })
  }

  // If nothing was extracted from anywhere, surface a real error instead of
  // recording a silent 0/total result.
  if (answerByQid.size === 0) {
    throw new Error(
      "Couldn't read any answers from your script. Make sure each answer is clearly labelled with its question number (Q1, Q2…) and the file is legible.",
    )
  }

  // Build the answers map and grade via the proven shared tail.
  const answers: Record<number, { text: string; images: string[] }> = {}
  for (const q of allQuestions) {
    answers[q.id] = { text: answerByQid.get(q.id) ?? "", images: [] }
  }
  return gradeTestSemantic(test, answers, apiKey, timeTakenSeconds)
}

/** Build the "Q<id> (<type>): <hint>" roster the extraction model matches on. */
function buildRoster(questions: Question[]): string {
  return questions
    .map((q) => {
      const hint =
        q.type === "mcq"
          ? "single letter A/B/C/D"
          : q.type === "true_false"
            ? "True or False"
            : "the written answer text"
      return `Q${q.id} (${q.type}): ${hint}`
    })
    .join("\n")
}

function clampScore(score: number, max: number): number {
  const n = Number(score) || 0
  return Math.max(0, Math.min(max, n))
}

function isCorrectLocal(q: Question, given: string): boolean {
  if (!given) return false
  const norm = (s: string) => s.trim().toLowerCase().replace(/[.。,，!?！？\s]+$/, "")
  switch (q.type) {
    case "mcq": {
      // The model answer is a bare letter ("B"), but an uploaded answer script
      // is often transcribed as the full option ("B. Ohm"). Pull the leading
      // A/B/C/D out of the given answer so "b. ohm" matches stored "b".
      const m = norm(given).match(/^([a-d])\b/)
      const letter = m ? m[1] : norm(given)
      return letter === norm(q.answer)
    }
    case "true_false": {
      // Accept T / F / True / False (case-insensitive) since both forms appear
      // on scanned/typed scripts.
      const g = norm(given)
      const gBool = g.startsWith("t")
      const aBool = norm(q.answer).startsWith("t")
      return gBool === aBool
    }
    case "fill_blank":
    case "short_answer":
    case "long_answer":
      return norm(given) === norm(q.answer) || norm(given).includes(norm(q.answer)) || norm(q.answer).includes(norm(given))
    default:
      return false
  }
}

