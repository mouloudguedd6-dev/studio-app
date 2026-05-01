import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  detectSuspiciousWords,
  parseSuspiciousWords,
  parseValidatedWords,
  removeSuspiciousTerm,
  serializeSuspiciousWords,
  serializeValidatedWords,
} from "@/lib/text-processing/clean-lyrics"
import { normalizeTerm } from "@/lib/text-processing/artist-glossary"
import { getUserGlossary } from "@/lib/text-processing/glossary-service"

export const runtime = "nodejs"

type SuspiciousWordAction = "validate" | "replace" | "addToGlossary"

function lyricsToCleanReference(lyricsText: string) {
  return lyricsText.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
}

function replaceTermInText(text: string, term: string, replacement: string) {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return text.replace(new RegExp(`\\b${escapedTerm}\\b`, "giu"), replacement)
}

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
    const body = await request.json()
    const action = body?.action as SuspiciousWordAction | undefined
    const term = typeof body?.term === "string" ? body.term.trim() : ""
    const replacement = typeof body?.replacement === "string" ? body.replacement.trim() : ""

    if (!action || !term) {
      return NextResponse.json({ error: "Missing action or term" }, { status: 400 })
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

    let lyricsText = typeof body?.lyricsText === "string"
      ? body.lyricsText
      : audio.transcription.lyricsText || audio.transcription.cleanText || audio.transcription.rawText || ""
    let validatedTerms = parseValidatedWords(audio.transcription.validatedWords)
    let glossary = await getUserGlossary(user.id)

    if (action === "validate") {
      validatedTerms = [...validatedTerms, normalizeTerm(term)]
    }

    if (action === "replace") {
      if (!replacement) {
        return NextResponse.json({ error: "Missing replacement" }, { status: 400 })
      }

      lyricsText = replaceTermInText(lyricsText, term, replacement)
      validatedTerms = [...validatedTerms, normalizeTerm(replacement)]
    }

    if (action === "addToGlossary") {
      await prisma.glossaryEntry.upsert({
        where: {
          userId_term: {
            userId: user.id,
            term,
          },
        },
        update: {
          correction: replacement || null,
          category: "autre",
        },
        create: {
          userId: user.id,
          term,
          correction: replacement || null,
          category: "autre",
          source: "user",
        },
      })
      glossary = await getUserGlossary(user.id)
    }

    const suspiciousWords =
      action === "validate"
        ? removeSuspiciousTerm(parseSuspiciousWords(audio.transcription.suspiciousWords), term)
        : detectSuspiciousWords(lyricsText, { glossary, validatedTerms })

    const transcription = await prisma.transcription.update({
      where: { id: audio.transcription.id },
      data: {
        lyricsText,
        cleanText: lyricsToCleanReference(lyricsText),
        suspiciousWords: serializeSuspiciousWords(suspiciousWords),
        validatedWords: serializeValidatedWords(validatedTerms),
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
    console.error("Suspicious word action failed:", error)
    return NextResponse.json({ error: "Suspicious word action failed" }, { status: 500 })
  }
}
