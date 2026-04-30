import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createTranscriptionJob } from "@/lib/transcription-service"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { audioId } = await request.json()
    if (!audioId || typeof audioId !== "string") {
      return NextResponse.json({ error: "No audio ID provided" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const job = await createTranscriptionJob(audioId, user.id)

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      progress: job.progress,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription job creation failed"
    const status = message === "Audio not found" ? 404 : message === "Already transcribed" ? 400 : 500

    console.error("Transcription job error:", error)
    return NextResponse.json({ error: message }, { status })
  }
}
