import { localTranscriptionProvider } from "./providers/local-provider"
import { mockTranscriptionProvider } from "./providers/mock-provider"
import { openaiTranscriptionProvider } from "./providers/openai-provider"
import type { TranscriptionProvider, TranscriptionProviderName } from "./types"

const providers: Record<TranscriptionProviderName, TranscriptionProvider> = {
  local: localTranscriptionProvider,
  openai: openaiTranscriptionProvider,
  mock: mockTranscriptionProvider,
}

export function getTranscriptionProvider() {
  const configuredProvider = (process.env.TRANSCRIPTION_PROVIDER || "local").toLowerCase()

  if (configuredProvider in providers) {
    return providers[configuredProvider as TranscriptionProviderName]
  }

  console.warn(
    `[transcription] Unknown TRANSCRIPTION_PROVIDER="${configuredProvider}". Falling back to local provider.`
  )

  return providers.local
}
