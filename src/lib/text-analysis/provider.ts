import { deepseekTextAnalysisProvider } from "@/lib/text-analysis/providers/deepseek-provider"
import { localTextAnalysisProvider } from "@/lib/text-analysis/providers/local-provider"
import { mockTextAnalysisProvider } from "@/lib/text-analysis/providers/mock-provider"
import { openaiTextAnalysisProvider } from "@/lib/text-analysis/providers/openai-provider"
import type { TextAnalysisInput, TextAnalysisResult } from "@/lib/text-analysis/types"

function getTextAnalysisProvider() {
  const providerName = (process.env.AI_PROVIDER || "local").toLowerCase()

  if (providerName === "mock") return mockTextAnalysisProvider
  if (providerName === "openai") return openaiTextAnalysisProvider
  if (providerName === "deepseek") return deepseekTextAnalysisProvider

  return localTextAnalysisProvider
}

export async function analyzeTextWithProvider(input: TextAnalysisInput): Promise<TextAnalysisResult> {
  const provider = getTextAnalysisProvider()
  const result = await provider.analyze(input)

  return {
    ...result,
    provider: provider.name,
  }
}
