import type {
  CompatibleInstrumental,
  TextAnalysisCandidate,
  TextAnalysisResult,
} from "@/lib/text-analysis/types"

export function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

export function serializeTextAnalysisField(value: unknown) {
  return JSON.stringify(value ?? [])
}

export function toSerializableAnalysis(analysis: {
  id: string
  provider: string
  themesJson: string
  moodJson: string
  energyScore: number
  lyricalScore: number
  punchlineScore: number
  hookScore: number
  daCompatibilityScore: number
  instrumentalCompatibilityScore: number
  globalScore: number
  summary: string
  strengthsJson: string
  weaknessesJson: string
  suggestedUse: string
  punchlineCandidatesJson: string
  hookCandidatesJson: string
  compatibleInstrumentalsJson: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: analysis.id,
    provider: analysis.provider,
    themes: parseJsonArray<string>(analysis.themesJson),
    mood: parseJsonArray<string>(analysis.moodJson),
    energyScore: analysis.energyScore,
    lyricalScore: analysis.lyricalScore,
    punchlineScore: analysis.punchlineScore,
    hookScore: analysis.hookScore,
    daCompatibilityScore: analysis.daCompatibilityScore,
    instrumentalCompatibilityScore: analysis.instrumentalCompatibilityScore,
    globalScore: analysis.globalScore,
    summary: analysis.summary,
    strengths: parseJsonArray<string>(analysis.strengthsJson),
    weaknesses: parseJsonArray<string>(analysis.weaknessesJson),
    suggestedUse: analysis.suggestedUse,
    punchlineCandidates: parseJsonArray<TextAnalysisCandidate>(analysis.punchlineCandidatesJson),
    hookCandidates: parseJsonArray<TextAnalysisCandidate>(analysis.hookCandidatesJson),
    compatibleInstrumentals: parseJsonArray<CompatibleInstrumental>(analysis.compatibleInstrumentalsJson),
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
  }
}

export function toTextAnalysisDbData(result: TextAnalysisResult) {
  return {
    provider: result.provider,
    themesJson: serializeTextAnalysisField(result.themes),
    moodJson: serializeTextAnalysisField(result.mood),
    energyScore: result.energyScore,
    lyricalScore: result.lyricalScore,
    punchlineScore: result.punchlineScore,
    hookScore: result.hookScore,
    daCompatibilityScore: result.daCompatibilityScore,
    instrumentalCompatibilityScore: result.instrumentalCompatibilityScore,
    globalScore: result.globalScore,
    summary: result.summary,
    strengthsJson: serializeTextAnalysisField(result.strengths),
    weaknessesJson: serializeTextAnalysisField(result.weaknesses),
    suggestedUse: result.suggestedUse,
    punchlineCandidatesJson: serializeTextAnalysisField(result.punchlineCandidates),
    hookCandidatesJson: serializeTextAnalysisField(result.hookCandidates),
    compatibleInstrumentalsJson: serializeTextAnalysisField(result.compatibleInstrumentals),
  }
}
