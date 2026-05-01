import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  generateCleanLyrics,
  parseValidatedWords,
  serializeSuspiciousWords,
} from "@/lib/text-processing/clean-lyrics"
import { getUserGlossary } from "@/lib/text-processing/glossary-service"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const confirmReplace = body?.confirmReplace === true

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const audio = await prisma.audioRecord.findFirst({
      where: { id, userId: user.id },
      include: {
        transcription: {
          include: {
            segments: {
              orderBy: { startTime: "asc" },
            },
          },
        },
      },
    })

    if (!audio?.transcription?.rawText) {
      return NextResponse.json({ error: "Transcription not found" }, { status: 404 })
    }

    if (audio.transcription.lyricsEditedByUser && !confirmReplace) {
      return NextResponse.json(
        {
          error: "Lyrics already edited by user",
          requiresConfirmation: true,
        },
        { status: 409 }
      )
    }

    const glossary = await getUserGlossary(user.id)
    const validatedTerms = parseValidatedWords(audio.transcription.validatedWords)
    const cleanLyrics = generateCleanLyrics(audio.transcription.rawText, audio.transcription.segments, {
      glossary,
      validatedTerms,
    })

    const transcription = await prisma.transcription.update({
      where: { id: audio.transcription.id },
      data: {
        cleanText: cleanLyrics.cleanText,
        lyricsText: cleanLyrics.lyricsText,
        suspiciousWords: serializeSuspiciousWords(cleanLyrics.suspiciousWords),
        lyricsEditedByUser: false,
        cleanLyricsGeneratedAt: new Date(),
        lyricsUpdatedAt: null,
      },
    })

    return NextResponse.json({
      success: true,
      cleanText: transcription.cleanText,
      lyricsText: transcription.lyricsText,
      suspiciousWords: cleanLyrics.suspiciousWords,
    })
  } catch (error) {
    console.error("Clean lyrics generation failed:", error)
    return NextResponse.json({ error: "Clean lyrics generation failed" }, { status: 500 })
  }
}
