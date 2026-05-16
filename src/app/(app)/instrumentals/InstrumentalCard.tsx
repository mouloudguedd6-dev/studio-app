"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Clock, ExternalLink, Gauge, Loader2, Pencil, Save, Scale, Trash2, X } from "lucide-react"
import styles from "./instrumentals.module.css"

type MetaIconName = "clock" | "gauge" | "scale"

type InstrumentalCardData = {
  id: string
  title: string
  audioUrl: string
  durationLabel: string
  fileSizeLabel: string
  format: string | null
  bpm: number | null
  musicalKey: string | null
  mood: string | null
  style: string | null
  referenceArtist: string | null
  rightsStatus: string
  youtubeUrl: string | null
  notes: string | null
  createdAtLabel: string
  meta: Array<{ iconName: MetaIconName; label: string }>
}

type EditState = {
  title: string
  bpm: string
  musicalKey: string
  mood: string
  style: string
  referenceArtist: string
  rightsStatus: string
  youtubeUrl: string
  notes: string
}

const rightsLabels: Record<string, string> = {
  perso: "Perso",
  achete: "Acheté",
  a_acheter: "À acheter",
  libre: "Libre",
  brouillon: "Brouillon",
  inconnu: "Inconnu",
}

const metaIcons = {
  clock: Clock,
  gauge: Gauge,
  scale: Scale,
} satisfies Record<MetaIconName, typeof Clock>

function toEditState(instrumental: InstrumentalCardData): EditState {
  return {
    title: instrumental.title,
    bpm: instrumental.bpm ? String(instrumental.bpm) : "",
    musicalKey: instrumental.musicalKey || "",
    mood: instrumental.mood || "",
    style: instrumental.style || "",
    referenceArtist: instrumental.referenceArtist || "",
    rightsStatus: instrumental.rightsStatus,
    youtubeUrl: instrumental.youtubeUrl || "",
    notes: instrumental.notes || "",
  }
}

export default function InstrumentalCard({ instrumental }: { instrumental: InstrumentalCardData }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editState, setEditState] = useState<EditState>(() => toEditState(instrumental))
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const save = async () => {
    setIsSaving(true)
    setError("")

    try {
      const res = await fetch(`/api/instrumentals/${instrumental.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editState),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Sauvegarde impossible")
        return
      }

      setIsEditing(false)
      router.refresh()
    } catch {
      setError("Erreur réseau pendant la sauvegarde.")
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async () => {
    const confirmed = window.confirm(`Supprimer définitivement "${instrumental.title}" ?`)
    if (!confirmed) return

    setIsDeleting(true)
    setError("")

    try {
      const res = await fetch(`/api/instrumentals/${instrumental.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Suppression impossible")
        return
      }

      router.refresh()
    } catch {
      setError("Erreur réseau pendant la suppression.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{instrumental.title}</h2>
          <p>
            {instrumental.format?.toUpperCase() || "Audio"} · {instrumental.fileSizeLabel} · importée le {instrumental.createdAtLabel}
          </p>
        </div>
        <span className={styles.rightsBadge}>{rightsLabels[instrumental.rightsStatus] || "Inconnu"}</span>
      </div>

      <audio controls src={instrumental.audioUrl} className={styles.audioPlayer} />

      {isEditing ? (
        <div className={styles.editForm}>
          <input value={editState.title} onChange={(e) => setEditState({ ...editState, title: e.target.value })} placeholder="Titre" />
          <input value={editState.bpm} onChange={(e) => setEditState({ ...editState, bpm: e.target.value })} placeholder="BPM" inputMode="numeric" />
          <input value={editState.musicalKey} onChange={(e) => setEditState({ ...editState, musicalKey: e.target.value })} placeholder="Tonalité" />
          <input value={editState.mood} onChange={(e) => setEditState({ ...editState, mood: e.target.value })} placeholder="Mood" />
          <input value={editState.style} onChange={(e) => setEditState({ ...editState, style: e.target.value })} placeholder="Style" />
          <input value={editState.referenceArtist} onChange={(e) => setEditState({ ...editState, referenceArtist: e.target.value })} placeholder="Artiste / type beat" />
          <select value={editState.rightsStatus} onChange={(e) => setEditState({ ...editState, rightsStatus: e.target.value })}>
            <option value="perso">Perso</option>
            <option value="achete">Acheté</option>
            <option value="a_acheter">À acheter</option>
            <option value="libre">Libre</option>
            <option value="brouillon">Brouillon</option>
            <option value="inconnu">Inconnu</option>
          </select>
          <input value={editState.youtubeUrl} onChange={(e) => setEditState({ ...editState, youtubeUrl: e.target.value })} placeholder="Lien YouTube de référence" />
          <textarea value={editState.notes} onChange={(e) => setEditState({ ...editState, notes: e.target.value })} placeholder="Notes" rows={2} />
        </div>
      ) : (
        <>
          <div className={styles.metaGrid}>
            {instrumental.meta.map((item) => (
              <span key={item.label}>
                {(() => {
                  const Icon = metaIcons[item.iconName]
                  return <Icon size={14} />
                })()}
                {item.label}
              </span>
            ))}
          </div>

          <div className={styles.tags}>
            {instrumental.mood && <span>{instrumental.mood}</span>}
            {instrumental.style && <span>{instrumental.style}</span>}
            {instrumental.referenceArtist && <span>{instrumental.referenceArtist}</span>}
          </div>

          {instrumental.notes && <p className={styles.notes}>{instrumental.notes}</p>}

          {instrumental.youtubeUrl && (
            <a href={instrumental.youtubeUrl} target="_blank" rel="noreferrer" className={styles.youtubeLink}>
              <ExternalLink size={14} />
              Référence YouTube
            </a>
          )}
        </>
      )}

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.cardActions}>
        {isEditing ? (
          <>
            <button type="button" className={styles.primaryAction} onClick={save} disabled={isSaving}>
              {isSaving ? <Loader2 size={15} className={styles.spinner} /> : <Save size={15} />}
              Enregistrer
            </button>
            <button type="button" className={styles.secondaryAction} onClick={() => {
              setEditState(toEditState(instrumental))
              setIsEditing(false)
              setError("")
            }}>
              <X size={15} />
              Annuler
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.secondaryAction} onClick={() => setIsEditing(true)}>
              <Pencil size={15} />
              Modifier
            </button>
            <button type="button" className={styles.dangerAction} onClick={remove} disabled={isDeleting}>
              {isDeleting ? <Loader2 size={15} className={styles.spinner} /> : <Trash2 size={15} />}
              Supprimer
            </button>
          </>
        )}
      </div>
    </article>
  )
}
