"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle, Copy, Loader2, RefreshCw, Replace, UploadCloud, X } from "lucide-react"
import styles from "./audio.module.css"

type QueueStatus = "pending" | "duplicate" | "uploading" | "success" | "error" | "ignored" | "replaced" | "copy"
type UploadMode = "normal" | "replace" | "copy"

type ExistingAudio = {
  id: string
  title: string
  fileSize?: number | null
  duration?: number | null
  format?: string | null
  checksum?: string | null
  status?: string
}

type QueueItem = {
  id: string
  file: File
  displayName: string
  status: QueueStatus
  uploadMode: UploadMode
  progress: number
  uploadedBytes: number
  totalBytes: number
  error?: string
  note?: string
  duplicateMatch?: ExistingAudio
  suggestedCopyName?: string
}

const MAX_AUDIO_UPLOAD_BYTES = 500 * 1024 * 1024
const MAX_SELECTED_FILES = 100
const MAX_CONCURRENT_UPLOADS = 2
const ALLOWED_AUDIO_EXTENSIONS = /\.(mp3|m4a|wav)$/i

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function duplicateKey(name: string, size: number) {
  return `${name.toLowerCase()}::${size}`
}

function withDuplicateSuffix(filename: string, copyIndex: number) {
  const dotIndex = filename.lastIndexOf(".")
  if (dotIndex <= 0) return `${filename}-${copyIndex}`

  return `${filename.slice(0, dotIndex)}-${copyIndex}${filename.slice(dotIndex)}`
}

function normalizeAudioTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_\s]*(copy|copie|\(\d+\)|\d+)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function isProbableDuplicate(file: File, audio: ExistingAudio) {
  const sameName = file.name.toLowerCase() === audio.title.toLowerCase()
  const sameNormalizedTitle = normalizeAudioTitle(file.name) === normalizeAudioTitle(audio.title)
  const sameSize = typeof audio.fileSize === "number" && audio.fileSize === file.size
  const closeSize =
    typeof audio.fileSize === "number" &&
    Math.abs(audio.fileSize - file.size) <= Math.max(1024 * 1024, file.size * 0.01)

  return (sameName && closeSize) || (sameNormalizedTitle && closeSize) || sameSize
}

export default function UploadForm({ existingAudios = [] }: { existingAudios?: ExistingAudio[] }) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [skippedCount, setSkippedCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRefs = useRef(new Map<string, XMLHttpRequest>())
  const router = useRouter()

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const reset = () => {
    for (const xhr of xhrRefs.current.values()) {
      xhr.abort()
    }
    xhrRefs.current.clear()
    setQueue([])
    setIsProcessing(false)
    setSkippedCount(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    if (selectedFiles.length === 0) return

    const filesToQueue = selectedFiles.slice(0, MAX_SELECTED_FILES)
    setSkippedCount(Math.max(0, selectedFiles.length - MAX_SELECTED_FILES))

    const seenInSelection = new Map<string, number>()
    const nextQueue = filesToQueue.map((file, index): QueueItem => {
      const id = `${Date.now()}-${index}-${file.name}`
      const key = duplicateKey(file.name, file.size)
      const selectedCount = seenInSelection.get(key) || 0
      seenInSelection.set(key, selectedCount + 1)

      const baseItem = {
        id,
        file,
        displayName: file.name,
        uploadMode: "normal" as const,
        progress: 0,
        uploadedBytes: 0,
        totalBytes: file.size,
      }

      if (!ALLOWED_AUDIO_EXTENSIONS.test(file.name)) {
        return { ...baseItem, status: "ignored", error: "Format ignoré. Utilisez MP3, M4A ou WAV." }
      }

      if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
        return { ...baseItem, status: "ignored", error: "Fichier ignoré : limite 500 MB par fichier." }
      }

      const duplicateMatch = existingAudios.find((audio) => isProbableDuplicate(file, audio))
      if (duplicateMatch || selectedCount > 0) {
        return {
          ...baseItem,
          status: "duplicate",
          duplicateMatch,
          suggestedCopyName: withDuplicateSuffix(file.name, selectedCount + 2),
          note: duplicateMatch
            ? "Un fichier similaire existe déjà. Choisissez une action."
            : "Ce fichier est répété dans la sélection. Choisissez une action.",
        }
      }

      return { ...baseItem, status: "pending" }
    })

    setQueue(nextQueue)
    await processQueue(nextQueue)
  }

  const processQueue = async (items: QueueItem[]) => {
    const uploadableItems = items.filter((item) => item.status === "pending")
    if (uploadableItems.length === 0) return

    setIsProcessing(true)
    let cursor = 0

    const worker = async () => {
      while (cursor < uploadableItems.length) {
        const item = uploadableItems[cursor]
        cursor += 1
        await uploadOne(item)
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, uploadableItems.length) }, () => worker())
    )

    setIsProcessing(false)
    router.refresh()
  }

  const uploadOne = (item: QueueItem) => {
    return new Promise<void>((resolve) => {
      const formData = new FormData()
      formData.append("title", item.displayName)
      if (item.uploadMode === "replace" && item.duplicateMatch) {
        formData.append("replaceAudioId", item.duplicateMatch.id)
      }
      formData.append("file", item.file)

      const xhr = new XMLHttpRequest()
      xhr.timeout = 0
      xhrRefs.current.set(item.id, xhr)
      updateItem(item.id, { status: "uploading", progress: 0, uploadedBytes: 0, error: "" })

      xhr.upload.addEventListener("progress", (progressEvent) => {
        if (!progressEvent.lengthComputable) return

        updateItem(item.id, {
          uploadedBytes: progressEvent.loaded,
          totalBytes: progressEvent.total,
          progress: Math.round((progressEvent.loaded / progressEvent.total) * 100),
        })
      })

      xhr.addEventListener("load", () => {
        xhrRefs.current.delete(item.id)

        if (xhr.status >= 200 && xhr.status < 300) {
          updateItem(item.id, {
            status: item.uploadMode === "replace" ? "replaced" : item.uploadMode === "copy" ? "copy" : "success",
            progress: 100,
            uploadedBytes: item.file.size,
          })
          resolve()
          return
        }

        let error = "Erreur lors de l'upload"
        try {
          const response = JSON.parse(xhr.responseText)
          error = response.error || error
        } catch {}

        updateItem(item.id, { status: "error", error })
        resolve()
      })

      xhr.addEventListener("error", () => {
        xhrRefs.current.delete(item.id)
        updateItem(item.id, {
          status: "error",
          error: "Upload interrompu avant la fin. Réessayez avec une connexion stable.",
        })
        resolve()
      })

      xhr.addEventListener("abort", () => {
        xhrRefs.current.delete(item.id)
        updateItem(item.id, { status: "error", error: "Upload annulé." })
        resolve()
      })

      xhr.open("POST", "/api/upload")
      xhr.send(formData)
    })
  }

  const ignoreDuplicate = (id: string) => {
    updateItem(id, { status: "ignored", note: "Doublon ignoré." })
  }

  const importCopy = async (id: string) => {
    const item = queue.find((candidate) => candidate.id === id)
    if (!item) return

    const copyItem = {
      ...item,
      displayName: item.suggestedCopyName || withDuplicateSuffix(item.file.name, 2),
      uploadMode: "copy" as const,
      status: "pending" as const,
      note: "Import volontaire comme copie.",
    }

    updateItem(id, copyItem)
    await processQueue([copyItem])
  }

  const replaceDuplicate = async (id: string) => {
    const item = queue.find((candidate) => candidate.id === id)
    if (!item?.duplicateMatch) return

    const warning = item.duplicateMatch.status === "transcribed"
      ? "Ce fichier possède une transcription. Elle sera supprimée et devra être relancée."
      : "L'ancien fichier sera remplacé."
    const confirmed = window.confirm(`${warning}\n\nRemplacer "${item.duplicateMatch.title}" ?`)
    if (!confirmed) return

    const replacementItem = {
      ...item,
      displayName: item.file.name,
      uploadMode: "replace" as const,
      status: "pending" as const,
      note: `Remplacement de ${item.duplicateMatch.title}`,
    }

    updateItem(id, replacementItem)
    await processQueue([replacementItem])
  }

  const ignoreAllDuplicates = () => {
    setQueue((items) =>
      items.map((item) =>
        item.status === "duplicate" ? { ...item, status: "ignored", note: "Doublon ignoré." } : item
      )
    )
  }

  const importAllDuplicates = async () => {
    const duplicates = queue.filter((item) => item.status === "duplicate")
    if (duplicates.length === 0) return

    const confirmed = window.confirm(`Importer volontairement ${duplicates.length} doublon(s) comme copies ?`)
    if (!confirmed) return

    const copyItems = duplicates.map((item, index) => ({
      ...item,
      displayName: item.suggestedCopyName || withDuplicateSuffix(item.file.name, index + 2),
      uploadMode: "copy" as const,
      status: "pending" as const,
      note: "Import volontaire comme copie.",
    }))

    setQueue((items) =>
      items.map((item) => copyItems.find((copyItem) => copyItem.id === item.id) || item)
    )
    await processQueue(copyItems)
  }

  const retryFailed = async () => {
    const failedItems = queue
      .filter((item) => item.status === "error")
      .map((item) => ({
        ...item,
        status: "pending" as const,
        progress: 0,
        uploadedBytes: 0,
        error: "",
      }))

    setQueue((items) =>
      items.map((item) => failedItems.find((candidate) => candidate.id === item.id) || item)
    )

    await processQueue(failedItems)
  }

  const cancelActiveUploads = () => {
    for (const xhr of xhrRefs.current.values()) {
      xhr.abort()
    }
  }

  const summary = queue.reduce(
    (acc, item) => {
      acc[item.status] += 1
      return acc
    },
    {
      pending: 0,
      duplicate: 0,
      uploading: 0,
      success: 0,
      error: 0,
      ignored: skippedCount,
      replaced: 0,
      copy: 0,
    } satisfies Record<QueueStatus, number>
  )

  const totalQueuedBytes = queue.reduce((sum, item) => sum + item.totalBytes, 0)
  const uploadedBytes = queue.reduce((sum, item) => sum + item.uploadedBytes, 0)
  const totalProgress = totalQueuedBytes > 0 ? Math.round((uploadedBytes / totalQueuedBytes) * 100) : 0

  return (
    <div className={styles.uploadSection}>
      <input
        type="file"
        multiple
        accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {queue.length === 0 ? (
        <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={20} />
          <span>Importer audios</span>
        </button>
      ) : (
        <div className={styles.uploadProgress}>
          <div className={styles.uploadProgressHeader}>
            {isProcessing ? <Loader2 size={18} className={styles.spinner} /> : <CheckCircle size={18} />}
            <span>
              Import batch · {summary.success + summary.copy} importé(s) · {summary.replaced} remplacé(s) ·{" "}
              {summary.duplicate} doublon(s) en attente · {summary.error} erreur(s)
            </span>
            {isProcessing ? (
              <button className={styles.cancelBtn} onClick={cancelActiveUploads} title="Annuler les uploads actifs">
                <X size={16} />
              </button>
            ) : (
              <button className={styles.cancelBtn} onClick={reset} title="Fermer">
                <X size={16} />
              </button>
            )}
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${totalProgress}%` }} />
          </div>
          <div className={styles.uploadMeta}>
            {formatBytes(uploadedBytes)} / {formatBytes(totalQueuedBytes)} · max 100 fichiers · 500 MB/fichier
          </div>

          {summary.duplicate > 0 && (
            <div className={styles.duplicateBulkActions}>
              <button className={styles.secondaryActionBtn} onClick={ignoreAllDuplicates}>Ignorer tous les doublons</button>
              <button className={styles.secondaryActionBtn} onClick={importAllDuplicates}>
                Importer tous comme copies
              </button>
            </div>
          )}

          <div className={styles.uploadQueue}>
            {queue.map((item) => (
              <div key={item.id} className={styles.queueItem} data-status={item.status}>
                <div className={styles.queueInfo}>
                  <span className={styles.queueTitle} title={item.displayName}>{item.displayName}</span>
                  <span className={styles.queueMeta}>
                    {item.status === "pending" ? "En attente"
                      : item.status === "duplicate" ? "Doublon détecté · En attente de décision"
                      : item.status === "uploading" ? `Upload en cours · ${item.progress}%`
                      : item.status === "success" ? "Succès"
                      : item.status === "replaced" ? "Remplacé"
                      : item.status === "copy" ? "Importé comme copie"
                      : item.status === "ignored" ? "Ignoré"
                      : "Erreur"}
                    {" · "}
                    {formatBytes(item.totalBytes)}
                  </span>
                  {item.duplicateMatch && (
                    <span className={styles.queueNote}>
                      Similaire à : {item.duplicateMatch.title}
                      {item.duplicateMatch.duration ? ` · ${Math.round(item.duplicateMatch.duration / 60)} min` : ""}
                    </span>
                  )}
                  {item.note && <span className={styles.queueNote}>{item.note}</span>}
                  {item.error && (
                    <span className={styles.queueError}>
                      <AlertCircle size={12} /> {item.error}
                    </span>
                  )}
                  {item.status === "duplicate" && (
                    <div className={styles.duplicateActions}>
                      <button className={styles.secondaryActionBtn} onClick={() => ignoreDuplicate(item.id)}>
                        Annuler
                      </button>
                      {item.duplicateMatch && (
                        <button className={styles.secondaryActionBtn} onClick={() => replaceDuplicate(item.id)}>
                          <Replace size={13} /> Remplacer
                        </button>
                      )}
                      <button className={styles.secondaryActionBtn} onClick={() => importCopy(item.id)}>
                        <Copy size={13} /> Importer quand même
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!isProcessing && summary.error > 0 && (
            <button className={styles.retryBtn} onClick={retryFailed}>
              <RefreshCw size={14} /> Réessayer les fichiers échoués
            </button>
          )}

          {!isProcessing && (
            <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
              <UploadCloud size={18} />
              <span>Ajouter d&apos;autres audios</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
