import fs from "fs"
import fsPromises from "fs/promises"
import path from "path"

export const UPLOAD_DIR = path.join(process.cwd(), "storage_uploads")
export const MAX_AUDIO_UPLOAD_BYTES = 500 * 1024 * 1024

const AUDIO_FORMATS = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
} as const

export type AllowedAudioFormat = keyof typeof AUDIO_FORMATS

export type StoredAudioFile = {
  filename: string
  filepath: string
  originalName: string
  format: string
  mimeType: string
}

function safeJoinUploadPath(filename: string) {
  const filepath = path.join(UPLOAD_DIR, filename)
  return assertUploadPath(filepath)
}

function assertUploadPath(filepath: string) {
  const relative = path.relative(UPLOAD_DIR, filepath)

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid file path")
  }

  return filepath
}

function sanitizeFilename(filename: string) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_")
}

export const StorageService = {
  async ensureUploadDir() {
    await fsPromises.mkdir(UPLOAD_DIR, { recursive: true })
  },

  getAllowedExtensions() {
    return Object.keys(AUDIO_FORMATS)
  },

  getFormat(filename: string): AllowedAudioFormat | null {
    const ext = path.extname(filename).toLowerCase()
    return ext in AUDIO_FORMATS ? (ext as AllowedAudioFormat) : null
  },

  getContentType(filename: string, fallback = "application/octet-stream") {
    const format = this.getFormat(filename)
    return format ? AUDIO_FORMATS[format] : fallback
  },

  createStoredAudioFile(originalName: string, uploadedMimeType?: string): StoredAudioFile {
    const format = this.getFormat(originalName)
    if (!format) {
      throw new Error(`Unsupported audio format. Allowed formats: ${this.getAllowedExtensions().join(", ")}`)
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const safeName = sanitizeFilename(originalName)
    const filename = `${uniqueSuffix}-${safeName}`
    const filepath = safeJoinUploadPath(filename)

    return {
      filename,
      filepath,
      originalName,
      format: format.slice(1),
      // Browsers can send application/octet-stream for some audio files, so the extension remains authoritative.
      mimeType: uploadedMimeType || AUDIO_FORMATS[format],
    }
  },

  getPath(filename: string) {
    return safeJoinUploadPath(filename)
  },

  createReadStream(filename: string, range?: { start: number; end: number }) {
    return fs.createReadStream(this.getPath(filename), range)
  },

  createWriteStream(filepath: string) {
    return fs.createWriteStream(filepath, { flags: "wx" })
  },

  async stat(filename: string) {
    return fsPromises.stat(this.getPath(filename))
  },

  async remove(filenameOrPath: string) {
    const filepath = path.isAbsolute(filenameOrPath)
      ? assertUploadPath(filenameOrPath)
      : safeJoinUploadPath(filenameOrPath)

    await fsPromises.unlink(filepath).catch(() => {})
  },

  async removeStrict(filenameOrPath: string) {
    const filepath = path.isAbsolute(filenameOrPath)
      ? assertUploadPath(filenameOrPath)
      : safeJoinUploadPath(filenameOrPath)

    await fsPromises.unlink(filepath)
  },
}
