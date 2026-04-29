"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Loader2, AlertCircle, CheckCircle, RefreshCw } from "lucide-react"
import styles from "./audio.module.css"

export default function TranscribeButton({
  audioId,
  initialStatus,
}: {
  audioId: string
  initialStatus: string
}) {
  const [status, setStatus] = useState(initialStatus)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleTranscribe = async () => {
    setIsTranscribing(true)
    setError("")
    setStatus("transcribing")

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioId }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus("transcribed")
        router.refresh()
      } else {
        setError(data.error || "Erreur de transcription")
        setStatus("error")
      }
    } catch (err) {
      setError("Erreur réseau")
      setStatus("error")
    } finally {
      setIsTranscribing(false)
    }
  }

  if (status === "transcribed") {
    return (
      <button
        className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
        onClick={() => router.push(`/texts/${audioId}`)}
      >
        <FileText size={16} />
        <span>Voir le texte</span>
      </button>
    )
  }

  if (status === "transcribing" || isTranscribing) {
    return (
      <div className={styles.transcribingState}>
        <Loader2 size={16} className={styles.spinner} />
        <span>Transcription en cours…</span>
        <span className={styles.transcribingNote}>Les longs fichiers peuvent prendre plusieurs minutes</span>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className={styles.errorState}>
        <AlertCircle size={16} />
        <span>{error || "Erreur"}</span>
        <button className={styles.retryInlineBtn} onClick={handleTranscribe}>
          <RefreshCw size={14} /> Réessayer
        </button>
      </div>
    )
  }

  return (
    <button className={styles.actionBtn} onClick={handleTranscribe}>
      <FileText size={16} />
      <span>Transcrire</span>
    </button>
  )
}
