import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { StorageService } from "@/lib/storage"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const { filename } = await params

    // Vérifier que l'utilisateur a le droit d'accéder à ce fichier (Traçabilité / Sécurité)
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const record = await prisma.audioRecord.findFirst({
      where: { filePath: filename, userId: user.id }
    })

    if (!record) {
      return NextResponse.json({ error: "File not found or access denied" }, { status: 404 })
    }

    const fileBuffer = await StorageService.getFile(filename)
    if (!fileBuffer) {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 })
    }

    // Déterminer le content-type basique
    const ext = filename.split('.').pop()?.toLowerCase()
    let contentType = 'audio/mpeg'
    if (ext === 'wav') contentType = 'audio/wav'
    if (ext === 'ogg') contentType = 'audio/ogg'
    if (ext === 'm4a') contentType = 'audio/mp4'

    return new NextResponse(fileBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error("Audio fetch error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
