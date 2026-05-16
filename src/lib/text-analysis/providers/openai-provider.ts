import { localTextAnalysisProvider } from "@/lib/text-analysis/providers/local-provider"
import type { TextAnalysisProvider } from "@/lib/text-analysis/types"

export const openaiTextAnalysisProvider: TextAnalysisProvider = {
  name: "openai-placeholder",
  async analyze(input) {
    if (!process.env.OPENAI_API_KEY) {
      return localTextAnalysisProvider.analyze(input)
    }

    // Placeholder Bloc 4: no paid API call yet. The provider contract is ready
    // for a future implementation that returns the same TextAnalysisResult shape.
    return localTextAnalysisProvider.analyze(input)
  },
}
