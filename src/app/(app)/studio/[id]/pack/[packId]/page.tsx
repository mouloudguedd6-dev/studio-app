import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Play, LayoutList, Disc, FileAudio } from "lucide-react"
import styles from "./packDetail.module.css"
import YaourtGenerator from "./YaourtGenerator"

export default async function StudioPackPage(
  props: { params: Promise<{ id: string, packId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return <div>Non autorisé</div>

  const params = await props.params

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const pack = await prisma.studioPack.findFirst({
    where: { id: params.packId, studioSession: { userId: user?.id } },
    include: {
      packSegments: {
        orderBy: { order: 'asc' },
        include: {
          segment: { include: { transcription: { include: { audioRecord: true } } } }
        }
      },
      maquettes: {
        include: {
          instrumental: true,
          yaourtAudios: true
        }
      }
    }
  })

  if (!pack) notFound()

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href={`/studio/${params.id}`} className={styles.backBtn}>
            <ArrowLeft size={20} />
            Retour à la session
          </Link>
        </div>
        
        <h1 className={styles.title}>{pack.name}</h1>
        <p className={styles.subtitle}>Base de travail unifiée avec directions A/B</p>
      </header>

      <div className={styles.grid}>
        <div className={styles.textColumn}>
          <div className={styles.sectionHeader}>
            <LayoutList size={20} />
            <h2>Texte de Base (Commun)</h2>
          </div>
          <div className={styles.segmentsList}>
            {pack.packSegments.map((ps) => (
              <div key={ps.id} className={styles.segmentRow}>
                <div className={styles.roleTag}>{ps.role || 'Couplet'}</div>
                <div className={styles.textLine}>{ps.segment.text}</div>
                <div className={styles.sourceMeta}>
                  <span>{ps.segment.transcription.audioRecord.title}</span>
                  <span>[{Math.floor(ps.segment.startTime / 60)}:{(ps.segment.startTime % 60).toString().padStart(2, '0').substring(0,2)}]</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.maquettesColumn}>
          <div className={styles.sectionHeader}>
            <Disc size={20} />
            <h2>Maquettes & Yaourts</h2>
          </div>
          
          <div className={styles.maquettesList}>
            {pack.maquettes.map(maq => (
              <div key={maq.id} className={styles.maquetteCard}>
                <div className={styles.maqHeader}>
                  <h3>Direction {maq.variant}</h3>
                </div>
                
                <div className={styles.instruBox}>
                  <strong>Instrumental : {maq.instrumental.name}</strong>
                  {maq.instrumental.youtubeUrl && (
                    <a href={maq.instrumental.youtubeUrl} target="_blank" rel="noreferrer" className={styles.ytLink}>
                      Ouvrir Réf YouTube
                    </a>
                  )}
                  <p className={styles.instruTip}>Même texte, mood et flow adaptés au beat.</p>
                </div>

                <div className={styles.yaourtSection}>
                  {maq.yaourtAudios.length > 0 ? (
                    <div className={styles.playerContainer}>
                      <div className={styles.playerTitle}>
                        <FileAudio size={16} /> Yaourt Écoutable généré
                      </div>
                      <audio controls src={`/api/audio/${maq.yaourtAudios[0].filePath}`} className={styles.audioPlayer} />
                    </div>
                  ) : (
                    <YaourtGenerator maquetteId={maq.id} variant={maq.variant} packSegments={pack.packSegments} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
