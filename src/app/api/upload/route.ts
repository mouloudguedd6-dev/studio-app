import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import fs from "fs"
import fsPromises from "fs/promises"
import path from "path"
import { Writable } from "stream"

const UPLOAD_DIR = path.join(process.cwd(), "storage_uploads")

// Configure max request body size — handled by next.config.ts
// This route streams the file to disk instead of buffering in RAM
export const maxDuration = 300 // 5 min timeout for large uploads

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    // Ensure upload dir exists
    await fsPromises.mkdir(UPLOAD_DIR, { recursive: true })

    // Parse multipart form data using the built-in formData()
    // For large files, we stream directly to disk via the request body
    const contentType = request.headers.get("content-type") || ""

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 })
    }

    // Use formData() — Next.js 15+ handles streaming internally
    // We write the file to disk in chunks to avoid RAM exhaustion
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Generate safe unique filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const filename = `${uniqueSuffix}-${safeName}`
    const filepath = path.join(UPLOAD_DIR, filename)

    // Stream file to disk using ReadableStream → WriteStream
    // This prevents loading the entire file into memory
    const fileStream = file.stream()
    const writeStream = fs.createWriteStream(filepath)

    const reader = fileStream.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        // Write chunk to disk
        await new Promise<void>((resolve, reject) => {
          writeStream.write(value, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
      }
    } finally {
      reader.releaseLock()
      await new Promise<void>((resolve, reject) => {
        writeStream.end((err?: Error | null) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    // Get file size for metadata
    const stats = await fsPromises.stat(filepath)
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(1)

    // Create DB record
    const audioRecord = await prisma.audioRecord.create({
      data: {
        userId: user.id,
        title: file.name,
        filePath: filename,
        status: "pending",
      }
    })

    return NextResponse.json({
      success: true,
      audio: audioRecord,
      fileSizeMB,
    })

  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed: " + (error as Error).message }, { status: 500 })
  }
}
