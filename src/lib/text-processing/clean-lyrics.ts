import { getArtistGlossary, normalizeTerm, type GlossaryEntry } from "./artist-glossary"
import { getSuspiciousWordsDetector } from "./suspect-detectors"

export type TextSegmentInput = {
  text: string
  startTime?: number
  endTime?: number
}

export type SuspiciousWord = {
  term: string
  reason: string
  suggestion?: string
}

export type CleanLyricsResult = {
  cleanText: string
  lyricsText: string
  suspiciousWords: SuspiciousWord[]
}

type CleanLyricsOptions = {
  glossary?: GlossaryEntry[]
  validatedTerms?: string[]
}

const CONTRACTIONS: Array<[RegExp, string]> = [
  [/\b[Jj]parle\b/g, "j’parle"],
  [/\b[Jj]suis\b/g, "j’suis"],
  [/\b[Jj]vais\b/g, "j’vais"],
  [/\b[Jj]veux\b/g, "j’veux"],
  [/\b[Jj]peux\b/g, "j’peux"],
  [/\b[Jj]dois\b/g, "j’dois"],
  [/\b[Jj]me\b/g, "j’me"],
  [/\b[Jj]te\b/g, "j’te"],
  [/\b[Jj]les\b/g, "j’les"],
  [/\b[Jj]ai\b/g, "j’ai"],
  [/\b[Jj]etais\b/g, "j’étais"],
  [/\b[Jj]étais\b/g, "j’étais"],
  [/\b[Mm]a\b/g, "m’a"],
  [/\b[Tt]a\b/g, "t’a"],
  [/\b[Cc]est\b/g, "c’est"],
  [/\b[Qq]uest\b/g, "qu’est"],
]

function normalizeSpacing(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])([^\s,.;:!?])/g, "$1 $2")
    .trim()
}

function applyContractions(text: string) {
  return CONTRACTIONS.reduce((nextText, [pattern, replacement]) => nextText.replace(pattern, replacement), text)
}

function capitalizeSentences(text: string) {
  return text.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, prefix: string, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`
  })
}

function addLightPunctuation(text: string) {
  let nextText = text
    .replace(/\b(gros|frere|frère|wallah|wesh)\b/gi, ", $1,")
    .replace(/,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()

  if (nextText && !/[.!?…]$/.test(nextText)) {
    nextText += "."
  }

  return nextText
}

export function generateCleanText(rawText: string) {
  const normalized = normalizeSpacing(rawText.replace(/[’`]/g, "'"))
  return capitalizeSentences(addLightPunctuation(applyContractions(normalized)))
}

function splitLongLine(line: string) {
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length <= 10) return [line]

  const lines: string[] = []
  let current: string[] = []

  for (const word of words) {
    current.push(word)

    if (current.length >= 8 && /[,.;:!?…]$/.test(word)) {
      lines.push(current.join(" "))
      current = []
    } else if (current.length >= 11) {
      lines.push(current.join(" "))
      current = []
    }
  }

  if (current.length > 0) lines.push(current.join(" "))
  return lines
}

export function generateLyricsText(cleanText: string, segments: TextSegmentInput[] = []) {
  const sourceLines = segments.length > 0
    ? segments.map((segment) => generateCleanText(segment.text))
    : cleanText.split(/(?<=[.!?…])\s+/)

  const lines = sourceLines
    .flatMap((line) => splitLongLine(line.trim()))
    .map((line) => line.replace(/\.$/, "").trim())
    .filter(Boolean)

  return lines.join("\n")
}

export function detectSuspiciousWords(text: string, options: CleanLyricsOptions = {}) {
  return getSuspiciousWordsDetector().detect({
    text,
    glossary: options.glossary || getArtistGlossary(),
    validatedTerms: options.validatedTerms || [],
  })
}

export function generateCleanLyrics(
  rawText: string,
  segments: TextSegmentInput[] = [],
  options: CleanLyricsOptions = {}
): CleanLyricsResult {
  const cleanText = generateCleanText(rawText)
  const lyricsText = generateLyricsText(cleanText, segments)
  const suspiciousWords = detectSuspiciousWords(`${rawText}\n${cleanText}\n${lyricsText}`, options)

  return {
    cleanText,
    lyricsText,
    suspiciousWords,
  }
}

export function serializeValidatedWords(words: string[]) {
  return JSON.stringify(Array.from(new Set(words.map(normalizeTerm).filter(Boolean))))
}

export function parseValidatedWords(value?: string | null): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

export function removeSuspiciousTerm(words: SuspiciousWord[], term: string) {
  const normalizedTerm = normalizeTerm(term)
  return words.filter((word) => normalizeTerm(word.term) !== normalizedTerm)
}

export function serializeSuspiciousWords(words: SuspiciousWord[]) {
  return JSON.stringify(words)
}

export function parseSuspiciousWords(value?: string | null): SuspiciousWord[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is SuspiciousWord => {
        return item && typeof item.term === "string" && typeof item.reason === "string"
      })
      .map((item) => ({
        term: item.term,
        reason: item.reason,
        suggestion: typeof item.suggestion === "string" ? item.suggestion : undefined,
      }))
  } catch {
    return []
  }
}
