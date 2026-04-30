import FormData from "form-data"
import fs from "fs"
import fsPromises from "fs/promises"
import https from "https"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { prisma } from "@/lib/prisma"
import { StorageService } from "@/lib/storage"
import { probeAudioDurationSeconds } from "@/lib/audio-metadata"

const execFileAsync = promisify(execFile)

const TEMP_ROOT = path.join(process.cwd(), "tmp_transcribe")
const CHUNK_DURATION_SEC = 600
const CHUNK_MAX_RETRIES = 3

export const TranscriptionJobStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const

type TranscriptionJobStatusValue =
  (typeof TranscriptionJobStatus)[keyof typeof TranscriptionJobStatus]

type SegmentData = {
  text: string
  startTime: number
  endTime: number
}

type WhisperSegment = {
  text?: string
  start?: number
  end?: number
}

type WhisperResponse = {
  text?: string
  segments?: WhisperSegment[]
}

type JobResult = {
  rawText: string
  segments: SegmentData[]
  warnings: string[]
  usedFallback: boolean
}

const globalForWorker = globalThis as unknown as {
  transcriptionWorkerRunning?: boolean
  transcriptionWorkerScheduled?: boolean
}

export async function createTranscriptionJob(audioId: string, userId: string) {
  const audio = await prisma.audioRecord.findFirst({
    where: { id: audioId, userId },
    include: {
      transcriptionJobs: {
        where: {
          status: {
            in: [TranscriptionJobStatus.PENDING, TranscriptionJobStatus.PROCESSING],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  })

  if (!audio) {
    throw new Error("Audio not found")
  }

  if (audio.status === "transcribed") {
    throw new Error("Already transcribed")
  }

  const existingJob = audio.transcriptionJobs[0]
  if (existingJob) {
    startTranscriptionWorker()
    return existingJob
  }

  const job = await prisma.$transaction(async (tx) => {
    const createdJob = await tx.transcriptionJob.create({
      data: {
        audioId: audio.id,
        status: TranscriptionJobStatus.PENDING,
        progress: 0,
      },
    })

    await tx.audioRecord.update({
      where: { id: audio.id },
      data: { status: "transcribing" },
    })

    return createdJob
  })

  startTranscriptionWorker()
  return job
}

export function startTranscriptionWorker() {
  if (globalForWorker.transcriptionWorkerRunning || globalForWorker.transcriptionWorkerScheduled) {
    return
  }

  globalForWorker.transcriptionWorkerScheduled = true

  // Keep the route response non-blocking: the worker continues after POST /api/transcribe returns.
  setImmediate(async () => {
    globalForWorker.transcriptionWorkerScheduled = false
    globalForWorker.transcriptionWorkerRunning = true

    try {
      await runPendingJobs()
    } finally {
      globalForWorker.transcriptionWorkerRunning = false
    }
  })
}

async function runPendingJobs() {
  while (true) {
    // The worker drains only queued jobs, then exits. It never polls on a timer.
    const job = await prisma.transcriptionJob.findFirst({
      where: { status: TranscriptionJobStatus.PENDING },
      orderBy: { createdAt: "asc" },
    })

    if (!job) return
    await processTranscriptionJob(job.id)
  }
}

async function processTranscriptionJob(jobId: string) {
  const job = await prisma.transcriptionJob.findUnique({
    where: { id: jobId },
    include: { audio: true },
  })

  if (!job || job.status === TranscriptionJobStatus.DONE) return

  const sourceFile = StorageService.getPath(job.audio.filePath)
  const tempDir = path.join(TEMP_ROOT, job.id)

  try {
    await updateJob(job.id, TranscriptionJobStatus.PROCESSING, 1)

    if (!fs.existsSync(sourceFile)) {
      throw new Error("Source audio file not found on disk")
    }

    const result = await transcribeAudioToSegments(job.id, sourceFile, tempDir)

    if (result.segments.length === 0 && !result.rawText.trim()) {
      throw new Error("Transcription produced no text")
    }

    await prisma.$transaction(async (tx) => {
      await tx.transcription.deleteMany({ where: { audioRecordId: job.audioId } })

      await tx.transcription.create({
        data: {
          audioRecordId: job.audioId,
          rawText: result.rawText,
          cleanText: result.rawText,
          segments: {
            create: result.segments.map((segment) => ({
              text: segment.text,
              startTime: segment.startTime,
              endTime: segment.endTime,
            })),
          },
        },
      })

      await tx.audioRecord.update({
        where: { id: job.audioId },
        data: { status: "transcribed" },
      })

      await tx.transcriptionJob.update({
        where: { id: job.id },
        data: {
          status: TranscriptionJobStatus.DONE,
          progress: 100,
          error: result.warnings.length > 0 ? result.warnings.join("\n") : null,
        },
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed"
    console.error(`Transcription job ${job.id} failed:`, error)

    await prisma.$transaction([
      prisma.audioRecord.update({
        where: { id: job.audioId },
        data: { status: "error" },
      }),
      prisma.transcriptionJob.update({
        where: { id: job.id },
        data: {
          status: TranscriptionJobStatus.FAILED,
          progress: 100,
          error: message,
        },
      }),
    ])
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function transcribeAudioToSegments(
  jobId: string,
  sourceFile: string,
  tempDir: string
): Promise<JobResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    await updateJob(jobId, TranscriptionJobStatus.PROCESSING, 80)
    return createFallbackTranscription()
  }

  const duration = await probeAudioDurationSeconds(sourceFile)
  if (!duration) {
    throw new Error("Could not determine audio duration with ffprobe")
  }

  await fsPromises.mkdir(tempDir, { recursive: true })

  const chunkCount = Math.max(1, Math.ceil(duration / CHUNK_DURATION_SEC))
  const allTexts: string[] = []
  const allSegments: SegmentData[] = []
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
      console.error(warning)
      warnings.push(warning)
      allTexts.push(`[Erreur transcription chunk ${index + 1}]`)
    } finally {
      await fsPromises.unlink(chunkFile).catch(() => {})
    }

    // Reserve the last 5% for DB persistence, so the UI does not show 100 before data exists.
    const progress = Math.min(95, Math.round(((index + 1) / chunkCount) * 95))
    await updateJob(jobId, TranscriptionJobStatus.PROCESSING, progress, warnings.join("\n") || null)
  }

  return {
    rawText: allTexts.join("\n\n"),
    segments: allSegments,
    warnings,
    usedFallback: false,
  }
}

async function extractAudioChunk(
  sourceFile: string,
  chunkFile: string,
  startSec: number,
  durationSec: number
) {
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
): Promise<{ text: string; segments: SegmentData[] }> {
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

async function withRetry<T>(
  task: () => Promise<T>,
  maxAttempts: number,
  label: string
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      console.warn(`Transcription ${label} attempt ${attempt}/${maxAttempts} failed:`, error)

      if (attempt < maxAttempts) {
        await wait(1000 * attempt)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Transcription ${label} failed`)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function updateJob(
  jobId: string,
  status: TranscriptionJobStatusValue,
  progress: number,
  error?: string | null
) {
  await prisma.transcriptionJob.update({
    where: { id: jobId },
    data: {
      status,
      progress: Math.max(0, Math.min(100, progress)),
      ...(error !== undefined ? { error } : {}),
    },
  })
}

function createFallbackTranscription(): JobResult {
  const rawText = [
    "[SIMULATION - Aucune cle OPENAI_API_KEY configuree]",
    "",
    "Ceci est une transcription simulee pour tester le pipeline asynchrone.",
    "Ajoutez OPENAI_API_KEY dans votre fichier .env pour activer Whisper reel.",
    "",
    "Exemple de contenu:",
    "Ouais c'est pour la V1, on teste le systeme",
    "La machine est pleine, les mots s'alignent",
    "L'inspi monte, pas besoin de theme",
    "On construit le son depuis la base",
  ].join("\n")

  return {
    rawText,
    usedFallback: true,
    warnings: ["OPENAI_API_KEY missing: fallback transcription was used."],
    segments: [
      { text: "[SIMULATION] Ouais c'est pour la V1, on teste le systeme", startTime: 0.5, endTime: 3.0 },
      { text: "[SIMULATION] La machine est pleine, les mots s'alignent", startTime: 3.5, endTime: 7.0 },
      { text: "[SIMULATION] L'inspi monte, pas besoin de theme", startTime: 7.5, endTime: 11.0 },
      { text: "[SIMULATION] On construit le son depuis la base", startTime: 11.5, endTime: 14.0 },
    ],
  }
}
