import type { GeneratedTest, Question } from "@/types/test"

/** Flatten every question across all sections of a test (in display order). */
export function getAllQuestions(test: GeneratedTest): Question[] {
  return test.sections.flatMap((section) => section.questions)
}
