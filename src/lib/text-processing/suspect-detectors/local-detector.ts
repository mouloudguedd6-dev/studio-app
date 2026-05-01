import { getGlossaryTerms, normalizeTerm } from "../artist-glossary"
import type { SuspiciousWord } from "../clean-lyrics"
import type { SuspiciousWordsDetector } from "./types"

const SAFE_WORDS = new Set([
  "alors",
  "apres",
  "avant",
  "avec",
  "because",
  "besoin",
  "bien",
  "celle",
  "celles",
  "celui",
  "ceux",
  "comme",
  "comment",
  "dans",
  "depuis",
  "dieu",
  "elles",
  "elle",
  "encore",
  "entre",
  "faire",
  "faudrait",
  "flow",
  "game",
  "gros",
  "hungry",
  "ils",
  "jamais",
  "jamais",
  "juste",
  "limite",
  "maison",
  "maintenant",
  "mais",
  "merde",
  "mieux",
  "money",
  "okay",
  "parce",
  "petit",
  "peut",
  "plus",
  "pour",
  "putain",
  "quand",
  "quoi",
  "sans",
  "selim",
  "tous",
  "tout",
  "toute",
  "toutes",
  "toujours",
  "truc",
  "venir",
  "vraiment",
  "voila",
  "wallah",
  "yeah",
])

const KNOWN_TRANSCRIPTION_ARTIFACTS = new Set([
  "apreuse",
  "chande",
  "fleumite",
  "monate",
])

function getTokenCandidates(text: string) {
  return text.match(/[\p{L}][\p{L}’'-]*/gu) || []
}

function isNearGlossaryTerm(term: string, glossaryTerms: string[]) {
  const normalized = normalizeTerm(term)
  if (!normalized || normalized.length < 4) return null

  for (const glossaryTerm of glossaryTerms) {
    const normalizedGlossaryTerm = normalizeTerm(glossaryTerm)
    if (normalized === normalizedGlossaryTerm) return null

    const firstLetterMatches = normalized[0] === normalizedGlossaryTerm[0]
    const closeLength = Math.abs(normalized.length - normalizedGlossaryTerm.length) <= 3
    const sharedPrefix = normalized.slice(0, 2) === normalizedGlossaryTerm.slice(0, 2)
    const containsCore =
      normalizedGlossaryTerm.length >= 4 &&
      (normalized.includes(normalizedGlossaryTerm.slice(0, 4)) ||
        normalizedGlossaryTerm.includes(normalized.slice(0, 4)))

    if (firstLetterMatches && closeLength && (sharedPrefix || containsCore)) {
      return glossaryTerm
    }
  }

  return null
}

function hasSuspiciousShape(normalized: string) {
  return (
    normalized.length >= 15 ||
    /([a-z])\1{3,}/i.test(normalized) ||
    /[bcdfghjklmnpqrstvwxz]{6,}/i.test(normalized) ||
    /[aeiouy]{5,}/i.test(normalized)
  )
}

function looksLikeRareTranscriptionArtifact(normalized: string) {
  const oddEndings = /(umite|onite|eumite|fleumite|ard|apreuse)$/
  return (
    KNOWN_TRANSCRIPTION_ARTIFACTS.has(normalized) ||
    (normalized.length >= 8 && oddEndings.test(normalized) && !SAFE_WORDS.has(normalized))
  )
}

export const localSuspiciousWordsDetector: SuspiciousWordsDetector = {
  name: "local-rules-v0",
  detect({ text, glossary, validatedTerms = [] }) {
    const seen = new Map<string, SuspiciousWord>()
    const glossaryTerms = getGlossaryTerms(glossary)
    const glossarySet = new Set(glossaryTerms.map(normalizeTerm))
    const validatedSet = new Set(validatedTerms.map(normalizeTerm))

    for (const token of getTokenCandidates(text)) {
      const cleanToken = token.replace(/^['’]+|['’]+$/g, "")
      const normalized = normalizeTerm(cleanToken)
      if (!normalized || normalized.length < 4) continue
      if (SAFE_WORDS.has(normalized) || glossarySet.has(normalized) || validatedSet.has(normalized)) continue

      const suggestion = isNearGlossaryTerm(cleanToken, glossaryTerms)
      let suspiciousWord: SuspiciousWord | null = null

      if (suggestion) {
        suspiciousWord = {
          term: cleanToken,
          reason: "Proche d'une entrée du glossaire",
          suggestion,
        }
      } else if (hasSuspiciousShape(normalized)) {
        suspiciousWord = {
          term: cleanToken,
          reason: "Forme inhabituelle, possible erreur de transcription",
        }
      } else if (looksLikeRareTranscriptionArtifact(normalized)) {
        suspiciousWord = {
          term: cleanToken,
          reason: "Mot rare ou incohérent à vérifier",
        }
      }

      if (suspiciousWord) {
        seen.set(normalized, suspiciousWord)
      }
    }

    return Array.from(seen.values())
  },
}
