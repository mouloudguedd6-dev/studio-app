import Link from "next/link"
import { getServerSession } from "next-auth"
import { Disc, Music } from "lucide-react"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import InstrumentalUploadForm from "./InstrumentalUploadForm"
import InstrumentalCard from "./InstrumentalCard"
import styles from "./instrumentals.module.css"

function formatDuration(seconds: number | null) {
  if (!seconds) return "Durée inconnue"
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60).toString().padStart(2, "0")
  return `${minutes}:${remainingSeconds}`
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "Taille inconnue"
  const sizes = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${sizes[index]}`
}

export default async function InstrumentalsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return <div>Non autorisé</div>

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return <div>Utilisateur introuvable</div>

  const [instrumentals, profile] = await Promise.all([
    prisma.instrumental.findMany({
      where: { userId: user.id, scope: "available" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.daProfile.findUnique({ where: { userId: user.id } }),
  ])

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Instrumentales</h1>
          <p className={styles.subtitle}>Importez les prods utilisables pour les futurs yaourts A/B et reliez-les à la DA artiste.</p>
        </div>
        <InstrumentalUploadForm />
      </header>

      <section className={styles.profileBand}>
        <div className={styles.profileBandIcon}>
          <Music size={18} />
        </div>
        <div>
          <strong>Relié au Profil DA</strong>
          <p>
            {profile?.moods || profile?.instrumentalStyles
              ? [profile?.moods, profile?.instrumentalStyles].filter(Boolean).join(" · ")
              : "Ajoutez moods et styles instrumentaux dans le Profil DA pour enrichir le contexte futur."}
          </p>
        </div>
        <Link href="/profile" className={styles.profileLink}>Profil DA</Link>
      </section>

      {instrumentals.length === 0 ? (
        <div className={styles.emptyState}>
          <Disc size={48} className={styles.emptyIcon} />
          <p>Aucune instrumentale importée.</p>
          <p className={styles.emptySub}>Ajoutez un MP3, WAV ou M4A pour commencer à construire la base instrumentale de SELIM.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {instrumentals.map((instrumental) => (
            <InstrumentalCard
              key={instrumental.id}
              instrumental={{
                id: instrumental.id,
                title: instrumental.name,
                audioUrl: `/api/instrumentals/${instrumental.id}/audio`,
                durationLabel: formatDuration(instrumental.duration),
                fileSizeLabel: formatBytes(instrumental.fileSize),
                format: instrumental.format,
                bpm: instrumental.bpm,
                musicalKey: instrumental.musicalKey,
                mood: instrumental.mood,
                style: instrumental.style,
                referenceArtist: instrumental.referenceArtist,
                rightsStatus: instrumental.rightsStatus,
                youtubeUrl: instrumental.youtubeUrl,
                notes: instrumental.notes,
                createdAtLabel: instrumental.createdAt?.toLocaleDateString("fr-FR") || "Date inconnue",
                meta: [
                  { iconName: "clock", label: formatDuration(instrumental.duration) },
                  { iconName: "gauge", label: instrumental.bpm ? `${instrumental.bpm} BPM` : "BPM libre" },
                  { iconName: "scale", label: instrumental.musicalKey || "Tonalité libre" },
                ],
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
