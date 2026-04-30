export type TranscriptionProviderName = "local" | "openai" | "mock"

export type TranscriptionSegment = {
  text: string
  startTime: number
  endTime: number
  confidence?: number | null
  avgLogProb?: number | null
  noSpeechProb?: number | null
}

export type TranscriptionResult = {
  rawText: string
  segments: TranscriptionSegment[]
  warnings: string[]
  provider: TranscriptionProviderName
  model?: string
}

export type TranscriptionProgress = {
  progress: number
  message?: string
}

export type TranscriptionProviderContext = {
  sourceFile: string
  jobId: string
  onProgress?: (progress: TranscriptionProgress) => Promise<void>
}

export type TranscriptionProvider = {
  name: TranscriptionProviderName
  transcribe: (context: TranscriptionProviderContext) => Promise<TranscriptionResult>
}
