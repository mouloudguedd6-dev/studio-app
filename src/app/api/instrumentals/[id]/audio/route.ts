import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { StorageService } from "@/lib/storage"
import { Readable } from "stream"

export const runtime = "nodejs"

type ByteRange = {
  start: number
  end: number
}

export async function GET(
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

    const instrumental = await prisma.instrumental.findFirst({
      where: { id, userId: user.id, scope: "available" },
    })

    if (!instrumental?.localPath) {
      return NextResponse.json({ error: "Instrumental file not found or access denied" }, { status: 404 })
    }

    const stats = await StorageService.stat(instrumental.localPath).catch(() => null)
    if (!stats) {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 })
    }

    const contentType = instrumental.mimeType || StorageService.getContentType(instrumental.localPath)
    const fileSize = stats.size
    const rangeHeader = request.headers.get("range")
    const range = parseRangeHeader(rangeHeader, fileSize)

    if (rangeHeader && !range) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      })
    }

    if (range) {
      const stream = StorageService.createReadStream(instrumental.localPath, range)

      return new NextResponse(Readable.toWeb(stream) as BodyInit, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Type": contentType,
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
          "Content-Disposition": `inline; filename="${instrumental.localPath}"`,
        },
      })
    }

    const stream = StorageService.createReadStream(instrumental.localPath)

    return new NextResponse(Readable.toWeb(stream) as BodyInit, {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Content-Disposition": `inline; filename="${instrumental.localPath}"`,
      },
    })
  } catch (error) {
    console.error("Instrumental audio fetch error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

function parseRangeHeader(rangeHeader: string | null, fileSize: number): ByteRange | null {
  if (!rangeHeader) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
  if (!match) return null

  const [, rawStart, rawEnd] = match

  if (!rawStart && !rawEnd) return null

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null

    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1,
    }
  }

  const start = Number.parseInt(rawStart, 10)
  const end = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  }
}
