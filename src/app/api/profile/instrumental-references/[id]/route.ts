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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [{ id }, user] = await Promise.all([
      params,
      prisma.user.findUnique({ where: { email: session.user.email } }),
    ])
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const body = await request.json()
    const title = cleanText(body.title)

    if (!title) {
      return NextResponse.json({ error: "Le titre de la référence est requis." }, { status: 400 })
    }

    const existing = await prisma.suggestedInstrumentalReference.findFirst({
      where: { id, userId: user.id },
    })
    if (!existing) return NextResponse.json({ error: "Reference not found" }, { status: 404 })

    const reference = await prisma.suggestedInstrumentalReference.update({
      where: { id },
      data: {
        title,
        youtubeUrl: cleanOptionalText(body.youtubeUrl),
        mood: cleanOptionalText(body.mood),
        style: cleanOptionalText(body.style),
        bpm: cleanOptionalBpm(body.bpm),
        note: cleanOptionalText(body.note),
        referenceArtist: cleanOptionalText(body.referenceArtist),
      },
    })

    return NextResponse.json({ success: true, reference })
  } catch (error) {
    console.error("Instrumental reference update error:", error)
    return NextResponse.json({ error: "Reference update failed" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [{ id }, user] = await Promise.all([
      params,
      prisma.user.findUnique({ where: { email: session.user.email } }),
    ])
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const existing = await prisma.suggestedInstrumentalReference.findFirst({
      where: { id, userId: user.id },
    })
    if (!existing) return NextResponse.json({ error: "Reference not found" }, { status: 404 })

    await prisma.suggestedInstrumentalReference.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Instrumental reference deletion error:", error)
    return NextResponse.json({ error: "Reference deletion failed" }, { status: 500 })
  }
}
