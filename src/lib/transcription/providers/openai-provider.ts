import FormData from "form-data"
import fs from "fs"
import fsPromises from "fs/promises"
import https from "https"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { probeAudioDurationSeconds } from "@/lib/audio-metadata"
import type { TranscriptionProvider, TranscriptionResult, TranscriptionSegment } from "../types"

const execFileAsync = promisify(execFile)

const TEMP_ROOT = path.join(process.cwd(), "tmp_transcribe_openai")
const CHUNK_DURATION_SEC = 600
const CHUNK_MAX_RETRIES = 3

type WhisperSegment = {
  text?: string
  start?: number
  end?: number
}

type WhisperResponse = {
  text?: string
  segments?: WhisperSegment[]
}

export const openaiTranscriptionProvider: TranscriptionProvider = {
  name: "openai",
  async transcribe({ sourceFile, jobId, onProgress }): Promise<TranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when TRANSCRIPTION_PROVIDER=openai")
    }

    const startedAt = Date.now()
    const tempDir = path.join(TEMP_ROOT, jobId)
    console.info("[transcription:openai] start", { sourceFile })

    try {
      const duration = await probeAudioDurationSeconds(sourceFile)
      if (!duration) throw new Error("Could not determine audio duration with ffprobe")

      await fsPromises.mkdir(tempDir, { recursive: true })

      const chunkCount = Math.max(1, Math.ceil(duration / CHUNK_DURATION_SEC))
      const allTexts: string[] = []
      const allSegments: TranscriptionSegment[] = []
      const warnings: string[] = []

      for (let index = 0; index < chunkCount; index++) {
        const startSec = index * CHUNK_DURATION_SEC
        const chunkDuration = Math.min(CHUNK_DURATION_SEC, duration - startSec)
        const chunkFile = path.join(tempDir, `chunk_${index}.mp3`)

        await extractAudioChunk(sourceFile, chunkFile, startSec, chunkDuration)

        try {
          const result = await withRetry(
            () => transcribeChunkWithWhisper(chunkFile, apiKey, startSec),
            CHUNK_MAX_RETRIES,
            `chunk ${index + 1}/${chunkCount}`
          )

          allTexts.push(result.text)
          allSegments.push(...result.segments)
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown chunk error"
          const warning = `Chunk ${index + 1} failed after retries: ${message}`
          console.error("[transcription:openai]", warning)
          warnings.push(warning)
          allTexts.push(`[Erreur transcription chunk ${index + 1}]`)
        } finally {
          await fsPromises.unlink(chunkFile).catch(() => {})
        }

        const progress = Math.min(95, Math.round(((index + 1) / chunkCount) * 95))
        await onProgress?.({ progress, message: `openai chunk ${index + 1}/${chunkCount}` })
      }

      console.info("[transcription:openai] done", {
        segments: allSegments.length,
        elapsedMs: Date.now() - startedAt,
      })

      return {
        rawText: allTexts.join("\n\n"),
        segments: allSegments,
        warnings,
        provider: "openai",
        model: "whisper-1",
      }
    } finally {
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  },
}

async function extractAudioChunk(sourceFile: string, chunkFile: string, startSec: number, durationSec: number) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    String(startSec),
    "-t",
    String(durationSec),
    "-i",
    sourceFile,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    chunkFile,
  ])
}

async function transcribeChunkWithWhisper(
  filePath: string,
  apiKey: string,
  timeOffset: number
): Promise<{ text: string; segments: TranscriptionSegment[] }> {
  const data = await postWhisperMultipart(filePath, apiKey)

  return {
    text: data.text || "",
    segments: (data.segments || [])
      .filter((segment) => segment.text && typeof segment.start === "number" && typeof segment.end === "number")
      .map((segment) => ({
        text: segment.text!.trim(),
        startTime: segment.start! + timeOffset,
        endTime: segment.end! + timeOffset,
      })),
  }
}

function postWhisperMultipart(filePath: string, apiKey: string): Promise<WhisperResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append("file", fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: "audio/mpeg",
    })
    form.append("model", "whisper-1")
    form.append("response_format", "verbose_json")
    form.append("language", "fr")

    const request = https.request(
      {
        method: "POST",
        host: "api.openai.com",
        path: "/v1/audio/transcriptions",
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (response) => {
        const chunks: Buffer[] = []

        response.on("data", (chunk: Buffer) => chunks.push(chunk))
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8")

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Whisper API error ${response.statusCode}: ${body}`))
            return
          }

          try {
            resolve(JSON.parse(body) as WhisperResponse)
          } catch {
            reject(new Error("Whisper returned invalid JSON"))
          }
        })
      }
    )

    request.on("error", reject)
    form.on("error", reject)
    form.pipe(request)
  })
}

async function withRetry<T>(task: () => Promise<T>, maxAttempts: number, label: string): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      console.warn(`[transcription:openai] ${label} attempt ${attempt}/${maxAttempts} failed:`, error)

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Transcription ${label} failed`)
}
