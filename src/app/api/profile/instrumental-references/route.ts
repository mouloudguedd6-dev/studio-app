import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function cleanOptionalText(value: unknown) {
  const text = cleanText(value)
  return text || null
}

function cleanOptionalBpm(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const bpm = Number(value)
  return Number.isInteger(bpm) && bpm > 0 && bpm <= 300 ? bpm : null
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const body = await request.json()
    const title = cleanText(body.title)

    if (!title) {
      return NextResponse.json({ error: "Le titre de la référence est requis." }, { status: 400 })
    }

    const reference = await prisma.suggestedInstrumentalReference.create({
      data: {
        userId: user.id,
        title,
        youtubeUrl: cleanOptionalText(body.youtubeUrl),
        mood: cleanOptionalText(body.mood),
        style: cleanOptionalText(body.style),
        bpm: cleanOptionalBpm(body.bpm),
        note: cleanOptionalText(body.note),
        referenceArtist: cleanOptionalText(body.referenceArtist),
        scope: "artist",
      },
    })

    return NextResponse.json({ success: true, reference })
  } catch (error) {
    console.error("Instrumental reference creation error:", error)
    return NextResponse.json({ error: "Reference creation failed" }, { status: 500 })
  }
}
