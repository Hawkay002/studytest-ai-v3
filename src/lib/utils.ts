import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate an RFC 4122 v4 UUID.
 *
 * crypto.randomUUID() is only available in SECURE contexts (HTTPS or
 * localhost). When the app is served over plain HTTP on a LAN IP — e.g.
 * testing from a phone at http://192.168.x.x:6969 — it is undefined and
 * throws "crypto.randomUUID is not a function", crashing test generation.
 *
 * crypto.getRandomValues(), by contrast, is the one Web Crypto function that
 * works in insecure contexts, so we build a v4 UUID from it when randomUUID
 * isn't available. As a last resort (no Web Crypto at all) we fall back to
 * Math.random — these IDs only need to be unique, not cryptographically secure.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 from getRandomValues, available in insecure contexts.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`
  }
  // No Web Crypto at all (very old runtime). Non-crypto fallback.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
