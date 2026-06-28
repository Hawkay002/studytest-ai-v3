import { useState } from "react"
import { Link, useLocation } from "wouter"
import {
  ArrowRight,
  BookOpen,
  History,
  KeyRound,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useApiKey } from "@/context/ApiKeyContext"
import { useTheme } from "@/context/ThemeContext"
import { useApiKeyModal } from "@/components/common/ApiKeyModal"

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/my-tests", label: "My Tests" },
  { href: "/history", label: "History" },
  { href: "/#how-it-works", label: "How it Works" },
]

export function Navbar() {
  const [location] = useLocation()
  const { isKeySet } = useApiKey()
  const { resolvedTheme, toggleTheme } = useTheme()
  const { open: openApiKey } = useApiKeyModal()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) => {
    // Anchor links (e.g. /#how-it-works) are jump-to-section links, not
    // pages — they have no "active" state. Home is active only on exactly "/".
    // This previously highlighted "How it Works" on every page because its
    // base path "/" matches every route via startsWith.
    if (href.includes("#")) return false
    if (href === "/") return location === "/"
    return location.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold tracking-tight"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="h-4.5 w-4.5" />
          </span>
          <span className="text-base">StudyTest AI</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Button
              key={link.label}
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                isActive(link.href) && "bg-accent text-accent-foreground",
              )}
            >
              {link.href.includes("#") ? (
                <a href={link.href}>{link.label}</a>
              ) : (
                <Link href={link.href}>{link.label}</Link>
              )}
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4.5 w-4.5" />
            ) : (
              <Moon className="h-4.5 w-4.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={openApiKey}
            className="gap-2"
          >
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline">API Key</span>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isKeySet ? "bg-green-500" : "bg-red-500",
              )}
              aria-label={isKeySet ? "Key set" : "No key set"}
            />
          </Button>

          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/app">
              Start Studying
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                {mobileOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[280px]">
              <div className="mt-2 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Button
                    key={link.label}
                    asChild
                    variant="ghost"
                    className="justify-start"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.href.includes("#") ? (
                      <a href={link.href}>{link.label}</a>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </Button>
                ))}
              </div>

              <Separator className="my-4" />

              <Button
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => {
                  setMobileOpen(false)
                  openApiKey()
                }}
              >
                <KeyRound className="h-4 w-4" />
                API Key
                <span
                  className={cn(
                    "ml-auto h-2 w-2 rounded-full",
                    isKeySet ? "bg-green-500" : "bg-red-500",
                  )}
                />
              </Button>

              <Button
                variant="ghost"
                className="mt-1 justify-start gap-2"
                onClick={toggleTheme}
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </Button>

              <Button asChild className="mt-4" onClick={() => setMobileOpen(false)}>
                <Link href="/app">
                  Start Studying
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

export { History }
