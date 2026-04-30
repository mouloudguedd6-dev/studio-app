import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const profile = await prisma.daProfile.findUnique({ where: { userId: user.id } })
    return NextResponse.json({ profile: profile || {} })
  } catch (error) {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { artistsRef, moods, instrumentalStyles, influences } = await request.json()
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const profile = await prisma.daProfile.upsert({
      where: { userId: user.id },
      update: { artistsRef, moods, instrumentalStyles, influences },
      create: { userId: user.id, artistsRef, moods, instrumentalStyles, influences }
    })

    return NextResponse.json({ success: true, profile })
  } catch (error) {
    console.error("Profile update error:", error)
    return NextResponse.json({ error: "Profile update failed" }, { status: 500 })
  }
}
