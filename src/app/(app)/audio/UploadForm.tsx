"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { UploadCloud, Loader2, CheckCircle, AlertCircle, X } from "lucide-react"
import styles from "./audio.module.css"

type UploadState = "idle" | "uploading" | "success" | "error"

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export default function UploadForm() {
  const [state, setState] = useState<UploadState>("idle")
  const [progress, setProgress] = useState(0)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [errorMessage, setErrorMessage] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const router = useRouter()

  const reset = () => {
    setState("idle")
    setProgress(0)
    setUploadedBytes(0)
    setTotalBytes(0)
    setErrorMessage("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const cancelUpload = () => {
    xhrRef.current?.abort()
    reset()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate audio type
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|m4a|wav|ogg|flac|aac|opus|wma)$/i)) {
      setErrorMessage("Format non supporté. Utilisez MP3, M4A, WAV, OGG ou FLAC.")
      setState("error")
      return
    }

    setState("uploading")
    setProgress(0)
    setTotalBytes(file.size)
    setUploadedBytes(0)
    setErrorMessage("")

    const formData = new FormData()
    formData.append("file", file)

    // Use XHR instead of fetch for upload progress tracking
    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setUploadedBytes(event.loaded)
        setTotalBytes(event.total)
        setProgress(Math.round((event.loaded / event.total) * 100))
      }
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setState("success")
        setProgress(100)
        setTimeout(() => {
          reset()
          router.refresh()
        }, 1500)
      } else {
        let errMsg = "Erreur lors de l'upload"
        try {
          const resp = JSON.parse(xhr.responseText)
          errMsg = resp.error || errMsg
        } catch {}
        setErrorMessage(errMsg)
        setState("error")
      }
    })

    xhr.addEventListener("error", () => {
      setErrorMessage("Erreur réseau — vérifiez votre connexion")
      setState("error")
    })

    xhr.addEventListener("abort", () => {
      reset()
    })

    xhr.open("POST", "/api/upload")
    xhr.send(formData)
  }

  return (
    <div className={styles.uploadSection}>
      <input
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.opus,.wma"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {state === "idle" && (
        <button
          className={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud size={20} />
          <span>Importer un audio</span>
        </button>
      )}

      {state === "uploading" && (
        <div className={styles.uploadProgress}>
          <div className={styles.uploadProgressHeader}>
            <Loader2 size={18} className={styles.spinner} />
            <span>Upload en cours… {progress}%</span>
            <button className={styles.cancelBtn} onClick={cancelUpload} title="Annuler">
              <X size={16} />
            </button>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.uploadMeta}>
            {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
            {totalBytes > 50 * 1024 * 1024 && (
              <span className={styles.largeFileNote}> · Gros fichier — cela peut prendre plusieurs minutes</span>
            )}
          </div>
        </div>
      )}

      {state === "success" && (
        <div className={styles.uploadSuccess}>
          <CheckCircle size={18} />
          <span>Fichier importé avec succès</span>
        </div>
      )}

      {state === "error" && (
        <div className={styles.uploadError}>
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
          <button className={styles.retryBtn} onClick={reset}>Réessayer</button>
        </div>
      )}
    </div>
  )
}
