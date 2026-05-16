"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ExternalLink,
  Music,
  Palette,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react"
import styles from "./profile.module.css"

type SuggestedInstrumentalReference = {
  id: string
  title: string
  youtubeUrl: string | null
  mood: string | null
  style: string | null
  bpm: number | null
  note: string | null
  referenceArtist: string | null
}

type ReferenceFormState = {
  title: string
  youtubeUrl: string
  mood: string
  style: string
  bpm: string
  note: string
  referenceArtist: string
}

const emptyReferenceForm: ReferenceFormState = {
  title: "",
  youtubeUrl: "",
  mood: "",
  style: "",
  bpm: "",
  note: "",
  referenceArtist: "",
}

function toReferenceForm(reference: SuggestedInstrumentalReference): ReferenceFormState {
  return {
    title: reference.title,
    youtubeUrl: reference.youtubeUrl || "",
    mood: reference.mood || "",
    style: reference.style || "",
    bpm: reference.bpm ? String(reference.bpm) : "",
    note: reference.note || "",
    referenceArtist: reference.referenceArtist || "",
  }
}

export default function ProfilePage() {
  const [artistIdentity, setArtistIdentity] = useState("")
  const [artistsRef, setArtistsRef] = useState("")
  const [moods, setMoods] = useState("")
  const [instrumentalStyles, setInstrumentalStyles] = useState("")
  const [influences, setInfluences] = useState("")
  const [artisticDirection, setArtisticDirection] = useState("")
  const [artisticNotes, setArtisticNotes] = useState("")
  const [suggestedReferences, setSuggestedReferences] = useState<SuggestedInstrumentalReference[]>([])
  const [availableInstrumentalsCount, setAvailableInstrumentalsCount] = useState(0)
  const [referenceForm, setReferenceForm] = useState<ReferenceFormState>(emptyReferenceForm)
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingReference, setIsSavingReference] = useState(false)
  const [message, setMessage] = useState("")
  const [referenceMessage, setReferenceMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch("/api/profile")
      .then(res => res.json())
      .then(data => {
        if (data.profile) {
          setArtistIdentity(data.profile.artistIdentity || "")
          setArtistsRef(data.profile.artistsRef || "")
          setMoods(data.profile.moods || "")
          setInstrumentalStyles(data.profile.instrumentalStyles || "")
          setInfluences(data.profile.influences || "")
          setArtisticDirection(data.profile.artisticDirection || "")
          setArtisticNotes(data.profile.artisticNotes || "")
        }
        setSuggestedReferences(data.suggestedInstrumentalReferences || [])
        setAvailableInstrumentalsCount(data.instrumentalSummary?.availableCount || 0)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage("")

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistIdentity,
          artistsRef,
          moods,
          instrumentalStyles,
          influences,
          artisticDirection,
          artisticNotes,
        }),
      })

      if (res.ok) {
        setMessage("Profil DA sauvegardé avec succès.")
      } else {
        setMessage("Erreur lors de la sauvegarde.")
      }
    } catch (err) {
      console.error(err)
      setMessage("Erreur réseau.")
    } finally {
      setIsSaving(false)
      setTimeout(() => setMessage(""), 3000)
    }
  }

  const resetReferenceForm = () => {
    setReferenceForm(emptyReferenceForm)
    setEditingReferenceId(null)
    setReferenceMessage("")
  }

  const handleReferenceSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSavingReference(true)
    setReferenceMessage("")

    try {
      const endpoint = editingReferenceId
        ? `/api/profile/instrumental-references/${editingReferenceId}`
        : "/api/profile/instrumental-references"
      const res = await fetch(endpoint, {
        method: editingReferenceId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(referenceForm),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setReferenceMessage(data.error || "Référence impossible à sauvegarder.")
        return
      }

      setSuggestedReferences((references) => {
        if (!editingReferenceId) return [data.reference, ...references]
        return references.map((reference) => reference.id === editingReferenceId ? data.reference : reference)
      })
      resetReferenceForm()
    } catch {
      setReferenceMessage("Erreur réseau pendant la sauvegarde.")
    } finally {
      setIsSavingReference(false)
    }
  }

  const deleteReference = async (reference: SuggestedInstrumentalReference) => {
    const confirmed = window.confirm(`Supprimer la référence "${reference.title}" ?`)
    if (!confirmed) return

    const res = await fetch(`/api/profile/instrumental-references/${reference.id}`, {
      method: "DELETE",
    })

    if (res.ok) {
      setSuggestedReferences((references) => references.filter((item) => item.id !== reference.id))
      if (editingReferenceId === reference.id) resetReferenceForm()
      return
    }

    setReferenceMessage("Suppression impossible.")
  }

  if (isLoading) return <div className={styles.container}><p>Chargement du profil...</p></div>

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Profil DA</h1>
          <p className={styles.subtitle}>Définissez votre Direction Artistique. Ces infos guideront les futurs choix de textes, beats et maquettes.</p>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <UserIcon size={48} />
        </div>
        
        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="artistIdentity"><UserIcon size={16} /> Identité artiste</label>
            <textarea
              id="artistIdentity"
              value={artistIdentity}
              onChange={(e) => setArtistIdentity(e.target.value)}
              placeholder="Ex: SELIM, rap mélodique francophone, racines marocaines, voix intime et solaire..."
              className={styles.textarea}
              rows={3}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="artistsRef"><Star size={16} /> Artistes de référence</label>
            <input
              id="artistsRef"
              type="text"
              value={artistsRef}
              onChange={(e) => setArtistsRef(e.target.value)}
              placeholder="Ex: ElGrandeToto, Vacra, TIF, Saint Levant"
              className={styles.input}
            />
            <p className={styles.helpText}>Séparés par des virgules. Ces références guident la couleur musicale des Yaourts A/B.</p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="moods"><Palette size={16} /> Moods et ambiances</label>
            <textarea
              id="moods"
              value={moods}
              onChange={(e) => setMoods(e.target.value)}
              placeholder="Ex: Mélancolique, Énergique, Nuit, Club, Introspectif..."
              className={styles.textarea}
              rows={3}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="instrumentalStyles"><Music size={16} /> Styles instrumentaux</label>
            <textarea
              id="instrumentalStyles"
              value={instrumentalStyles}
              onChange={(e) => setInstrumentalStyles(e.target.value)}
              placeholder="Ex: Drill, Afro-beat, Lo-fi, Boom-bap, Trap mélancolique..."
              className={styles.textarea}
              rows={3}
            />
            <p className={styles.helpText}>Les styles ici influencent la suggestion de beats et directions instrumentales A/B.</p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="influences">Influences</label>
            <textarea
              id="influences"
              value={influences}
              onChange={(e) => setInfluences(e.target.value)}
              placeholder="Ex: Sonorités marocaines, influences US trap, mélodies méditerranéennes..."
              className={styles.textarea}
              rows={3}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="artisticDirection">Direction artistique</label>
            <textarea
              id="artisticDirection"
              value={artisticDirection}
              onChange={(e) => setArtisticDirection(e.target.value)}
              placeholder="Ex: Love sombre, refrains mélodiques, couplets directs, chaleur orientale sans folklore appuyé..."
              className={styles.textarea}
              rows={4}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="artisticNotes">Vocabulaire / notes artistiques</label>
            <textarea
              id="artisticNotes"
              value={artisticNotes}
              onChange={(e) => setArtisticNotes(e.target.value)}
              placeholder="Mots, images, thèmes, interdits, tics d'écriture, obsessions, nuances de ton..."
              className={styles.textarea}
              rows={3}
            />
          </div>

          <button type="submit" disabled={isSaving} className={styles.submitBtn}>
            <Save size={18} />
            <span>{isSaving ? "Sauvegarde..." : "Sauvegarder mon profil DA"}</span>
          </button>

          {message && <div className={styles.message}>{message}</div>}
        </form>

        <section className={styles.instrumentalSummary}>
          <div>
            <h2>Instrumentales</h2>
            <p>{availableInstrumentalsCount} instrumentale(s) exploitable(s) liées à cette DA.</p>
          </div>
          <Link href="/instrumentals" className={styles.linkButton}>
            <Music size={16} />
            Ouvrir
          </Link>
        </section>

        <section className={styles.referenceSection}>
          <div className={styles.sectionTitleRow}>
            <div>
              <h2>Références instrumentales suggérées</h2>
              <p>Inspirations globales de la DA artiste. Les liens YouTube restent de simples pistes d'écoute.</p>
            </div>
          </div>

          <form onSubmit={handleReferenceSubmit} className={styles.referenceForm}>
            <div className={styles.referenceGrid}>
              <input
                value={referenceForm.title}
                onChange={(e) => setReferenceForm({ ...referenceForm, title: e.target.value })}
                placeholder="Titre ou nom de référence"
                className={styles.input}
              />
              <input
                value={referenceForm.youtubeUrl}
                onChange={(e) => setReferenceForm({ ...referenceForm, youtubeUrl: e.target.value })}
                placeholder="Lien YouTube optionnel"
                className={styles.input}
              />
              <input
                value={referenceForm.mood}
                onChange={(e) => setReferenceForm({ ...referenceForm, mood: e.target.value })}
                placeholder="Mood"
                className={styles.input}
              />
              <input
                value={referenceForm.style}
                onChange={(e) => setReferenceForm({ ...referenceForm, style: e.target.value })}
                placeholder="Style"
                className={styles.input}
              />
              <input
                value={referenceForm.bpm}
                onChange={(e) => setReferenceForm({ ...referenceForm, bpm: e.target.value })}
                placeholder="BPM"
                inputMode="numeric"
                className={styles.input}
              />
              <input
                value={referenceForm.referenceArtist}
                onChange={(e) => setReferenceForm({ ...referenceForm, referenceArtist: e.target.value })}
                placeholder="Artiste / type beat"
                className={styles.input}
              />
            </div>
            <textarea
              value={referenceForm.note}
              onChange={(e) => setReferenceForm({ ...referenceForm, note: e.target.value })}
              placeholder="Note libre"
              className={styles.textarea}
              rows={2}
            />
            <div className={styles.referenceActions}>
              <button type="submit" className={styles.smallSubmitBtn} disabled={isSavingReference}>
                {editingReferenceId ? <Save size={15} /> : <Plus size={15} />}
                {editingReferenceId ? "Modifier la référence" : "Ajouter une référence"}
              </button>
              {editingReferenceId && (
                <button type="button" className={styles.secondaryBtn} onClick={resetReferenceForm}>
                  <X size={15} />
                  Annuler
                </button>
              )}
            </div>
            {referenceMessage && <p className={styles.inlineError}>{referenceMessage}</p>}
          </form>

          <div className={styles.referenceList}>
            {suggestedReferences.length === 0 ? (
              <p className={styles.emptyText}>Aucune référence instrumentale suggérée pour l'instant.</p>
            ) : (
              suggestedReferences.map((reference) => (
                <div key={reference.id} className={styles.referenceItem}>
                  <div className={styles.referenceMain}>
                    <strong>{reference.title}</strong>
                    <div className={styles.referenceMeta}>
                      {reference.mood && <span>{reference.mood}</span>}
                      {reference.style && <span>{reference.style}</span>}
                      {reference.bpm && <span>{reference.bpm} BPM</span>}
                      {reference.referenceArtist && <span>{reference.referenceArtist}</span>}
                    </div>
                    {reference.note && <p>{reference.note}</p>}
                    {reference.youtubeUrl && (
                      <a href={reference.youtubeUrl} target="_blank" rel="noreferrer" className={styles.youtubeLink}>
                        <ExternalLink size={14} />
                        Référence YouTube
                      </a>
                    )}
                  </div>
                  <div className={styles.referenceItemActions}>
                    <button type="button" onClick={() => {
                      setEditingReferenceId(reference.id)
                      setReferenceForm(toReferenceForm(reference))
                      setReferenceMessage("")
                    }} title="Modifier la référence">
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => deleteReference(reference)} title="Supprimer la référence">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
