import { Link } from "wouter"
import {
  ArrowRight,
  Brain,
  ChevronDown,
  FileDown,
  LayoutList,
  ListChecks,
  MessageSquare,
  PenLine,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TextCursorInput,
  Timer,
  ToggleLeft,
  Upload,
  FileText,
  GraduationCap,
  Languages,
  BadgeCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { PageTransition } from "@/components/layout/PageTransition"

const HOW_IT_WORKS = [
  {
    icon: Upload,
    title: "Add your material",
    body: "Drop in textbook pages, diagrams, or just type the topics you're studying.",
  },
  {
    icon: SlidersHorizontal,
    title: "Configure the test",
    body: "Set total marks, stream, language, and enable choice-based sections.",
  },
  {
    icon: Sparkles,
    title: "Get an instant test",
    body: "AI writes questions with marks distribution, grades your answers, and explains every one.",
  },
]

const FEATURES = [
  { icon: Brain, title: "AI analysis", body: "Reads your pages and pulls out what actually matters." },
  { icon: LayoutList, title: "Five question types", body: "MCQ, True/False, Fill in Blank, Short Answer, and Long Answer." },
  { icon: Timer, title: "Timer mode", body: "Practice under exam conditions with auto-submit." },
  { icon: MessageSquare, title: "Semantic grading", body: "AI evaluates the gist of your answers, not just exact matches." },
  { icon: FileDown, title: "PDF export", body: "Print a blank test sheet or a full answer key with explanations." },
  { icon: ShieldCheck, title: "Private & secure", body: "Your key stays in your browser. No backend, no tracking." },
]

const TYPES = [
  { icon: ListChecks, label: "Multiple Choice" },
  { icon: ToggleLeft, label: "True / False" },
  { icon: TextCursorInput, label: "Fill in Blank" },
  { icon: PenLine, label: "Short Answer" },
  { icon: FileText, label: "Long Answer" },
]

const STREAM_EXAMPLES = [
  { label: "Medicine", icon: GraduationCap },
  { label: "Engineering", icon: BadgeCheck },
  { label: "Law", icon: Languages },
  { label: "Science", icon: Brain },
]

export function LandingPage() {
  return (
    <PageTransition>
      {/* Hero */}
      <section className="container flex flex-col items-center gap-6 py-16 text-center md:py-24">
        <Badge variant="secondary" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Powered by AI
        </Badge>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight md:text-6xl">
          Turn anything into an{" "}
          <span className="text-primary">academic examination</span>
        </h1>
        <p className="max-w-xl text-base text-muted-foreground md:text-lg">
          Upload a textbook page or type a topic. Get a graded,
          explained test in seconds. Free with your own AI key.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="gap-2">
            <Link href="/app">
              Start for free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="gap-2">
            <a href="#how-it-works">
              See how it works
              <ChevronDown className="h-4 w-4" />
            </a>
          </Button>
        </div>

        {/* Stream badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {STREAM_EXAMPLES.map((s) => (
            <Badge key={s.label} variant="outline" className="gap-1.5">
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </Badge>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="container border-t py-16 md:py-24"
      >
        <h2 className="mb-12 text-center text-2xl font-bold md:text-3xl">
          How it works
        </h2>
        <div className="relative grid gap-8 md:grid-cols-3">
          {/* Decorative dashed connecting line between the 3 step cards on desktop. */}
          <div
            aria-hidden
            className="absolute left-[16%] right-[16%] top-7 hidden border-t border-dashed border-border md:block"
          />
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.title}
              className="relative flex flex-col items-center gap-3 text-center"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" />
              </div>
              <div className="text-xs font-semibold text-muted-foreground">
                Step {i + 1}
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="max-w-xs text-sm text-muted-foreground">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container border-t py-16 md:py-24">
        <h2 className="mb-12 text-center text-2xl font-bold md:text-3xl">
          Everything you need to study smarter
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Question type previews */}
      <section className="container border-t py-16 md:py-24">
        <h2 className="mb-12 text-center text-2xl font-bold md:text-3xl">
          Five ways to test yourself
        </h2>
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-5">
          {TYPES.map((t) => (
            <div
              key={t.label}
              className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center"
            >
              <t.icon className="h-7 w-7 text-primary" />
              <span className="text-sm font-medium">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Exam-style features */}
      <section className="container border-t py-16 md:py-24">
        <h2 className="mb-12 text-center text-2xl font-bold md:text-3xl">
          Designed for real exams
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex flex-col gap-3 p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mx-auto">
                <GraduationCap className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Stream-based calibration</h3>
              <p className="text-sm text-muted-foreground">
                Tailored difficulty for Medicine, Engineering, Law, Science, and more.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-3 p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mx-auto">
                <Languages className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Multi-language support</h3>
              <p className="text-sm text-muted-foreground">
                Generate tests in English, Spanish, French, German, Hindi, Chinese.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-3 p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mx-auto">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Choice-based sections</h3>
              <p className="text-sm text-muted-foreground">
                Enable "Answer X of Y" patterns for essay and long-answer sections.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA banner */}
      <section className="container border-t py-16 md:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-primary p-8 text-center text-primary-foreground md:p-16">
          <div className="flex flex-col items-center gap-4">
            <Rocket className="h-10 w-10" />
            <h2 className="max-w-2xl text-3xl font-bold md:text-4xl">
              Ready to ace your next exam?
            </h2>
            <p className="max-w-md text-primary-foreground/80">
              Generate your first practice test in under a minute. Free, private, no signup.
            </p>
            <Button asChild size="lg" variant="secondary" className="gap-2">
              <Link href="/app">
                Start studying
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Separator />
    </PageTransition>
  )
}