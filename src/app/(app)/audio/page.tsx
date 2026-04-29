import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import styles from "./audio.module.css"
import UploadForm from "./UploadForm"
import TranscribeButton from "./TranscribeButton"
import { Mic2, Play, FileText, Clock } from "lucide-react"

export default async function AudioLibraryPage() {
  const session = await getServerSession(authOptions)
  
  if (!session || !session.user?.email) {
    return <div>Non autorisé</div>
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  const audios = await prisma.audioRecord.findMany({
    where: { userId: user?.id },
    orderBy: { createdAt: "desc" }
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Bibliothèque Audio</h1>
          <p className={styles.subtitle}>Gérez vos enregistrements et lances les transcriptions.</p>
        </div>
        <UploadForm />
      </header>

      <div className={styles.list}>
        {audios.length === 0 ? (
          <div className={styles.emptyState}>
            <Mic2 size={48} className={styles.emptyIcon} />
            <p>Aucun audio dans votre bibliothèque.</p>
            <p className={styles.emptySub}>Uploadez votre premier enregistrement pour commencer.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {audios.map((audio) => (
              <div key={audio.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIcon}>
                    <Mic2 size={20} />
                  </div>
                  <h3 className={styles.cardTitle}>{audio.title}</h3>
                </div>
                
                <div className={styles.cardMeta}>
                  <span><Clock size={14} /> {audio.createdAt.toLocaleDateString('fr-FR')}</span>
                  <span className={`${styles.statusBadge} ${styles[audio.status]}`}>
                    {audio.status === "pending" ? "En attente"
                      : audio.status === "transcribing" ? "Transcription…"
                      : audio.status === "transcribed" ? "Transcrit"
                      : audio.status === "error" ? "Erreur"
                      : audio.status}
                  </span>
                </div>

                <div className={styles.playerWrapper}>
                  <audio 
                    controls 
                    className={styles.nativePlayer}
                    src={`/api/audio/${audio.filePath}`}
                  />
                </div>

                <div className={styles.cardActions}>
                  <TranscribeButton audioId={audio.id} initialStatus={audio.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
