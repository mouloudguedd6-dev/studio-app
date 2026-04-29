import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const audioId = searchParams.get("audioId")
    if (!audioId) {
      return NextResponse.json({ error: "No audioId" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    const audio = await prisma.audioRecord.findFirst({
      where: { id: audioId, userId: user?.id },
      include: {
        transcription: {
          include: { _count: { select: { segments: true } } }
        }
      }
    })

    if (!audio) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      status: audio.status,
      segmentCount: audio.transcription?._count?.segments || 0,
    })
  } catch (error) {
    return NextResponse.json({ error: "Status check failed" }, { status: 500 })
  }
}
