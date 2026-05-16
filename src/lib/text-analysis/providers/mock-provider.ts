import { localTextAnalysisProvider } from "@/lib/text-analysis/providers/local-provider"
import type { TextAnalysisProvider } from "@/lib/text-analysis/types"

export const mockTextAnalysisProvider: TextAnalysisProvider = {
  name: "mock",
  analyze(input) {
    return localTextAnalysisProvider.analyze(input)
  },
}
