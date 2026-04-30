import Busboy from "busboy"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { probeAudioDurationSeconds } from "@/lib/audio-metadata"
import { MAX_AUDIO_UPLOAD_BYTES, StorageService } from "@/lib/storage"
import { createHash } from "crypto"
import { Readable } from "stream"
import { pipeline } from "stream/promises"
import type { ReadableStream as NodeReadableStream } from "stream/web"

export const runtime = "nodejs"
export const maxDuration = 300

type UploadedAudio = {
  filename: string
  filepath: string
  originalName: string
  fileSize: number
  format: string
  mimeType: string
  checksum: string
  replaceAudioId?: string
}

class UploadError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
  }
}

export async function POST(request: Request) {
  let uploadedFile: UploadedAudio | null = null
  const uploadId = `${Date.now()}-${Math.round(Math.random() * 1e6)}`

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    console.info(`[upload:${uploadId}] upload started`, {
      userId: user.id,
      contentLength: request.headers.get("content-length"),
      contentType: request.headers.get("content-type"),
    })

    uploadedFile = await streamMultipartAudio(request, uploadId)
    const duration = await probeAudioDurationSeconds(uploadedFile.filepath)

    const replaceRecord = uploadedFile.replaceAudioId
      ? await prisma.audioRecord.findFirst({
          where: { id: uploadedFile.replaceAudioId, userId: user.id },
          include: { transcription: true },
        })
      : null

    if (uploadedFile.replaceAudioId && !replaceRecord) {
      await StorageService.remove(uploadedFile.filepath)
      uploadedFile = null
      return NextResponse.json({ error: "Audio to replace not found or access denied" }, { status: 404 })
    }

    try {
      const audioRecord = replaceRecord
        ? await prisma.$transaction(async (tx) => {
            await tx.transcription.deleteMany({ where: { audioRecordId: replaceRecord.id } })
            await tx.transcriptionJob.deleteMany({ where: { audioId: replaceRecord.id } })

            return tx.audioRecord.update({
              where: { id: replaceRecord.id },
              data: {
                title: uploadedFile!.originalName,
                filePath: uploadedFile!.filename,
                duration,
                fileSize: uploadedFile!.fileSize,
                mimeType: uploadedFile!.mimeType,
                format: uploadedFile!.format,
                checksum: uploadedFile!.checksum,
                status: "pending",
              },
            })
          })
        : await prisma.audioRecord.create({
            data: {
              userId: user.id,
              title: uploadedFile.originalName,
              filePath: uploadedFile.filename,
              duration,
              fileSize: uploadedFile.fileSize,
              mimeType: uploadedFile.mimeType,
              format: uploadedFile.format,
              checksum: uploadedFile.checksum,
              status: "pending",
            },
          })

      if (replaceRecord) {
        await StorageService.remove(replaceRecord.filePath)
      }

      console.info(`[upload:${uploadId}] db record created`, {
        audioId: audioRecord.id,
        filename: uploadedFile.filename,
        bytes: uploadedFile.fileSize,
        checksum: uploadedFile.checksum,
        replacedAudioId: replaceRecord?.id,
      })

      return NextResponse.json({
        success: true,
        audio: audioRecord,
        fileSizeMB: (uploadedFile.fileSize / 1024 / 1024).toFixed(1),
      })
    } catch (error) {
      // If the database write fails, do not leave an orphaned upload on disk.
      await StorageService.remove(uploadedFile.filepath)
      uploadedFile = null
      throw error
    }
  } catch (error) {
    if (uploadedFile) {
      await StorageService.remove(uploadedFile.filepath)
    }

    const status = error instanceof UploadError ? error.status : 500
    const message = getUploadErrorMessage(error)
    console.error(`[upload:${uploadId}] upload failed with reason:`, error)

    return NextResponse.json({ error: message }, { status })
  }
}

async function streamMultipartAudio(request: Request, uploadId: string): Promise<UploadedAudio> {
  const contentType = request.headers.get("content-type") || ""
  if (!contentType.includes("multipart/form-data")) {
    throw new UploadError("Expected multipart/form-data")
  }

  if (!request.body) {
    throw new UploadError("Missing request body")
  }

  await StorageService.ensureUploadDir()

  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(request.headers.entries())
    const busboy = Busboy({
      headers,
      limits: {
        files: 1,
        fileSize: MAX_AUDIO_UPLOAD_BYTES,
      },
    })

    let fileSeen = false
    let fileSettled = false
    let requestedTitle = ""
    let replaceAudioId = ""
    let storedFile: ReturnType<typeof StorageService.createStoredAudioFile> | null = null
    let fileWritePromise: Promise<UploadedAudio> | null = null
    let nodeStream: Readable | null = null

    const fail = (error: Error) => {
      if (fileSettled) return
      fileSettled = true

      nodeStream?.destroy()

      if (storedFile) {
        StorageService.remove(storedFile.filepath).catch(() => {})
      }

      reject(error)
    }

    busboy.on("file", (fieldname, file, info) => {
      if (fieldname !== "file") {
        file.resume()
        fail(new UploadError("Unexpected file field"))
        return
      }

      if (fileSeen) {
        file.resume()
        fail(new UploadError("Only one audio file can be uploaded"))
        return
      }

      fileSeen = true

      if (!info.filename) {
        file.resume()
        fail(new UploadError("Missing filename"))
        return
      }

      try {
        storedFile = StorageService.createStoredAudioFile(info.filename, info.mimeType)
      } catch (error) {
        file.resume()
        fail(new UploadError(error instanceof Error ? error.message : "Unsupported audio format", 415))
        return
      }

      let fileSize = 0
      const hash = createHash("sha256")
      const writeStream = StorageService.createWriteStream(storedFile.filepath)

      console.info(`[upload:${uploadId}] file received`, {
        filename: info.filename,
        mimeType: info.mimeType,
        storedFilename: storedFile.filename,
      })

      file.on("data", (chunk: Buffer) => {
        fileSize += chunk.length
        hash.update(chunk)
      })

      file.on("limit", () => {
        writeStream.destroy()
        fail(new UploadError("Audio file is too large. Maximum size is 500MB.", 413))
      })

      // pipeline applies backpressure, so disk writes keep pace with the incoming upload stream.
      fileWritePromise = pipeline(file, writeStream).then(() => {
        if (!storedFile) {
          throw new UploadError("Upload destination was not initialized")
        }

        if (file.truncated) {
          throw new UploadError("Audio file is too large. Maximum size is 500MB.", 413)
        }

        console.info(`[upload:${uploadId}] file write finished`, {
          filename: storedFile.filename,
          bytesReceived: fileSize,
        })

        return {
          filename: storedFile.filename,
          filepath: storedFile.filepath,
          originalName: storedFile.originalName,
          fileSize,
          format: storedFile.format,
          mimeType: storedFile.mimeType,
          checksum: hash.digest("hex"),
        }
      })

      fileWritePromise.catch((error) => {
        if (!fileSettled) {
          fail(error instanceof Error ? error : new Error("Upload failed"))
        }
      })
    })

    busboy.on("filesLimit", () => {
      fail(new UploadError("Only one audio file can be uploaded"))
    })

    busboy.on("field", (fieldname, value) => {
      if (fieldname === "title") {
        requestedTitle = value.slice(0, 240)
      }
      if (fieldname === "replaceAudioId") {
        replaceAudioId = value
      }
    })

    busboy.on("error", (error) => {
      fail(error instanceof Error ? error : new Error("Upload stream failed"))
    })

    busboy.on("close", () => {
      console.info(`[upload:${uploadId}] multipart stream closed`)
    })

    busboy.on("finish", async () => {
      if (fileSettled) return

      try {
        if (!fileWritePromise) {
          throw new UploadError("No file provided")
        }

        const uploadedFile = await fileWritePromise
        uploadedFile.originalName = requestedTitle.trim() || uploadedFile.originalName
        uploadedFile.replaceAudioId = replaceAudioId || undefined
        fileSettled = true
        resolve(uploadedFile)
      } catch (error) {
        fail(error instanceof Error ? error : new Error("Upload failed"))
      }
    })

    request.signal.addEventListener("abort", () => {
      fail(new UploadError("Upload aborted by client", 499))
    })

    nodeStream = Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>)
    nodeStream.on("error", fail)
    nodeStream.pipe(busboy)
  })
}

function getUploadErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Upload failed"

  if (error.message.includes("Unexpected end of form")) {
    return "Upload incomplet : le flux multipart a été interrompu avant la fin."
  }

  if (error.message.includes("aborted")) {
    return "Upload annulé ou interrompu avant la fin."
  }

  return error.message
}
