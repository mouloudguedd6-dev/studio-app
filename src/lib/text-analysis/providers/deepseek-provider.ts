import { localTextAnalysisProvider } from "@/lib/text-analysis/providers/local-provider"
import type { TextAnalysisProvider } from "@/lib/text-analysis/types"

export const deepseekTextAnalysisProvider: TextAnalysisProvider = {
  name: "deepseek-placeholder",
  async analyze(input) {
    if (!process.env.DEEPSEEK_API_KEY) {
      return localTextAnalysisProvider.analyze(input)
    }

    // Placeholder Bloc 4: no paid API call yet. A future DeepSeek adapter should
    // keep the same provider interface and persist the same analysis fields.
    return localTextAnalysisProvider.analyze(input)
  },
}
