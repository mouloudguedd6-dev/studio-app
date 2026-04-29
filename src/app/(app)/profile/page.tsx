"use client"

import { useState, useEffect } from "react"
import { Save, User as UserIcon, Music, Palette, Star } from "lucide-react"
import styles from "./profile.module.css"

export default function ProfilePage() {
  const [artistsRef, setArtistsRef] = useState("")
  const [moods, setMoods] = useState("")
  const [instrumentalStyles, setInstrumentalStyles] = useState("")
  const [influences, setInfluences] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch("/api/profile")
      .then(res => res.json())
      .then(data => {
        if (data.profile) {
          setArtistsRef(data.profile.artistsRef || "")
          setMoods(data.profile.moods || "")
          setInstrumentalStyles(data.profile.instrumentalStyles || "")
          setInfluences(data.profile.influences || "")
        }
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
        body: JSON.stringify({ artistsRef, moods, instrumentalStyles, influences }),
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

  if (isLoading) return <div className={styles.container}><p>Chargement du profil...</p></div>

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Profil DA</h1>
          <p className={styles.subtitle}>Définissez votre Direction Artistique. Ces infos guident la sélection et la génération des maquettes A/B.</p>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <UserIcon size={48} />
        </div>
        
        <form onSubmit={handleSave} className={styles.form}>
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
            <label htmlFor="influences">Influences & Direction Artistique</label>
            <textarea
              id="influences"
              value={influences}
              onChange={(e) => setInfluences(e.target.value)}
              placeholder="Ex: Sonorités marocaines, influences US trap, mélodies méditerranéennes..."
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
      </div>
    </div>
  )
}
