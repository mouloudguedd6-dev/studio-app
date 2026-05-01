"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import styles from "./textDetail.module.css"

export default function GenerateCleanLyricsButton({
  audioId,
  hasUserEditedLyrics,
}: {
  audioId: string
  hasUserEditedLyrics: boolean
}) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const generate = async (confirmReplace = false) => {
    setIsGenerating(true)
    setError("")

    try {
      const response = await fetch(`/api/texts/${audioId}/clean-lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmReplace }),
      })

      if (response.status === 409) {
        const confirmed = window.confirm(
          "Ces lyrics ont été modifiées manuellement. Régénérer clean lyrics remplacera la version actuelle. Continuer ?"
        )
        if (!confirmed) return
        await generate(true)
        return
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Régénération impossible")
      }

      router.refresh()
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Régénération impossible")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className={styles.inlineAction}>
      <button
        className={styles.secondaryBtn}
        disabled={isGenerating}
        onClick={() => generate(false)}
        title={hasUserEditedLyrics ? "Une confirmation sera demandée avant de remplacer les lyrics modifiées." : undefined}
      >
        <Sparkles size={16} />
        {isGenerating ? "Génération..." : "Régénérer clean lyrics"}
      </button>
      {error && <span className={styles.inlineError}>{error}</span>}
    </div>
  )
}
