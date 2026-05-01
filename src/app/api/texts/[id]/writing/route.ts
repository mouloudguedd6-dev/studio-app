import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  detectSuspiciousWords,
  parseValidatedWords,
  serializeSuspiciousWords,
} from "@/lib/text-processing/clean-lyrics"
import { getUserGlossary } from "@/lib/text-processing/glossary-service"

export const runtime = "nodejs"

function lyricsToCleanReference(lyricsText: string) {
  return lyricsText.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const { lyricsText } = await request.json()

    if (typeof lyricsText !== "string") {
      return NextResponse.json({ error: "lyricsText must be a string" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const audio = await prisma.audioRecord.findFirst({
      where: { id, userId: user.id },
      include: { transcription: true },
    })

    if (!audio?.transcription) {
      return NextResponse.json({ error: "Transcription not found" }, { status: 404 })
    }

    const glossary = await getUserGlossary(user.id)
    const validatedTerms = parseValidatedWords(audio.transcription.validatedWords)
    const suspiciousWords = detectSuspiciousWords(lyricsText, { glossary, validatedTerms })
    const transcription = await prisma.transcription.update({
      where: { id: audio.transcription.id },
      data: {
        lyricsText,
        cleanText: lyricsToCleanReference(lyricsText),
        suspiciousWords: serializeSuspiciousWords(suspiciousWords),
        lyricsEditedByUser: true,
        lyricsUpdatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      cleanText: transcription.cleanText,
      lyricsText: transcription.lyricsText,
      suspiciousWords,
    })
  } catch (error) {
    console.error("Lyrics save failed:", error)
    return NextResponse.json({ error: "Lyrics save failed" }, { status: 500 })
  }
}
