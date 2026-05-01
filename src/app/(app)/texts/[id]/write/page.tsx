import { getServerSession } from "next-auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Mic2 } from "lucide-react"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseSuspiciousWords } from "@/lib/text-processing/clean-lyrics"
import WritingEditor from "./WritingEditor"
import styles from "../textDetail.module.css"

export default async function TextWritingPage(
  props: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return <div>Non autorisé</div>

  const params = await props.params
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const audio = await prisma.audioRecord.findFirst({
    where: { id: params.id, userId: user?.id },
    include: { transcription: true },
  })

  if (!audio?.transcription) {
    notFound()
  }

  const transcription = audio.transcription
  const rawText = transcription.rawText || ""
  const cleanText = transcription.cleanText || ""
  const lyricsText = transcription.lyricsText || cleanText || rawText
  const suspiciousWords = parseSuspiciousWords(transcription.suspiciousWords)

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href={`/texts/${audio.id}`} className={styles.backBtn}>
            <ArrowLeft size={20} />
            Retour au texte
          </Link>
        </div>

        <h1 className={styles.title}>Atelier d&apos;écriture</h1>
        <p className={styles.subtitle}>{audio.title}</p>

        <div className={styles.playerContainer}>
          <div className={styles.playerMeta}>
            <Mic2 size={16} /> Fichier source
          </div>
          <audio controls className={styles.nativePlayer} src={`/api/audio/${audio.filePath}`} />
        </div>
      </header>

      <WritingEditor
        audioId={audio.id}
        cleanText={cleanText}
        initialLyricsText={lyricsText}
        initialSuspiciousWords={suspiciousWords}
        hasUserEditedLyrics={transcription.lyricsEditedByUser}
      />
    </div>
  )
}
