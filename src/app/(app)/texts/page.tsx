import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import styles from "./texts.module.css"
import { Library, Clock, AlignLeft } from "lucide-react"
import Link from "next/link"

export default async function TextsLibraryPage() {
  const session = await getServerSession(authOptions)
  
  if (!session || !session.user?.email) {
    return <div>Non autorisé</div>
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  // Fetch only transcribed records
  const audios = await prisma.audioRecord.findMany({
    where: { userId: user?.id, status: "transcribed" },
    include: {
      transcription: {
        include: {
          _count: {
            select: { segments: true }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Bibliothèque de Textes</h1>
          <p className={styles.subtitle}>Retrouvez toutes vos improvisations transcrites.</p>
        </div>
      </header>

      <div className={styles.list}>
        {audios.length === 0 ? (
          <div className={styles.emptyState}>
            <Library size={48} className={styles.emptyIcon} />
            <p>Aucun texte disponible.</p>
            <p className={styles.emptySub}>Lancez une transcription depuis la Bibliothèque Audio.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {audios.map((audio) => (
              <Link href={`/texts/${audio.id}`} key={audio.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIcon}>
                    <AlignLeft size={20} />
                  </div>
                  <h3 className={styles.cardTitle}>{audio.title}</h3>
                </div>
                
                <div className={styles.cardMeta}>
                  <span><Clock size={14} /> {audio.createdAt.toLocaleDateString('fr-FR')}</span>
                  <span className={styles.segmentCount}>
                    {audio.transcription?._count?.segments || 0} lignes
                  </span>
                </div>
                
                <p className={styles.preview}>
                  {audio.transcription?.cleanText?.substring(0, 100) || "Aucun texte..."}
                  {(audio.transcription?.cleanText?.length || 0) > 100 ? "..." : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
