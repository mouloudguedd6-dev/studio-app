import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import styles from "./textDetail.module.css"
import Link from "next/link"
import { ArrowLeft, BookmarkPlus, Mic2 } from "lucide-react"
import SegmentRow from "./SegmentRow"

export default async function TextDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user?.email) return <div>Non autorisé</div>

  const params = await props.params

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const audio = await prisma.audioRecord.findFirst({
    where: { id: params.id, userId: user?.id },
    include: {
      transcription: {
        include: {
          segments: {
            orderBy: { startTime: 'asc' },
            include: { collections: true, themes: true }
          }
        }
      }
    }
  })

  if (!audio || !audio.transcription) {
    notFound()
  }

  const { transcription } = audio

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/texts" className={styles.backBtn}>
            <ArrowLeft size={20} />
            Retour
          </Link>
          <div className={styles.actions}>
            {/* V1: boutons passifs / UI placeholders for collections */}
            <button className={styles.secondaryBtn}>
              <BookmarkPlus size={16} />
              Sauvegarder dans une collection
            </button>
          </div>
        </div>
        
        <h1 className={styles.title}>{audio.title}</h1>
        
        <div className={styles.playerContainer}>
          <div className={styles.playerMeta}>
            <Mic2 size={16} /> Fichier source
          </div>
          <audio controls className={styles.nativePlayer} src={`/api/audio/${audio.filePath}`} />
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.segmentsList}>
          {transcription.segments.map((segment) => {
            const isFav = segment.collections.some((c: any) => c.type === 'favorites')
            return (
              <SegmentRow 
                key={segment.id} 
                segment={segment} 
                audioPath={audio.filePath} 
                isInitiallyFavorited={isFav} 
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
