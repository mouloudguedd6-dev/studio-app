"use client"

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { BookOpenText, Save, Sparkles } from "lucide-react"
import { normalizeTerm } from "@/lib/text-processing/artist-glossary"
import type { SuspiciousWord } from "@/lib/text-processing/clean-lyrics"
import styles from "../textDetail.module.css"

function splitText(text: string) {
  return text.split(/(\n|[\p{L}][\p{L}’'-]*)/gu)
}

function replaceTermInText(text: string, term: string, replacement: string) {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return text.replace(new RegExp(`\\b${escapedTerm}\\b`, "giu"), replacement)
}

export default function WritingEditor({
  audioId,
  cleanText,
  initialLyricsText,
  initialSuspiciousWords,
  hasUserEditedLyrics,
}: {
  audioId: string
  cleanText: string
  initialLyricsText: string
  initialSuspiciousWords: SuspiciousWord[]
  hasUserEditedLyrics: boolean
}) {
  const [editorText, setEditorText] = useState(initialLyricsText)
  const [referenceText, setReferenceText] = useState(cleanText)
  const [suspiciousWords, setSuspiciousWords] = useState(initialSuspiciousWords)
  const [selectedWord, setSelectedWord] = useState<SuspiciousWord | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [error, setError] = useState("")
  const [editorVersion, setEditorVersion] = useState(0)
  const editorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const suspiciousByTerm = useMemo(() => {
    return new Map(suspiciousWords.map((word) => [normalizeTerm(word.term), word]))
  }, [suspiciousWords])

  const readEditorText = () => editorRef.current?.innerText.replace(/\n{3,}/g, "\n\n").trim() || editorText

  const setTextFromServer = (text: string) => {
    setEditorText(text)
    setEditorVersion((version) => version + 1)
  }

  const closeMenu = () => {
    setSelectedWord(null)
    setMenuPosition(null)
  }

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (menuRef.current?.contains(target)) return
      if (target.closest("[data-suspicious-term]")) return
      closeMenu()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  const save = async () => {
    setIsSaving(true)
    setError("")
    setStatusMessage("")

    const lyricsText = readEditorText()

    try {
      const response = await fetch(`/api/texts/${audioId}/writing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyricsText }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Sauvegarde impossible")
      }

      const body = await response.json()
      setTextFromServer(body.lyricsText || lyricsText)
      setReferenceText(body.cleanText || body.lyricsText || lyricsText)
      setSuspiciousWords(body.suspiciousWords || [])
      closeMenu()
      setStatusMessage("Lyrics sauvegardées")
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Sauvegarde impossible")
    } finally {
      setIsSaving(false)
    }
  }

  const regenerate = async (confirmReplace = false) => {
    setIsGenerating(true)
    setError("")
    setStatusMessage("")

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
        await regenerate(true)
        return
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Régénération impossible")
      }

      const body = await response.json()
      setTextFromServer(body.lyricsText || "")
      setReferenceText(body.cleanText || body.lyricsText || "")
      setSuspiciousWords(body.suspiciousWords || [])
      closeMenu()
      setStatusMessage("Clean lyrics régénérées")
      router.refresh()
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Régénération impossible")
    } finally {
      setIsGenerating(false)
    }
  }

  const applyWordAction = async (
    action: "validate" | "replace" | "addToGlossary",
    word: SuspiciousWord,
    replacement = ""
  ) => {
    setError("")
    setStatusMessage("")

    let currentText = readEditorText()

    if (action === "replace") {
      if (!replacement) return
      currentText = replaceTermInText(currentText, word.term, replacement)
    }

    if (action === "addToGlossary") {
      replacement = window.prompt("Correction optionnelle :", word.suggestion || "")?.trim() || ""
    }

    const response = await fetch(`/api/texts/${audioId}/suspicious-word`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        term: word.term,
        replacement,
        lyricsText: currentText,
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setError(body.error || "Action impossible")
      return
    }

    const body = await response.json()
    setTextFromServer(body.lyricsText || currentText)
    setReferenceText(body.cleanText || body.lyricsText || currentText)
    setSuspiciousWords(body.suspiciousWords || [])
    closeMenu()
    setStatusMessage(
      action === "validate"
        ? "Mot validé tel quel"
        : action === "replace"
          ? "Mot modifié"
          : "Mot ajouté au glossaire"
    )
    router.refresh()
  }

  const validateCurrentWord = () => {
    if (!selectedWord) return
    void applyWordAction("validate", selectedWord)
  }

  const applySuggestion = () => {
    if (!selectedWord?.suggestion) return
    void applyWordAction("replace", selectedWord, selectedWord.suggestion)
  }

  const manuallyReplace = () => {
    if (!selectedWord) return
    const replacement = window.prompt("Remplacer par :", selectedWord.suggestion || selectedWord.term)?.trim() || ""
    if (!replacement) return
    void applyWordAction("replace", selectedWord, replacement)
  }

  const addCurrentWordToGlossary = () => {
    if (!selectedWord) return
    const replacement = window.prompt("Correction optionnelle :", selectedWord.suggestion || "")?.trim() || ""
    void applyWordAction("addToGlossary", selectedWord, replacement)
  }

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const wordElement = target.closest<HTMLElement>("[data-suspicious-term]")
    const term = wordElement?.dataset.suspiciousTerm
    if (!term || !wordElement) return

    const rect = wordElement.getBoundingClientRect()
    setSelectedWord(suspiciousByTerm.get(normalizeTerm(term)) || null)
    setMenuPosition({
      top: rect.bottom + 8,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - 296)),
    })
  }

  return (
    <div className={styles.workshopStack}>
      <section className={styles.editorPanel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Atelier d&apos;écriture</h2>
            <p>
              {suspiciousWords.length > 0
                ? `${suspiciousWords.length} mot(s) à vérifier. Clique sur un mot rouge.`
                : "Aucun mot douteux détecté."}
            </p>
          </div>
          <div className={styles.editorActions}>
            <button className={styles.secondaryBtn} onClick={() => regenerate(false)} disabled={isGenerating}>
              <Sparkles size={16} />
              {isGenerating ? "Génération..." : "Régénérer clean lyrics"}
            </button>
            <button className={styles.primaryBtn} onClick={save} disabled={isSaving}>
              <Save size={16} />
              {isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        </div>

        <div
          key={editorVersion}
          ref={editorRef}
          className={styles.lyricsEditor}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onClick={handleEditorClick}
        >
          {splitText(editorText).map((part, index) => {
            if (part === "\n") return <br key={`${part}-${index}`} />

            const suspiciousWord = suspiciousByTerm.get(normalizeTerm(part))
            if (!suspiciousWord) return <span key={`${part}-${index}`}>{part}</span>

            const title = suspiciousWord.suggestion
              ? `${suspiciousWord.reason}. Suggestion : ${suspiciousWord.suggestion}`
              : suspiciousWord.reason

            return (
              <strong
                key={`${part}-${index}`}
                className={styles.suspiciousWord}
                data-suspicious-term={suspiciousWord.term}
                title={title}
              >
                {part}
              </strong>
            )
          })}
        </div>

        {selectedWord && (
          <div
            ref={menuRef}
            className={styles.wordContextMenu}
            style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : undefined}
          >
            <div>
              <strong>{selectedWord.term}</strong>
              <span>{selectedWord.reason}</span>
              {selectedWord.suggestion && <span>Suggestion : {selectedWord.suggestion}</span>}
            </div>
            <div className={styles.wordActions}>
              <button onClick={validateCurrentWord}>Valider tel quel</button>
              {selectedWord.suggestion && (
                <button onClick={applySuggestion}>Appliquer suggestion</button>
              )}
              <button onClick={manuallyReplace}>Modifier manuellement</button>
              <button onClick={addCurrentWordToGlossary}>
                <BookOpenText size={14} />
                Ajouter au glossaire
              </button>
            </div>
          </div>
        )}

        {(statusMessage || error) && (
          <div className={error ? styles.editorError : styles.editorStatus}>
            {error || statusMessage}
          </div>
        )}

        {hasUserEditedLyrics && (
          <p className={styles.editorNote}>
            Cette version a déjà été modifiée manuellement. La régénération demandera une confirmation.
          </p>
        )}
      </section>

      <section className={styles.referencePanel}>
        <h2>Texte clean</h2>
        <p>{referenceText || "Aucun texte clean disponible."}</p>
      </section>
    </div>
  )
}
