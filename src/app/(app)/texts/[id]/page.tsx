import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import styles from "./textDetail.module.css"
import Link from "next/link"
import { ArrowLeft, BookmarkPlus, Mic2, PencilLine } from "lucide-react"
import SegmentRow from "./SegmentRow"
import GenerateCleanLyricsButton from "./GenerateCleanLyricsButton"
import AnalyzeTextButton from "./AnalyzeTextButton"
import TextAnalysisPanel from "./TextAnalysisPanel"
import { SuspiciousText } from "@/components/text/SuspiciousText"
import { parseSuspiciousWords } from "@/lib/text-processing/clean-lyrics"
import { toSerializableAnalysis } from "@/lib/text-analysis/json"

export default async function TextDetailPage(
  props: {
    params: Promise<{ id: string }>
    searchParams?: Promise<{ view?: string }>
  }
) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user?.email) return <div>Non autorisé</div>

  const params = await props.params
  const searchParams = await props.searchParams
  const selectedView = searchParams?.view === "raw" || searchParams?.view === "clean" ? searchParams.view : "lyrics"

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const audio = await prisma.audioRecord.findFirst({
    where: { id: params.id, userId: user?.id },
    include: {
      transcription: {
        include: {
          segments: {
            orderBy: { startTime: 'asc' },
            include: { collections: true, themes: true }
          },
          textAnalysis: true,
        }
      }
    }
  })

  if (!audio || !audio.transcription) {
    notFound()
  }

  const { transcription } = audio
  const rawText = transcription.rawText || ""
  const cleanText = transcription.cleanText || rawText
  const lyricsText = transcription.lyricsText || cleanText
  const suspiciousWords = parseSuspiciousWords(transcription.suspiciousWords)
  const displayedText = selectedView === "raw" ? rawText : selectedView === "clean" ? cleanText : lyricsText
  const viewLabel = selectedView === "raw" ? "Texte brut" : selectedView === "clean" ? "Texte clean" : "Lyrics"

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/texts" className={styles.backBtn}>
            <ArrowLeft size={20} />
            Retour
          </Link>
          <div className={styles.actions}>
            <Link href={`/texts/${audio.id}/write`} className={styles.secondaryBtn}>
              <PencilLine size={16} />
              Ouvrir l&apos;atelier d&apos;écriture
            </Link>
            <GenerateCleanLyricsButton
              audioId={audio.id}
              hasUserEditedLyrics={transcription.lyricsEditedByUser}
            />
            <AnalyzeTextButton audioId={audio.id} />
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
        <section className={styles.textPanel}>
          <div className={styles.textPanelHeader}>
            <div>
              <h2>{viewLabel}</h2>
              <p>{suspiciousWords.length} mot(s) douteux à vérifier</p>
            </div>
            <div className={styles.viewSwitch}>
              <Link
                href={`/texts/${audio.id}?view=raw`}
                className={`${styles.viewBtn} ${selectedView === "raw" ? styles.viewBtnActive : ""}`}
              >
                Voir brut
              </Link>
              <Link
                href={`/texts/${audio.id}?view=clean`}
                className={`${styles.viewBtn} ${selectedView === "clean" ? styles.viewBtnActive : ""}`}
              >
                Voir clean
              </Link>
              <Link
                href={`/texts/${audio.id}?view=lyrics`}
                className={`${styles.viewBtn} ${selectedView === "lyrics" ? styles.viewBtnActive : ""}`}
              >
                Voir lyrics
              </Link>
            </div>
          </div>

          <SuspiciousText
            text={displayedText || "Aucun texte disponible."}
            suspiciousWords={suspiciousWords}
            className={styles.fullText}
            suspiciousClassName={styles.suspiciousWord}
          />
        </section>

        <TextAnalysisPanel
          analysis={transcription.textAnalysis ? toSerializableAnalysis(transcription.textAnalysis) : null}
        />

        <div className={styles.segmentsList}>
          {transcription.segments.map((segment) => {
            const isFav = segment.collections.some((collection) => collection.type === "favorites")
            return (
              <SegmentRow 
                key={segment.id} 
                segment={segment} 
                audioPath={audio.filePath} 
                isInitiallyFavorited={isFav} 
                suspiciousWords={suspiciousWords}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
