import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import fs from "fs"
import fsPromises from "fs/promises"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)
const UPLOAD_DIR = path.join(process.cwd(), "storage_uploads")
const TEMP_DIR = path.join(process.cwd(), "tmp_transcribe")

// Whisper has a 25MB per-request limit
const WHISPER_MAX_BYTES = 24 * 1024 * 1024  // 24MB to be safe
// Chunk duration in seconds (for large files we split by time)
const CHUNK_DURATION_SEC = 600  // 10 minutes per chunk

// Allow long-running transcription (up to 30 min for a 1h file)
export const maxDuration = 1800

export async function POST(request: Request) {
  let audioId = ""
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    audioId = body.audioId
    if (!audioId) {
      return NextResponse.json({ error: "No audio ID provided" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const audio = await prisma.audioRecord.findFirst({
      where: { id: audioId, userId: user.id }
    })

    if (!audio) {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 })
    }

    // If already transcribed or transcribing, skip
    if (audio.status === "transcribed") {
      return NextResponse.json({ error: "Already transcribed" }, { status: 400 })
    }

    // Update status to transcribing
    await prisma.audioRecord.update({
      where: { id: audioId },
      data: { status: "transcribing" }
    })

    const sourceFile = path.join(UPLOAD_DIR, audio.filePath)

    // Check source exists
    if (!fs.existsSync(sourceFile)) {
      await prisma.audioRecord.update({ where: { id: audioId }, data: { status: "error" } })
      return NextResponse.json({ error: "Source audio file not found on disk" }, { status: 404 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    let rawText = ""
    let segmentsData: { text: string; startTime: number; endTime: number }[] = []
    let usedFallback = false

    if (apiKey) {
      // Real Whisper pipeline
      const fileStats = await fsPromises.stat(sourceFile)
      const fileSizeBytes = fileStats.size

      if (fileSizeBytes <= WHISPER_MAX_BYTES) {
        // Small enough — send directly
        const result = await transcribeChunk(sourceFile, apiKey)
        rawText = result.text
        segmentsData = result.segments
      } else {
        // Large file — chunk with ffmpeg and transcribe each chunk
        console.log(`Large file (${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB) — splitting into chunks`)
        const result = await transcribeLargeFile(sourceFile, apiKey, audio.filePath)
        rawText = result.text
        segmentsData = result.segments
      }
    } else {
      // Fallback simulation — clearly marked
      usedFallback = true
      rawText = "[SIMULATION — Aucune clé OPENAI_API_KEY configurée]\n\nCeci est une transcription simulée pour tester le pipeline.\nAjoutez OPENAI_API_KEY dans votre fichier .env pour activer Whisper réel.\n\nExemple de contenu:\nOuais c'est pour la V1, on teste le système\nLa machine est pleine, les mots s'alignent\nL'inspi monte, pas besoin de thème\nOn construit le son depuis la base"
      segmentsData = [
        { text: "[SIMULATION] Ouais c'est pour la V1, on teste le système", startTime: 0.5, endTime: 3.0 },
        { text: "[SIMULATION] La machine est pleine, les mots s'alignent", startTime: 3.5, endTime: 7.0 },
        { text: "[SIMULATION] L'inspi monte, pas besoin de thème", startTime: 7.5, endTime: 11.0 },
        { text: "[SIMULATION] On construit le son depuis la base", startTime: 11.5, endTime: 14.0 },
      ]
    }

    // Delete existing transcription if re-transcribing
    await prisma.transcription.deleteMany({ where: { audioRecordId: audioId } })

    // Create transcription record with all segments
    await prisma.transcription.create({
      data: {
        audioRecordId: audioId,
        rawText,
        cleanText: rawText,
        segments: {
          create: segmentsData.map(seg => ({
            text: seg.text,
            startTime: seg.startTime,
            endTime: seg.endTime,
          }))
        }
      }
    })

    await prisma.audioRecord.update({
      where: { id: audioId },
      data: { status: "transcribed" }
    })

    return NextResponse.json({
      success: true,
      segmentCount: segmentsData.length,
      usedFallback,
    })

  } catch (error) {
    console.error("Transcription error:", error)
    // Mark as error so the UI shows the failed state
    if (audioId) {
      await prisma.audioRecord.update({
        where: { id: audioId },
        data: { status: "error" }
      }).catch(() => {})
    }
    return NextResponse.json({ error: "Transcription failed: " + (error as Error).message }, { status: 500 })
  } finally {
    // Cleanup temp dir
    await fsPromises.rm(TEMP_DIR, { recursive: true, force: true }).catch(() => {})
  }
}

// ─── Transcribe a single audio file chunk ────────────────────────────────────

async function transcribeChunk(
  filePath: string,
  apiKey: string,
  timeOffset = 0
): Promise<{ text: string; segments: { text: string; startTime: number; endTime: number }[] }> {
  const fileBuffer = await fsPromises.readFile(filePath)
  const ext = path.extname(filePath).slice(1) || "mp3"

  const formData = new FormData()
  const blob = new Blob([fileBuffer], { type: `audio/${ext}` })
  formData.append("file", blob, path.basename(filePath))
  formData.append("model", "whisper-1")
  formData.append("response_format", "verbose_json")
  formData.append("language", "fr")  // Set French for better accuracy

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Whisper API error ${res.status}: ${errText}`)
  }

  const data = await res.json()

  return {
    text: data.text || "",
    segments: (data.segments || []).map((s: any) => ({
      text: s.text.trim(),
      startTime: s.start + timeOffset,
      endTime: s.end + timeOffset,
    }))
  }
}

// ─── Handle large files by splitting with ffmpeg ──────────────────────────────

async function transcribeLargeFile(
  sourceFile: string,
  apiKey: string,
  originalFilename: string
): Promise<{ text: string; segments: { text: string; startTime: number; endTime: number }[] }> {
  // Get duration using ffprobe
  const { stdout: durationStr } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourceFile}"`
  )
  const totalDuration = parseFloat(durationStr.trim())

  if (isNaN(totalDuration)) {
    throw new Error("Could not determine audio duration with ffprobe")
  }

  console.log(`Total duration: ${totalDuration}s — splitting into ${CHUNK_DURATION_SEC}s chunks`)

  // Create temp dir
  await fsPromises.mkdir(TEMP_DIR, { recursive: true })

  const chunkCount = Math.ceil(totalDuration / CHUNK_DURATION_SEC)
  const allSegments: { text: string; startTime: number; endTime: number }[] = []
  const allTexts: string[] = []

  for (let i = 0; i < chunkCount; i++) {
    const startSec = i * CHUNK_DURATION_SEC
    const chunkFile = path.join(TEMP_DIR, `chunk_${i}.mp3`)

    // Extract chunk: convert to mp3 at 64kbps mono to minimize size
    await execAsync(
      `ffmpeg -y -i "${sourceFile}" -ss ${startSec} -t ${CHUNK_DURATION_SEC} ` +
      `-ac 1 -ar 16000 -b:a 64k "${chunkFile}"`
    )

    // Verify chunk size
    const chunkStats = await fsPromises.stat(chunkFile)
    if (chunkStats.size === 0) {
      console.warn(`Chunk ${i} is empty, skipping`)
      continue
    }

    console.log(`Transcribing chunk ${i + 1}/${chunkCount} (offset ${startSec}s, size ${(chunkStats.size / 1024 / 1024).toFixed(1)}MB)`)

    try {
      const result = await transcribeChunk(chunkFile, apiKey, startSec)
      allTexts.push(result.text)
      allSegments.push(...result.segments)
    } catch (err) {
      console.error(`Error on chunk ${i}:`, err)
      // Continue with remaining chunks rather than failing completely
      allTexts.push(`[Erreur transcription chunk ${i + 1}]`)
    }

    // Delete chunk file immediately to free disk space
    await fsPromises.unlink(chunkFile).catch(() => {})
  }

  return {
    text: allTexts.join("\n\n"),
    segments: allSegments,
  }
}
