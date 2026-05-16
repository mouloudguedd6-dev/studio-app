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

type UploadedInstrumental = {
  filename: string
  filepath: string
  originalName: string
  fileSize: number
  format: string
  mimeType: string
  checksum: string
}

type InstrumentalMetadata = {
  title: string
  bpm: number | null
  musicalKey: string | null
  mood: string | null
  style: string | null
  referenceArtist: string | null
  rightsStatus: string
  youtubeUrl: string | null
  notes: string | null
}

class UploadError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
  }
}

function cleanOptionalText(value: string | undefined) {
  const text = (value || "").trim()
  return text || null
}

function cleanOptionalBpm(value: string | undefined) {
  if (!value) return null
  const bpm = Number(value)
  return Number.isInteger(bpm) && bpm > 0 && bpm <= 300 ? bpm : null
}

function cleanRightsStatus(value: string | undefined) {
  const allowed = new Set(["perso", "achete", "a_acheter", "libre", "brouillon", "inconnu"])
  return value && allowed.has(value) ? value : "inconnu"
}

export async function POST(request: Request) {
  let uploadedFile: UploadedInstrumental | null = null
  const uploadId = `${Date.now()}-${Math.round(Math.random() * 1e6)}`

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const parsedUpload = await streamMultipartInstrumental(request, uploadId)
    uploadedFile = parsedUpload.uploadedFile
    const metadata = parsedUpload.metadata
    const duration = await probeAudioDurationSeconds(uploadedFile.filepath)

    try {
      const instrumental = await prisma.instrumental.create({
        data: {
          userId: user.id,
          name: metadata.title || uploadedFile.originalName,
          localPath: uploadedFile.filename,
          duration,
          fileSize: uploadedFile.fileSize,
          mimeType: uploadedFile.mimeType,
          format: uploadedFile.format,
          checksum: uploadedFile.checksum,
          bpm: metadata.bpm,
          musicalKey: metadata.musicalKey,
          mood: metadata.mood,
          style: metadata.style,
          referenceArtist: metadata.referenceArtist,
          rightsStatus: metadata.rightsStatus,
          youtubeUrl: metadata.youtubeUrl,
          notes: metadata.notes,
          scope: "available",
        },
      })

      return NextResponse.json({ success: true, instrumental })
    } catch (error) {
      await StorageService.remove(uploadedFile.filepath)
      uploadedFile = null
      throw error
    }
  } catch (error) {
    if (uploadedFile) {
      await StorageService.remove(uploadedFile.filepath)
    }

    const status = error instanceof UploadError ? error.status : 500
    const message = error instanceof Error ? error.message : "Instrumental upload failed"
    console.error(`[instrumental-upload:${uploadId}] upload failed:`, error)

    return NextResponse.json({ error: message }, { status })
  }
}

async function streamMultipartInstrumental(
  request: Request,
  uploadId: string
): Promise<{ uploadedFile: UploadedInstrumental; metadata: InstrumentalMetadata }> {
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

    const fields: Record<string, string> = {}
    let fileSeen = false
    let fileSettled = false
    let storedFile: ReturnType<typeof StorageService.createStoredAudioFile> | null = null
    let fileWritePromise: Promise<UploadedInstrumental> | null = null
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
        fail(new UploadError("Only one instrumental file can be uploaded"))
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

      console.info(`[instrumental-upload:${uploadId}] file received`, {
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
        fail(new UploadError("Instrumental file is too large. Maximum size is 500MB.", 413))
      })

      fileWritePromise = pipeline(file, writeStream).then(() => {
        if (!storedFile) {
          throw new UploadError("Upload destination was not initialized")
        }

        if (file.truncated) {
          throw new UploadError("Instrumental file is too large. Maximum size is 500MB.", 413)
        }

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
      fail(new UploadError("Only one instrumental file can be uploaded"))
    })

    busboy.on("field", (fieldname, value) => {
      fields[fieldname] = value.slice(0, 1000)
    })

    busboy.on("error", (error) => {
      fail(error instanceof Error ? error : new Error("Upload stream failed"))
    })

    busboy.on("finish", async () => {
      if (fileSettled) return

      try {
        if (!fileWritePromise) {
          throw new UploadError("No file provided")
        }

        const uploadedFile = await fileWritePromise
        const title = (fields.title || uploadedFile.originalName).trim()
        fileSettled = true

        resolve({
          uploadedFile,
          metadata: {
            title,
            bpm: cleanOptionalBpm(fields.bpm),
            musicalKey: cleanOptionalText(fields.musicalKey),
            mood: cleanOptionalText(fields.mood),
            style: cleanOptionalText(fields.style),
            referenceArtist: cleanOptionalText(fields.referenceArtist),
            rightsStatus: cleanRightsStatus(fields.rightsStatus),
            youtubeUrl: cleanOptionalText(fields.youtubeUrl),
            notes: cleanOptionalText(fields.notes),
          },
        })
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
