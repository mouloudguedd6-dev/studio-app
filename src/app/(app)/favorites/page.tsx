import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import styles from "./favorites.module.css"
import { BookmarkCheck, Play, Mic2, Clock, Hash } from "lucide-react"
import Link from "next/link"

export default async function FavoritesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return <div>Non autorisé</div>

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return <div>Erreur</div>

  const favCollection = await prisma.collection.findFirst({
    where: { userId: user.id, type: "favorites" },
    include: {
      segments: {
        include: {
          transcription: { include: { audioRecord: true } },
          themes: true
        }
      }
    }
  })

  const segments = favCollection?.segments || []

  // Group by theme for display
  const themeMap = new Map<string, any[]>()
  themeMap.set("Toutes", segments)
  for (const seg of segments) {
    for (const theme of seg.themes) {
      if (!themeMap.has(theme.name)) themeMap.set(theme.name, [])
      themeMap.get(theme.name)!.push(seg)
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Punchlines & Favoris</h1>
          <p className={styles.subtitle}>{segments.length} lignes sauvegardées avec traçabilité complète.</p>
        </div>
      </header>

      {segments.length === 0 ? (
        <div className={styles.emptyState}>
          <BookmarkCheck size={48} className={styles.emptyIcon} />
          <h2>Aucune punchline sauvegardée</h2>
          <p>Ouvrez vos textes transcrits et cliquez sur le bouton signet pour sauvegarder vos meilleures lignes ici.</p>
          <Link href="/texts" className={styles.goLink}>Aller à la Bibliothèque Textes →</Link>
        </div>
      ) : (
        <div className={styles.content}>
          <div className={styles.segmentsList}>
            {segments.map((seg, i) => (
              <div key={seg.id} className={styles.segmentCard}>
                <div className={styles.segNumber}>#{i + 1}</div>
                <div className={styles.segContent}>
                  <p className={styles.segText}>"{seg.text}"</p>
                  <div className={styles.segMeta}>
                    <span className={styles.metaItem}>
                      <Mic2 size={14} />
                      {seg.transcription.audioRecord.title}
                    </span>
                    <span className={styles.metaItem}>
                      <Clock size={14} />
                      {Math.floor(seg.startTime / 60)}:{(seg.startTime % 60).toFixed(0).padStart(2, '0')} – {Math.floor(seg.endTime / 60)}:{(seg.endTime % 60).toFixed(0).padStart(2, '0')}
                    </span>
                  </div>
                  {seg.themes.length > 0 && (
                    <div className={styles.themeTags}>
                      {seg.themes.map((t: any) => (
                        <span key={t.id} className={styles.themeTag}>
                          <Hash size={12} /> {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
