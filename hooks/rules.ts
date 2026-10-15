// Plain-text rules for Heron, kept free of `$` so they test on their own.

// Every reply that did work ends with this line (the output rules), so it marks
// an answer even in a session Heron never saw finish.
export const RECAP = '**In one line:**'

// Tool rows that carry something to read, never folded away.
export const KEEP_TOOLS = new Set(['ExitPlanMode', 'AskUserQuestion'])

// How much of each end of an answer its keys cover.
const EDGE = 160

const norm = (text: string) => text.replace(/\s+/g, ' ').trim()

// FNV-1a: a short, stable key for a piece of text.
export function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// Two keys per answer, one for its opening and one for its end, so a row the
// transcript draws a little differently (a hidden block at one end) still matches.
export function answerKeys(text: string): string[] {
  const t = norm(text)
  if (!t) return []
  return ['h' + hash(t.slice(0, EDGE)), 't' + hash(t.slice(-EDGE))]
}

// A reply's closing recap, split off: the text before it and the recap's words,
// without the label. Null when the reply has none.
export function splitRecap(text: string): { body: string; recap: string } | null {
  const at = text.lastIndexOf(RECAP)
  if (at < 0) return null
  const recap = text.slice(at + RECAP.length).trim()
  if (!recap) return null
  return { body: text.slice(0, at).trimEnd(), recap }
}

// Keys for a reply as stored and as drawn with its recap split off, so either matches.
export function replyKeys(text: string): string[] {
  const split = splitRecap(text)
  return [...new Set([...answerKeys(text), ...(split ? answerKeys(split.body) : [])])]
}

export function isFinal(text: string, finals: Record<string, true>): boolean {
  if (text.includes(RECAP)) return true
  return answerKeys(text).some(k => finals[k])
}

export function sameText(a: string | null, b: string): boolean {
  return a !== null && norm(a) === norm(b)
}

// The first line of `text` as plain words, cut to `width` columns.
export function oneLine(text: string, width: number): string {
  const first = text.split('\n').find(l => l.trim()) ?? ''
  const plain = first
    .replace(/^\s*(?:#+|[-*•>]|\d+\.)\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const room = Math.max(10, width)
  return plain.length > room ? plain.slice(0, room - 1).trimEnd() + '…' : plain
}

// What a tool call is doing, in a few words.
export function toolLine(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  const file = (k: string) => s(k).split('/').pop() || s(k)
  switch (tool) {
    case 'Bash':
      return s('description') || oneLine(s('command'), 80)
    case 'Read':
      return `Reading ${file('file_path')}`
    case 'Edit':
    case 'MultiEdit':
      return `Editing ${file('file_path')}`
    case 'Write':
      return `Writing ${file('file_path')}`
    case 'NotebookEdit':
      return `Editing ${file('notebook_path')}`
    case 'Grep':
      return `Searching for ${s('pattern')}`
    case 'Glob':
      return `Finding ${s('pattern')}`
    case 'Agent':
    case 'Task':
      return s('description') || 'Running an agent'
    case 'WebFetch':
      return `Fetching ${s('url')}`
    case 'WebSearch':
      return `Searching the web for ${s('query')}`
  }
  if (s('description')) return s('description')
  return tool.startsWith('mcp__') ? tool.slice(5).replace(/__/g, ' · ').replace(/_/g, ' ') : tool
}

// The text blocks of a stored row's content.
export function textBlocks(content: unknown): string[] {
  if (typeof content === 'string') return content.trim() ? [content] : []
  if (!Array.isArray(content)) return []
  const out: string[] = []
  for (const b of content as { type?: string; text?: unknown }[]) {
    if (b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push(b.text)
  }
  return out
}
