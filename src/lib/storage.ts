import fs from "fs/promises"
import path from "path"

const UPLOAD_DIR = path.join(process.cwd(), "storage_uploads")

export const StorageService = {
  async saveFile(file: File): Promise<string> {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9)
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    const filename = `${uniqueSuffix}-${safeName}`
    const filepath = path.join(UPLOAD_DIR, filename)
    
    await fs.writeFile(filepath, buffer)
    
    return filename // Return only the filename, not the full path, for DB
  },

  async getFile(filename: string): Promise<Buffer | null> {
    try {
      const filepath = path.join(UPLOAD_DIR, filename)
      return await fs.readFile(filepath)
    } catch (error) {
      return null
    }
  }
}
