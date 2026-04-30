import type { TranscriptionProvider } from "../types"

export const mockTranscriptionProvider: TranscriptionProvider = {
  name: "mock",
  async transcribe({ onProgress }) {
    await onProgress?.({ progress: 80, message: "mock transcription" })

    const rawText = [
      "[SIMULATION - TRANSCRIPTION_PROVIDER=mock]",
      "",
      "Ceci est une transcription simulee pour tester le pipeline.",
      "Le mode mock doit rester reserve au dev et aux tests.",
      "",
      "Ouais c'est pour la V1, on teste le systeme",
      "La machine est pleine, les mots s'alignent",
      "L'inspi monte, pas besoin de theme",
      "On construit le son depuis la base",
    ].join("\n")

    return {
      rawText,
      provider: "mock",
      model: "mock",
      warnings: ["Mock transcription provider was used."],
      segments: [
        { text: "[SIMULATION] Ouais c'est pour la V1, on teste le systeme", startTime: 0.5, endTime: 3.0 },
        { text: "[SIMULATION] La machine est pleine, les mots s'alignent", startTime: 3.5, endTime: 7.0 },
        { text: "[SIMULATION] L'inspi monte, pas besoin de theme", startTime: 7.5, endTime: 11.0 },
        { text: "[SIMULATION] On construit le son depuis la base", startTime: 11.5, endTime: 14.0 },
      ],
    }
  },
}
