import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export async function probeAudioDurationSeconds(filepath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filepath,
    ])

    const duration = Number.parseFloat(stdout.trim())
    return Number.isFinite(duration) ? Math.round(duration) : null
  } catch (error) {
    console.warn("Unable to read audio duration with ffprobe:", error)
    return null
  }
}
