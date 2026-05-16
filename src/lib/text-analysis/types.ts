import type { ArtistDAContext } from "@/lib/artist-da-context"

export type SuggestedUse = "couplet" | "refrain" | "intro" | "pont" | "outro" | "freestyle" | "à retravailler"

export type TextAnalysisCandidate = {
  text: string
  reason: string
  score: number
  timecode: number | null
}

export type CompatibleInstrumental = {
  instrumentalId: string
  title: string
  score: number
  reason: string
  mood: string | null
  style: string | null
  bpm: number | null
  rightsStatus: string
}

export type TextAnalysisInput = {
  text: string
  segments: Array<{
    text: string
    startTime: number
    endTime: number
  }>
  artistDA: ArtistDAContext
}

export type TextAnalysisResult = {
  provider: string
  themes: string[]
  mood: string[]
  energyScore: number
  lyricalScore: number
  punchlineScore: number
  hookScore: number
  daCompatibilityScore: number
  instrumentalCompatibilityScore: number
  globalScore: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestedUse: SuggestedUse
  punchlineCandidates: TextAnalysisCandidate[]
  hookCandidates: TextAnalysisCandidate[]
  compatibleInstrumentals: CompatibleInstrumental[]
}

export type TextAnalysisProvider = {
  name: string
  analyze(input: TextAnalysisInput): Promise<TextAnalysisResult>
}
