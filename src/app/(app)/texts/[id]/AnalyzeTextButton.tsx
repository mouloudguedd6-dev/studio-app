"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Brain, Loader2 } from "lucide-react"
import styles from "./textDetail.module.css"

export default function AnalyzeTextButton({ audioId }: { audioId: string }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const analyze = async () => {
    setIsAnalyzing(true)
    setError("")

    try {
      const response = await fetch(`/api/texts/${audioId}/analysis`, {
        method: "POST",
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Analyse impossible")
      }

      router.refresh()
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Analyse impossible")
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className={styles.inlineAction}>
      <button className={styles.primaryBtn} disabled={isAnalyzing} onClick={analyze}>
        {isAnalyzing ? <Loader2 size={16} className={styles.spinner} /> : <Brain size={16} />}
        {isAnalyzing ? "Analyse..." : "Analyser le texte"}
      </button>
      {error && <span className={styles.inlineError}>{error}</span>}
    </div>
  )
}
