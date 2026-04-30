"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Loader2, AlertCircle, RefreshCw } from "lucide-react"
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
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState(initialStatus === "transcribed" ? 100 : 0)
  const router = useRouter()

  useEffect(() => {
    if (status !== "transcribing") return

    let cancelled = false
    const poll = async () => {
      try {
        const query = jobId ? `id=${jobId}` : `audioId=${audioId}`
        const res = await fetch(`/api/transcription-status?${query}`)
        const data = await res.json()

        if (cancelled) return

        if (!res.ok) {
          setError(data.error || "Erreur de statut")
          setStatus("error")
          setIsTranscribing(false)
          return
        }

        if (data.jobId) setJobId(data.jobId)
        setProgress(data.progress || 0)

        if (data.status === "transcribed" || data.jobStatus === "DONE") {
          setStatus("transcribed")
          setIsTranscribing(false)
          router.refresh()
          return
        }

        if (data.status === "error" || data.jobStatus === "FAILED") {
          setError(data.error || "Erreur de transcription")
          setStatus("error")
          setIsTranscribing(false)
          return
        }

        window.setTimeout(poll, 1500)
      } catch {
        if (!cancelled) {
          window.setTimeout(poll, 3000)
        }
      }
    }

    poll()

    return () => {
      cancelled = true
    }
  }, [audioId, jobId, router, status])

  const handleTranscribe = async () => {
    setIsTranscribing(true)
    setError("")
    setStatus("transcribing")
    setProgress(0)

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioId }),
      })

      const data = await res.json()

      if (res.ok) {
        setJobId(data.jobId)
        setProgress(data.progress || 0)
      } else {
        setError(data.error || "Erreur de transcription")
        setStatus("error")
        setIsTranscribing(false)
      }
    } catch {
      setError("Erreur réseau")
      setStatus("error")
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
        <span>Transcription en cours… {progress}%</span>
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
