import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { StorageService } from "@/lib/storage"

const RIGHTS_STATUSES = new Set(["perso", "achete", "a_acheter", "libre", "brouillon", "inconnu"])

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

function cleanRightsStatus(value: unknown) {
  const status = cleanText(value)
  return RIGHTS_STATUSES.has(status) ? status : "inconnu"
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

    const existing = await prisma.instrumental.findFirst({
      where: { id, userId: user.id, scope: "available" },
    })
    if (!existing) return NextResponse.json({ error: "Instrumental not found" }, { status: 404 })

    const body = await request.json()
    const title = cleanText(body.title)
    if (!title) {
      return NextResponse.json({ error: "Le titre est requis." }, { status: 400 })
    }

    const instrumental = await prisma.instrumental.update({
      where: { id },
      data: {
        name: title,
        bpm: cleanOptionalBpm(body.bpm),
        musicalKey: cleanOptionalText(body.musicalKey),
        mood: cleanOptionalText(body.mood),
        style: cleanOptionalText(body.style),
        referenceArtist: cleanOptionalText(body.referenceArtist),
        rightsStatus: cleanRightsStatus(body.rightsStatus),
        youtubeUrl: cleanOptionalText(body.youtubeUrl),
        notes: cleanOptionalText(body.notes),
      },
    })

    return NextResponse.json({ success: true, instrumental })
  } catch (error) {
    console.error("Instrumental update error:", error)
    return NextResponse.json({ error: "Instrumental update failed" }, { status: 500 })
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

    const existing = await prisma.instrumental.findFirst({
      where: { id, userId: user.id, scope: "available" },
      include: { maquettes: true },
    })
    if (!existing) return NextResponse.json({ error: "Instrumental not found" }, { status: 404 })

    if (existing.maquettes.length > 0) {
      return NextResponse.json(
        { error: "Cette instrumentale est liée à une maquette et ne peut pas être supprimée ici." },
        { status: 409 }
      )
    }

    await prisma.instrumental.delete({ where: { id } })

    if (existing.localPath) {
      await StorageService.remove(existing.localPath)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Instrumental delete error:", error)
    return NextResponse.json({ error: "Instrumental deletion failed" }, { status: 500 })
  }
}
