"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import styles from "./audio.module.css"

export default function DeleteAudioButton({
  audioId,
  title,
}: {
  audioId: string
  title: string
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleDelete = async () => {
    const confirmed = window.confirm(`Supprimer définitivement "${title}" ?`)
    if (!confirmed) return

    setIsDeleting(true)
    setError("")

    try {
      const res = await fetch(`/api/audio/${audioId}`, {
        method: "DELETE",
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Suppression impossible")
        return
      }

      router.refresh()
    } catch {
      setError("Erreur réseau pendant la suppression")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className={styles.deleteAction}>
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={handleDelete}
        disabled={isDeleting}
        title="Supprimer l'audio"
      >
        {isDeleting ? <Loader2 size={15} className={styles.spinner} /> : <Trash2 size={15} />}
        <span>Supprimer</span>
      </button>
      {error && <span className={styles.deleteError}>{error}</span>}
    </div>
  )
}
