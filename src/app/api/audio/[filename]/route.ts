import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { StorageService } from "@/lib/storage"
import { prisma } from "@/lib/prisma"
import { Readable } from "stream"
import { isNativeError } from "util/types"

export const runtime = "nodejs"

type ByteRange = {
  start: number
  end: number
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { filename } = await params

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const record = await prisma.audioRecord.findFirst({
      where: { filePath: filename, userId: user.id },
    })

    if (!record) {
      return NextResponse.json({ error: "File not found or access denied" }, { status: 404 })
    }

    const stats = await StorageService.stat(filename).catch(() => null)
    if (!stats) {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 })
    }

    const contentType = record.mimeType || StorageService.getContentType(filename)
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
      const stream = StorageService.createReadStream(filename, range)

      return new NextResponse(Readable.toWeb(stream) as BodyInit, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Type": contentType,
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      })
    }

    const stream = StorageService.createReadStream(filename)

    return new NextResponse(Readable.toWeb(stream) as BodyInit, {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Audio fetch error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { filename: audioId } = await params
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const record = await prisma.audioRecord.findFirst({
      where: { id: audioId, userId: user.id },
    })

    if (!record) {
      return NextResponse.json({ error: "Audio not found or access denied" }, { status: 404 })
    }

    try {
      await StorageService.removeStrict(record.filePath)
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        console.error("Audio file deletion failed:", error)
        return NextResponse.json({ error: "Audio file deletion failed" }, { status: 500 })
      }
    }

    // Prisma cascades delete the transcription, segments, jobs and join-table links.
    await prisma.audioRecord.delete({
      where: { id: record.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Audio delete error:", error)
    return NextResponse.json({ error: "Audio deletion failed" }, { status: 500 })
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

function isFileNotFoundError(error: unknown) {
  return isNativeError(error) && "code" in error && error.code === "ENOENT"
}
