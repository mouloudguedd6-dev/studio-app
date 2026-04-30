import path from "path"
import { spawn } from "child_process"
import type { TranscriptionProvider, TranscriptionResult, TranscriptionSegment } from "../types"

type LocalWorkerResponse = {
  rawText?: string
  model?: string
  language?: string | null
  duration?: number | null
  segments?: Array<{
    text?: string
    startTime?: number
    endTime?: number
    confidence?: number | null
    avgLogProb?: number | null
    noSpeechProb?: number | null
  }>
}

export const localTranscriptionProvider: TranscriptionProvider = {
  name: "local",
  async transcribe({ sourceFile, onProgress }): Promise<TranscriptionResult> {
    const startedAt = Date.now()
    const pythonBin = process.env.TRANSCRIPTION_PYTHON_BIN || "python3"
    const model = process.env.WHISPER_MODEL || "small"
    const language = process.env.WHISPER_LANGUAGE || "fr"
    const device = process.env.WHISPER_DEVICE || "cpu"
    const computeType = process.env.WHISPER_COMPUTE_TYPE || "int8"
    const workerPath = path.join(process.cwd(), "workers/transcription/transcribe.py")

    console.info("[transcription:local] start", {
      model,
      language,
      device,
      computeType,
      sourceFile,
    })

    await onProgress?.({ progress: 5, message: "local provider started" })

    const result = await runLocalWorker({
      pythonBin,
      workerPath,
      sourceFile,
      model,
      language,
      device,
      computeType,
      onProgress,
    })

    console.info("[transcription:local] done", {
      model,
      segments: result.segments.length,
      elapsedMs: Date.now() - startedAt,
    })

    return result
  },
}

async function runLocalWorker({
  pythonBin,
  workerPath,
  sourceFile,
  model,
  language,
  device,
  computeType,
  onProgress,
}: {
  pythonBin: string
  workerPath: string
  sourceFile: string
  model: string
  language: string
  device: string
  computeType: string
  onProgress?: TranscriptionProvider["transcribe"] extends (arg: infer C) => Promise<unknown>
    ? C extends { onProgress?: infer P }
      ? P
      : never
    : never
}) {
  return new Promise<TranscriptionResult>((resolve, reject) => {
    const child = spawn(
      pythonBin,
      [
        workerPath,
        sourceFile,
        "--model",
        model,
        "--language",
        language,
        "--device",
        device,
        "--compute-type",
        computeType,
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      }
    )

    let stdout = ""
    let stderr = ""
    let stderrBuffer = ""

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
      stderrBuffer += chunk

      const lines = stderrBuffer.split(/\r?\n/)
      stderrBuffer = lines.pop() || ""

      for (const line of lines) {
        handleWorkerLogLine(line, onProgress)
      }
    })

    child.on("error", (error) => {
      reject(new Error(`Unable to start local transcription worker: ${error.message}`))
    })

    child.on("close", (code) => {
      if (stderrBuffer) {
        handleWorkerLogLine(stderrBuffer, onProgress)
      }

      if (code !== 0) {
        reject(new Error(`Local transcription worker failed with code ${code}: ${stderr.trim()}`))
        return
      }

      try {
        const parsed = JSON.parse(stdout) as LocalWorkerResponse
        const segments = normalizeLocalSegments(parsed.segments || [])
        const rawText = parsed.rawText || segments.map((segment) => segment.text).join("\n")

        resolve({
          rawText,
          segments,
          warnings: [],
          provider: "local",
          model: parsed.model || model,
        })
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Invalid local transcription JSON"))
      }
    })
  })
}

function handleWorkerLogLine(
  line: string,
  onProgress?: (progress: { progress: number; message?: string }) => Promise<void>
) {
  if (!line.trim()) return

  if (line.startsWith("PROGRESS ")) {
    try {
      const payload = JSON.parse(line.slice("PROGRESS ".length)) as { progress?: number; message?: string }
      if (typeof payload.progress === "number") {
        void onProgress?.({
          progress: Math.max(5, Math.min(95, Math.round(payload.progress))),
          message: payload.message,
        })
      }
    } catch {
      console.warn("[transcription:local] invalid progress line", line)
    }
    return
  }

  console.info("[transcription:local]", line)
}

function normalizeLocalSegments(segments: LocalWorkerResponse["segments"]): TranscriptionSegment[] {
  return (segments || [])
    .filter((segment) => segment.text && typeof segment.startTime === "number" && typeof segment.endTime === "number")
    .map((segment) => ({
      text: segment.text!.trim(),
      startTime: segment.startTime!,
      endTime: segment.endTime!,
      confidence: segment.confidence ?? null,
      avgLogProb: segment.avgLogProb ?? null,
      noSpeechProb: segment.noSpeechProb ?? null,
    }))
}
