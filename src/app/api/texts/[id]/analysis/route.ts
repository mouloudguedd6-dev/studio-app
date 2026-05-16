import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getArtistProfileContext } from "@/lib/artist-da-context"
import { prisma } from "@/lib/prisma"
import { toSerializableAnalysis, toTextAnalysisDbData } from "@/lib/text-analysis/json"
import { analyzeTextWithProvider } from "@/lib/text-analysis/provider"

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

    if (!audio?.transcription) {
      return NextResponse.json({ error: "Transcription not found" }, { status: 404 })
    }

    const text = audio.transcription.lyricsText || audio.transcription.cleanText || audio.transcription.rawText || ""
    if (!text.trim()) {
      return NextResponse.json({ error: "Aucun texte à analyser." }, { status: 400 })
    }

    const artistDA = await getArtistProfileContext(user.id)
    const result = await analyzeTextWithProvider({
      text,
      artistDA,
      segments: audio.transcription.segments.map((segment) => ({
        text: segment.text,
        startTime: segment.startTime,
        endTime: segment.endTime,
      })),
    })

    const analysis = await prisma.textAnalysis.upsert({
      where: { transcriptionId: audio.transcription.id },
      update: toTextAnalysisDbData(result),
      create: {
        transcriptionId: audio.transcription.id,
        ...toTextAnalysisDbData(result),
      },
    })

    return NextResponse.json({
      success: true,
      analysis: toSerializableAnalysis(analysis),
    })
  } catch (error) {
    console.error("Text analysis failed:", error)
    return NextResponse.json({ error: "Text analysis failed" }, { status: 500 })
  }
}
