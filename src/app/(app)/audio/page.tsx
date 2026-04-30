import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import styles from "./audio.module.css"
import UploadForm from "./UploadForm"
import TranscribeButton from "./TranscribeButton"
import DeleteAudioButton from "./DeleteAudioButton"
import { Mic2, Clock, Copy, ShieldAlert } from "lucide-react"

type AudioForDuplicateScan = {
  id: string
  title: string
  fileSize: number | null
  duration: number | null
  format: string | null
  checksum: string | null
}

type DuplicateInfo = {
  label: "Doublon probable" | "Fichier similaire"
  similarId: string
  similarTitle: string
  reason: string
}

function normalizeAudioTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_\s]*(copy|copie|\(\d+\)|\d+)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function hasCloseNumericValue(a: number | null | undefined, b: number | null | undefined, tolerance: number) {
  if (typeof a !== "number" || typeof b !== "number") return false
  return Math.abs(a - b) <= tolerance
}

function areProbableDuplicates(a: AudioForDuplicateScan, b: AudioForDuplicateScan) {
  const sameFormat = !!a.format && !!b.format && a.format === b.format
  const sameNormalizedTitle = normalizeAudioTitle(a.title) === normalizeAudioTitle(b.title)
  const closeSize =
    typeof a.fileSize === "number" &&
    typeof b.fileSize === "number" &&
    Math.abs(a.fileSize - b.fileSize) <= Math.max(1024 * 1024, a.fileSize * 0.01)
  const closeDuration = hasCloseNumericValue(a.duration, b.duration, 2)

  return (sameNormalizedTitle && closeSize) || (sameFormat && closeSize && closeDuration)
}

function buildDuplicateInfo(audios: AudioForDuplicateScan[]) {
  const duplicateInfoById = new Map<string, DuplicateInfo>()
  const checksumGroups = new Map<string, AudioForDuplicateScan[]>()

  for (const audio of audios) {
    if (!audio.checksum) continue
    checksumGroups.set(audio.checksum, [...(checksumGroups.get(audio.checksum) || []), audio])
  }

  for (const group of checksumGroups.values()) {
    if (group.length < 2) continue

    for (const audio of group) {
      const similar = group.find((candidate) => candidate.id !== audio.id)
      if (!similar) continue
      duplicateInfoById.set(audio.id, {
        label: "Doublon probable",
        similarId: similar.id,
        similarTitle: similar.title,
        reason: "Hash SHA-256 identique",
      })
    }
  }

  for (let i = 0; i < audios.length; i += 1) {
    for (let j = i + 1; j < audios.length; j += 1) {
      const first = audios[i]
      const second = audios[j]
      if (duplicateInfoById.has(first.id) && duplicateInfoById.has(second.id)) continue
      if (!areProbableDuplicates(first, second)) continue

      if (!duplicateInfoById.has(first.id)) {
        duplicateInfoById.set(first.id, {
          label: "Fichier similaire",
          similarId: second.id,
          similarTitle: second.title,
          reason: "Nom, taille ou durée très proches",
        })
      }

      if (!duplicateInfoById.has(second.id)) {
        duplicateInfoById.set(second.id, {
          label: "Fichier similaire",
          similarId: first.id,
          similarTitle: first.title,
          reason: "Nom, taille ou durée très proches",
        })
      }
    }
  }

  return duplicateInfoById
}

export default async function AudioLibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ duplicates?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const showDuplicatesOnly = resolvedSearchParams?.duplicates === "1"
  const session = await getServerSession(authOptions)
  
  if (!session || !session.user?.email) {
    return <div>Non autorisé</div>
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    return <div>Utilisateur introuvable</div>
  }

  const audios = await prisma.audioRecord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  })
  const duplicateInfoById = buildDuplicateInfo(audios)
  const duplicateCount = duplicateInfoById.size
  const visibleAudios = showDuplicatesOnly ? audios.filter((audio) => duplicateInfoById.has(audio.id)) : audios

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Bibliothèque Audio</h1>
          <p className={styles.subtitle}>Gérez vos enregistrements et lancez les transcriptions.</p>
        </div>
        <UploadForm
          existingAudios={audios.map((audio) => ({
            id: audio.id,
            title: audio.title,
            fileSize: audio.fileSize,
            duration: audio.duration,
            format: audio.format,
            checksum: audio.checksum,
            status: audio.status,
          }))}
        />
      </header>

      {audios.length > 0 && (
        <div className={styles.duplicateFilterBar}>
          <div className={styles.duplicateFilterInfo}>
            <ShieldAlert size={16} />
            <span>
              {duplicateCount > 0
                ? `${duplicateCount} audio(s) avec doublon ou similarité détectée`
                : "Aucun doublon évident détecté"}
            </span>
          </div>
          <a
            className={`${styles.filterBtn} ${showDuplicatesOnly ? styles.filterBtnActive : ""}`}
            href={showDuplicatesOnly ? "/audio" : "/audio?duplicates=1"}
          >
            <Copy size={14} />
            {showDuplicatesOnly ? "Voir toute la bibliothèque" : "Doublons détectés"}
          </a>
        </div>
      )}

      <div className={styles.list}>
        {audios.length === 0 ? (
          <div className={styles.emptyState}>
            <Mic2 size={48} className={styles.emptyIcon} />
            <p>Aucun audio dans votre bibliothèque.</p>
            <p className={styles.emptySub}>Uploadez votre premier enregistrement pour commencer.</p>
          </div>
        ) : visibleAudios.length === 0 ? (
          <div className={styles.emptyState}>
            <ShieldAlert size={48} className={styles.emptyIcon} />
            <p>Aucun doublon visible.</p>
            <p className={styles.emptySub}>Les fichiers similaires apparaîtront ici quand ils seront détectés.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleAudios.map((audio) => {
              const duplicateInfo = duplicateInfoById.get(audio.id)

              return (
                <div key={audio.id} id={`audio-${audio.id}`} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}>
                      <Mic2 size={20} />
                    </div>
                    <h3 className={styles.cardTitle} title={audio.title}>{audio.title}</h3>
                  </div>

                  {duplicateInfo && (
                    <div className={styles.duplicateHint}>
                      <span className={styles.duplicateBadge}>{duplicateInfo.label}</span>
                      <span title={duplicateInfo.similarTitle}>
                        {duplicateInfo.reason} · similaire à{" "}
                        <a href={`#audio-${duplicateInfo.similarId}`}>{duplicateInfo.similarTitle}</a>
                      </span>
                    </div>
                  )}
                  
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
                    <DeleteAudioButton audioId={audio.id} title={audio.title} />
                    <TranscribeButton audioId={audio.id} initialStatus={audio.status} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
