import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { detectSuspiciousWords, parseValidatedWords, serializeSuspiciousWords } from "@/lib/text-processing/clean-lyrics"
import { GLOSSARY_CATEGORIES } from "@/lib/text-processing/glossary-service"

export const runtime = "nodejs"

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return prisma.user.findUnique({ where: { email: session.user.email } })
}

async function recalculateUserSuspiciousWords(userId: string) {
  const glossaryEntries = await prisma.glossaryEntry.findMany({
    where: { userId },
    orderBy: { term: "asc" },
  })
  const glossary = glossaryEntries.map((entry) => ({
    value: entry.term,
    correction: entry.correction,
    category: entry.category,
    source: entry.source,
  }))
  const audios = await prisma.audioRecord.findMany({
    where: { userId, transcription: { isNot: null } },
    include: { transcription: true },
  })

  await Promise.all(
    audios.map((audio) => {
      if (!audio.transcription) return Promise.resolve()

      const sourceText =
        audio.transcription.lyricsText ||
        audio.transcription.cleanText ||
        audio.transcription.rawText ||
        ""
      const validatedTerms = parseValidatedWords(audio.transcription.validatedWords)
      const suspiciousWords = detectSuspiciousWords(sourceText, { glossary, validatedTerms })

      return prisma.transcription.update({
        where: { id: audio.transcription.id },
        data: {
          suspiciousWords: serializeSuspiciousWords(suspiciousWords),
        },
      })
    })
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const term = typeof body?.term === "string" ? body.term.trim() : ""
  const correction = typeof body?.correction === "string" ? body.correction.trim() : ""
  const category = typeof body?.category === "string" && GLOSSARY_CATEGORIES.includes(body.category)
    ? body.category
    : "autre"

  if (!term) {
    return NextResponse.json({ error: "Mot ou expression requis" }, { status: 400 })
  }

  const existing = await prisma.glossaryEntry.findFirst({ where: { id, userId: user.id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const entry = await prisma.glossaryEntry.update({
    where: { id },
    data: {
      term,
      correction: correction || null,
      category,
    },
  })

  return NextResponse.json({ entry })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const existing = await prisma.glossaryEntry.findFirst({ where: { id, userId: user.id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.glossaryEntry.delete({ where: { id } })
  await recalculateUserSuspiciousWords(user.id)

  return NextResponse.json({ success: true })
}
