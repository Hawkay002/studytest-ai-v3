// Ambient declarations for mammoth's browser build, which ships without
// bundled TypeScript types. Only the surface we use is declared.
declare module "mammoth/mammoth.browser" {
  interface MammothResult {
    value: string
    messages: unknown[]
  }
  interface MammothOptions {
    arrayBuffer?: ArrayBuffer
  }
  export function extractRawText(
    options: MammothOptions,
  ): Promise<MammothResult>
}
