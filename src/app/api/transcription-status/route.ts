import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get("id")
    const audioId = searchParams.get("audioId")

    if (!jobId && !audioId) {
      return NextResponse.json({ error: "No job id or audioId provided" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const audio = await prisma.audioRecord.findFirst({
      where: {
        userId: user.id,
        ...(audioId ? { id: audioId } : { transcriptionJobs: { some: { id: jobId! } } }),
      },
      include: {
        transcription: {
          include: { _count: { select: { segments: true } } },
        },
        transcriptionJobs: {
          where: jobId ? { id: jobId } : undefined,
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    })

    if (!audio) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const job = audio.transcriptionJobs[0] || null

    return NextResponse.json({
      audioId: audio.id,
      jobId: job?.id || null,
      jobStatus: job?.status || null,
      status: audio.status,
      progress: job?.progress ?? (audio.status === "transcribed" ? 100 : 0),
      error: job?.error || null,
      segmentCount: audio.transcription?._count?.segments || 0,
    })
  } catch (error) {
    console.error("Status check failed:", error)
    return NextResponse.json({ error: "Status check failed" }, { status: 500 })
  }
}
