import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { useLocalStorage } from "@/hooks/useLocalStorage"
import { STORAGE_KEYS } from "@/lib/storage"
import type {
  AppStep,
  GeneratedTest,
  InputMode,
  TestConfig,
  TestResult,
} from "@/types/test"

export const DEFAULT_CONFIG: TestConfig = {
  totalMarks: 100,
  difficulty: "medium",
  questionTypes: ["mcq", "true_false", "fill_blank", "short_answer", "long_answer"],
  marksDistribution: {
    mcq: 20,
    true_false: 10,
    fill_blank: 20,
    short_answer: 30,
    long_answer: 20,
  },
  focus: "mixed",
  timerEnabled: false,
  timerMinutes: 30,
  stream: "",
  language: "English",
  choiceMode: false,
}

export interface InputState {
  topic: string
  context: string
  inputMode: InputMode
  // base64 data URLs for the uploaded images (post-compression)
  images: string[]
}

export const EMPTY_INPUT: InputState = {
  topic: "",
  context: "",
  inputMode: "text",
  images: [],
}

interface AppContextValue {
  // Multi-step flow
  step: AppStep
  setStep: (step: AppStep) => void

  // Inputs + config
  input: InputState
  setInput: (updater: (prev: InputState) => InputState) => void
  resetInput: () => void
  config: TestConfig
  setConfig: (updater: (prev: TestConfig) => TestConfig) => void

  // Persisted test store (so /test/:id works after refresh)
  tests: GeneratedTest[]
  saveTest: (test: GeneratedTest) => void
  getTest: (id: string) => GeneratedTest | undefined
  removeTest: (id: string) => void
  activeTestId: string | null
  setActiveTestId: (id: string | null) => void

  // Persisted results store
  results: Record<string, TestResult>
  saveResult: (result: TestResult) => void
  getResult: (id: string) => TestResult | undefined
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<AppStep>("input")
  const [input, setInputState] = useState<InputState>(EMPTY_INPUT)
  const [config, setConfigState] = useState<TestConfig>(DEFAULT_CONFIG)
  const [activeTestId, setActiveTestId] = useState<string | null>(null)

  const [tests, setTests] = useLocalStorage<GeneratedTest[]>(
    STORAGE_KEYS.tests,
    [],
  )
  const [results, setResults] = useLocalStorage<Record<string, TestResult>>(
    STORAGE_KEYS.results,
    {},
  )

  const setInput = useCallback(
    (updater: (prev: InputState) => InputState) =>
      setInputState((prev) => updater(prev)),
    [],
  )
  const resetInput = useCallback(() => setInputState(EMPTY_INPUT), [])

  const setConfig = useCallback(
    (updater: (prev: TestConfig) => TestConfig) =>
      setConfigState((prev) => updater(prev)),
    [],
  )

  const saveTest = useCallback(
    (test: GeneratedTest) => {
      setTests((prev) => {
        const others = prev.filter((t) => t.id !== test.id)
        return [test, ...others].slice(0, 30)
      })
    },
    [setTests],
  )

  const getTest = useCallback(
    (id: string) => tests.find((t) => t.id === id),
    [tests],
  )

  const removeTest = useCallback(
    (id: string) => {
      setTests((prev) => prev.filter((t) => t.id !== id))
    },
    [setTests],
  )

  const saveResult = useCallback(
    (result: TestResult) => {
      setResults((prev) => ({ ...prev, [result.testId]: result }))
    },
    [setResults],
  )

  const getResult = useCallback(
    (id: string) => results[id],
    [results],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      step,
      setStep,
      input,
      setInput,
      resetInput,
      config,
      setConfig,
      tests,
      saveTest,
      getTest,
      removeTest,
      activeTestId,
      setActiveTestId,
      results,
      saveResult,
      getResult,
    }),
    [
      step,
      input,
      setInput,
      resetInput,
      config,
      setConfig,
      tests,
      saveTest,
      getTest,
      removeTest,
      activeTestId,
      results,
      saveResult,
      getResult,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within an AppProvider")
  return ctx
}
