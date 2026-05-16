"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, UploadCloud, X } from "lucide-react"
import styles from "./instrumentals.module.css"

const MAX_AUDIO_UPLOAD_BYTES = 500 * 1024 * 1024
const ALLOWED_AUDIO_EXTENSIONS = /\.(mp3|m4a|wav)$/i

type UploadState = "idle" | "ready" | "uploading" | "success" | "error"

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const sizes = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${sizes[index]}`
}

export default function InstrumentalUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [bpm, setBpm] = useState("")
  const [musicalKey, setMusicalKey] = useState("")
  const [mood, setMood] = useState("")
  const [style, setStyle] = useState("")
  const [referenceArtist, setReferenceArtist] = useState("")
  const [rightsStatus, setRightsStatus] = useState("inconnu")
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const router = useRouter()

  const reset = () => {
    xhrRef.current?.abort()
    xhrRef.current = null
    setSelectedFile(null)
    setTitle("")
    setBpm("")
    setMusicalKey("")
    setMood("")
    setStyle("")
    setReferenceArtist("")
    setRightsStatus("inconnu")
    setYoutubeUrl("")
    setNotes("")
    setUploadState("idle")
    setProgress(0)
    setError("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!ALLOWED_AUDIO_EXTENSIONS.test(file.name)) {
      setError("Format ignoré. Utilisez MP3, M4A ou WAV.")
      setUploadState("error")
      return
    }

    if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
      setError("Fichier ignoré : limite 500 MB par fichier.")
      setUploadState("error")
      return
    }

    setSelectedFile(file)
    setTitle(file.name.replace(/\.[a-z0-9]+$/i, ""))
    setUploadState("ready")
    setError("")
    setProgress(0)
  }

  const upload = () => {
    if (!selectedFile || uploadState === "uploading") return

    const formData = new FormData()
    formData.append("file", selectedFile)
    formData.append("title", title)
    formData.append("bpm", bpm)
    formData.append("musicalKey", musicalKey)
    formData.append("mood", mood)
    formData.append("style", style)
    formData.append("referenceArtist", referenceArtist)
    formData.append("rightsStatus", rightsStatus)
    formData.append("youtubeUrl", youtubeUrl)
    formData.append("notes", notes)

    const xhr = new XMLHttpRequest()
    xhr.timeout = 0
    xhrRef.current = xhr
    setUploadState("uploading")
    setError("")

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return
      setProgress(Math.round((event.loaded / event.total) * 100))
    })

    xhr.addEventListener("load", () => {
      xhrRef.current = null
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadState("success")
        setProgress(100)
        router.refresh()
        setTimeout(reset, 800)
        return
      }

      let nextError = "Erreur lors de l'upload"
      try {
        nextError = JSON.parse(xhr.responseText).error || nextError
      } catch {}
      setError(nextError)
      setUploadState("error")
    })

    xhr.addEventListener("error", () => {
      xhrRef.current = null
      setError("Upload interrompu avant la fin. Réessayez avec une connexion stable.")
      setUploadState("error")
    })

    xhr.addEventListener("abort", () => {
      xhrRef.current = null
      setError("Upload annulé.")
      setUploadState("error")
    })

    xhr.open("POST", "/api/instrumentals")
    xhr.send(formData)
  }

  return (
    <div className={styles.uploadPanel}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
        onChange={handleFileChange}
        className={styles.fileInput}
      />

      {uploadState === "idle" ? (
        <button type="button" className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={20} />
          Importer une instru
        </button>
      ) : (
        <div className={styles.uploadBox}>
          <div className={styles.uploadBoxHeader}>
            <strong>{selectedFile ? selectedFile.name : "Instrumentale"}</strong>
            <button type="button" onClick={reset} title="Fermer">
              <X size={16} />
            </button>
          </div>

          {selectedFile && <p>{formatBytes(selectedFile.size)} · max 500 MB</p>}

          <div className={styles.uploadFields}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" />
            <input value={bpm} onChange={(e) => setBpm(e.target.value)} placeholder="BPM" inputMode="numeric" />
            <input value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} placeholder="Tonalité" />
            <input value={mood} onChange={(e) => setMood(e.target.value)} placeholder="Mood" />
            <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Style" />
            <input value={referenceArtist} onChange={(e) => setReferenceArtist(e.target.value)} placeholder="Artiste / type beat" />
            <select value={rightsStatus} onChange={(e) => setRightsStatus(e.target.value)}>
              <option value="perso">Perso</option>
              <option value="achete">Acheté</option>
              <option value="a_acheter">À acheter</option>
              <option value="libre">Libre</option>
              <option value="brouillon">Brouillon</option>
              <option value="inconnu">Inconnu</option>
            </select>
            <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="Lien YouTube de référence" />
          </div>

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} />

          {uploadState === "uploading" && (
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          )}

          {error && <p className={styles.errorText}>{error}</p>}

          <button type="button" className={styles.uploadBtn} onClick={upload} disabled={uploadState === "uploading"}>
            {uploadState === "uploading" ? <Loader2 size={18} className={styles.spinner} /> : <UploadCloud size={18} />}
            {uploadState === "uploading" ? `Upload ${progress}%` : "Enregistrer l'instru"}
          </button>
        </div>
      )}
    </div>
  )
}
