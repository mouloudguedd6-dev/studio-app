import type { GlossaryEntry } from "../artist-glossary"
import type { SuspiciousWord } from "../clean-lyrics"

export type SuspiciousWordsDetectorInput = {
  text: string
  glossary: GlossaryEntry[]
  validatedTerms?: string[]
}

export type SuspiciousWordsDetector = {
  name: string
  detect(input: SuspiciousWordsDetectorInput): SuspiciousWord[]
}
