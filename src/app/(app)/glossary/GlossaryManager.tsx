"use client"

import { useState } from "react"
import { Plus, Save, Trash2 } from "lucide-react"
import styles from "./glossary.module.css"

type GlossaryEntry = {
  id: string
  term: string
  correction: string | null
  category: string | null
  source: string
  createdAt: Date | string
}

const CATEGORIES = ["nom artiste", "proche", "argot", "darija", "expression", "adlib", "autre"]

export default function GlossaryManager({ initialEntries }: { initialEntries: GlossaryEntry[] }) {
  const [entries, setEntries] = useState(initialEntries)
  const [term, setTerm] = useState("")
  const [correction, setCorrection] = useState("")
  const [category, setCategory] = useState("autre")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const resetForm = () => {
    setTerm("")
    setCorrection("")
    setCategory("autre")
    setEditingId(null)
  }

  const save = async () => {
    setIsSaving(true)
    setError("")

    try {
      const response = await fetch(editingId ? `/api/glossary/${editingId}` : "/api/glossary", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, correction, category }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Sauvegarde impossible")
      }

      const body = await response.json()
      setEntries((current) => {
        const existingIndex = current.findIndex((entry) => entry.id === body.entry.id)
        if (existingIndex === -1) return [...current, body.entry].sort((a, b) => a.term.localeCompare(b.term))
        return current.map((entry) => (entry.id === body.entry.id ? body.entry : entry))
      })
      resetForm()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Sauvegarde impossible")
    } finally {
      setIsSaving(false)
    }
  }

  const edit = (entry: GlossaryEntry) => {
    setEditingId(entry.id)
    setTerm(entry.term)
    setCorrection(entry.correction || "")
    setCategory(entry.category || "autre")
  }

  const remove = async (entry: GlossaryEntry) => {
    const confirmed = window.confirm(`Supprimer "${entry.term}" du glossaire ?`)
    if (!confirmed) return

    const response = await fetch(`/api/glossary/${entry.id}`, { method: "DELETE" })
    if (!response.ok) {
      setError("Suppression impossible")
      return
    }

    setEntries((current) => current.filter((candidate) => candidate.id !== entry.id))
  }

  return (
    <div className={styles.container}>
      <section className={styles.panel}>
        <div className={styles.form}>
          <div className={styles.field}>
            <label>Mot ou expression</label>
            <input className={styles.input} value={term} onChange={(event) => setTerm(event.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Correction optionnelle</label>
            <input
              className={styles.input}
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Catégorie</label>
            <select className={styles.select} value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <button className={styles.button} onClick={save} disabled={isSaving}>
            {editingId ? <Save size={15} /> : <Plus size={15} />}
            {editingId ? "Mettre à jour" : "Ajouter"}
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </section>

      <section className={styles.panel}>
        <div className={styles.list}>
          {entries.map((entry) => (
            <div key={entry.id} className={styles.entry}>
              <div>
                <div className={styles.term}>{entry.term}</div>
                <div className={styles.muted}>{new Date(entry.createdAt).toLocaleDateString("fr-FR")}</div>
              </div>
              <div className={styles.muted}>{entry.correction || "Pas de correction"}</div>
              <span className={styles.tag}>{entry.category || "autre"}</span>
              <span className={styles.tag}>{entry.source}</span>
              <div className={styles.actions}>
                <button className={styles.ghostBtn} onClick={() => edit(entry)}>Modifier</button>
                <button className={styles.dangerBtn} onClick={() => remove(entry)} title="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
