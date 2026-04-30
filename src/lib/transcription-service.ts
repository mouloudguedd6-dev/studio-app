import fs from "fs"
import fsPromises from "fs/promises"
import { prisma } from "@/lib/prisma"
import { StorageService } from "@/lib/storage"
import { getTranscriptionProvider } from "@/lib/transcription/provider"
import type { TranscriptionResult } from "@/lib/transcription/types"

export const TranscriptionJobStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const

type TranscriptionJobStatusValue =
  (typeof TranscriptionJobStatus)[keyof typeof TranscriptionJobStatus]

const globalForWorker = globalThis as unknown as {
  transcriptionWorkerRunning?: boolean
  transcriptionWorkerScheduled?: boolean
}

export async function createTranscriptionJob(audioId: string, userId: string, options: { force?: boolean } = {}) {
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

  if (audio.status === "transcribed" && !options.force) {
    throw new Error("Already transcribed")
  }

  const existingJob = audio.transcriptionJobs[0]
  if (existingJob) {
    startTranscriptionWorker()
    return existingJob
  }

  const job = await prisma.$transaction(async (tx) => {
    if (options.force) {
      await tx.transcriptionJob.updateMany({
        where: {
          audioId: audio.id,
          status: {
            in: [TranscriptionJobStatus.PENDING, TranscriptionJobStatus.PROCESSING],
          },
        },
        data: {
          status: TranscriptionJobStatus.FAILED,
          progress: 100,
          error: "Cancelled by retranscription request.",
        },
      })
    }

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

  try {
    await updateJob(job.id, TranscriptionJobStatus.PROCESSING, 1)

    if (!fs.existsSync(sourceFile)) {
      throw new Error("Source audio file not found on disk")
    }

    const provider = getTranscriptionProvider()
    const startedAt = Date.now()

    console.info("[transcription] job started", {
      jobId: job.id,
      audioId: job.audioId,
      provider: provider.name,
      model: process.env.WHISPER_MODEL || "small",
      sourceFile,
    })

    let lastPersistedProgress = 1
    let lastProgressWriteAt = 0

    const result = await provider.transcribe({
      jobId: job.id,
      sourceFile,
      onProgress: async ({ progress, message }) => {
        const now = Date.now()
        const shouldPersist =
          progress >= 95 ||
          progress - lastPersistedProgress >= 2 ||
          now - lastProgressWriteAt > 3000

        if (!shouldPersist) return

        lastPersistedProgress = progress
        lastProgressWriteAt = now
        await updateJob(job.id, TranscriptionJobStatus.PROCESSING, progress, message || null)
      },
    })

    if (result.segments.length === 0 && !result.rawText.trim()) {
      throw new Error("Transcription produced no text")
    }

    await persistTranscription(job.audioId, result)

    await prisma.$transaction([
      prisma.audioRecord.update({
        where: { id: job.audioId },
        data: { status: "transcribed" },
      }),
      prisma.transcriptionJob.update({
        where: { id: job.id },
        data: {
          status: TranscriptionJobStatus.DONE,
          progress: 100,
          error: result.warnings.length > 0 ? result.warnings.join("\n") : null,
        },
      }),
    ])

    console.info("[transcription] job done", {
      jobId: job.id,
      provider: result.provider,
      model: result.model,
      segments: result.segments.length,
      elapsedMs: Date.now() - startedAt,
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
    await fsPromises.rm("tmp_transcribe", { recursive: true, force: true }).catch(() => {})
  }
}

async function persistTranscription(audioId: string, result: TranscriptionResult) {
  await prisma.$transaction(async (tx) => {
    await tx.transcription.deleteMany({ where: { audioRecordId: audioId } })

    await tx.transcription.create({
      data: {
        audioRecordId: audioId,
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
  })
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
