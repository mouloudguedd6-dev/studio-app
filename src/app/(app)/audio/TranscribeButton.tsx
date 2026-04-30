"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, FileText, Loader2, RefreshCw } from "lucide-react"
import styles from "./audio.module.css"

export default function TranscribeButton({
  audioId,
  initialStatus,
}: {
  audioId: string
  initialStatus: string
}) {
  const [status, setStatus] = useState(initialStatus)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
          setIsSubmitting(false)
          return
        }

        if (data.jobId) setJobId(data.jobId)
        setProgress(data.progress || 0)

        if (data.status === "transcribed" || data.jobStatus === "DONE") {
          setStatus("transcribed")
          setIsSubmitting(false)
          router.refresh()
          return
        }

        if (data.status === "error" || data.jobStatus === "FAILED") {
          setError(data.error || "Erreur de transcription")
          setStatus("error")
          setIsSubmitting(false)
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

  const startTranscription = async (force = false) => {
    if (force) {
      const confirmed = window.confirm("Relancer la transcription ? L'ancien texte sera remplacé.")
      if (!confirmed) return
    }

    setIsSubmitting(true)
    setError("")
    setStatus("transcribing")
    setProgress(0)
    setJobId(null)

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioId, force }),
      })

      const data = await res.json()

      if (res.ok) {
        setJobId(data.jobId)
        setProgress(data.progress || 0)
        return
      }

      setError(data.error || "Erreur de transcription")
      setStatus(force ? "transcribed" : "error")
      setIsSubmitting(false)
    } catch {
      setError("Erreur réseau")
      setStatus(force ? "transcribed" : "error")
      setIsSubmitting(false)
    }
  }

  if (status === "transcribed") {
    return (
      <div className={styles.transcribedActions}>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
          onClick={() => router.push(`/texts/${audioId}`)}
        >
          <FileText size={16} />
          <span>Voir le texte</span>
        </button>
        <button className={styles.secondaryActionBtn} onClick={() => startTranscription(true)} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 size={14} className={styles.spinner} /> : <RefreshCw size={14} />}
          <span>Relancer</span>
        </button>
        {error && <span className={styles.transcriptionError}>{error}</span>}
      </div>
    )
  }

  if (status === "transcribing") {
    return (
      <div className={styles.transcribingState}>
        <Loader2 size={16} className={styles.spinner} />
        <span>Transcription en cours… {progress}%</span>
        <span className={styles.transcribingNote}>Job actif, relance désactivée</span>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className={styles.errorState}>
        <AlertCircle size={16} />
        <span>{error || "Erreur"}</span>
        <button className={styles.retryInlineBtn} onClick={() => startTranscription(true)} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 size={14} className={styles.spinner} /> : <RefreshCw size={14} />}
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <button className={styles.actionBtn} onClick={() => startTranscription(false)} disabled={isSubmitting}>
      {isSubmitting ? <Loader2 size={16} className={styles.spinner} /> : <FileText size={16} />}
      <span>Transcrire</span>
    </button>
  )
}
