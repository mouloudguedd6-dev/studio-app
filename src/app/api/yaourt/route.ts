import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import path from "path"
import fs from "fs"
import { exec } from "child_process"
import util from "util"

const execPromise = util.promisify(exec)

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { maquetteId } = await request.json()
    if (!maquetteId) return NextResponse.json({ error: "No maquette ID" }, { status: 400 })

    const maquette = await prisma.maquette.findUnique({
      where: { id: maquetteId },
      include: {
        studioPack: {
          include: {
            packSegments: {
              orderBy: { order: 'asc' },
              include: {
                segment: { include: { transcription: { include: { audioRecord: true } } } }
              }
            }
          }
        }
      }
    })

    if (!maquette || !maquette.studioPack) {
      return NextResponse.json({ error: "Maquette not found" }, { status: 404 })
    }

    const segments = maquette.studioPack.packSegments

    if (segments.length === 0) {
      return NextResponse.json({ error: "No segments to process" }, { status: 400 })
    }

    const uploadDir = path.join(process.cwd(), 'storage_uploads')
    
    // We will use standard ffmpeg via exec. We need to cut each segment and then concat them.
    // Ensure we have a temp dir
    const tempDir = path.join(process.cwd(), 'tmp_yaourt')
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

    const listFilePath = path.join(tempDir, `list_${maquetteId}.txt`)
    let listContent = ""
    const tempFiles: string[] = []

    // Use system ffmpeg (must be installed: brew install ffmpeg)
    const ffmpegBin = "ffmpeg"

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i].segment
      const sourceFile = path.join(uploadDir, seg.transcription.audioRecord.filePath)
      
      if (!fs.existsSync(sourceFile)) continue; // skip if source missing

      const duration = seg.endTime - seg.startTime
      const outFile = path.join(tempDir, `part_${maquetteId}_${i}.mp3`)
      tempFiles.push(outFile)
      
      // Cut the segment
      const cmd = `"${ffmpegBin}" -y -i "${sourceFile}" -ss ${seg.startTime} -t ${duration} -c:a libmp3lame -q:a 2 "${outFile}"`
      await execPromise(cmd)
      
      listContent += `file '${outFile}'\n`
    }

    if (tempFiles.length === 0) {
      return NextResponse.json({ error: "Source files missing or invalid" }, { status: 500 })
    }

    fs.writeFileSync(listFilePath, listContent)

    const finalFilename = `yaourt_${maquetteId}_${Date.now()}.mp3`
    const finalPath = path.join(uploadDir, finalFilename)

    // Concat all parts
    const concatCmd = `"${ffmpegBin}" -y -f concat -safe 0 -i "${listFilePath}" -c copy "${finalPath}"`
    await execPromise(concatCmd)

    // Clean up temp files
    try {
      fs.unlinkSync(listFilePath)
      for (const file of tempFiles) {
        fs.unlinkSync(file)
      }
    } catch(e) { console.error("Cleanup error", e) }

    // Save YaourtAudio in DB
    const yaourt = await prisma.yaourtAudio.create({
      data: {
        maquetteId,
        filePath: finalFilename
      }
    })

    return NextResponse.json({ success: true, yaourt })

  } catch (error) {
    console.error("Yaourt generation error:", error)
    return NextResponse.json({ error: "Yaourt generation failed" }, { status: 500 })
  }
}
