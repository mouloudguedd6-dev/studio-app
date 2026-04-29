import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import styles from "./dashboard.module.css"
import { Disc, Mic2, FileText, Calendar, BookmarkCheck, Star } from "lucide-react"
import Link from "next/link"

export default async function Dashboard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return <div>Non autorisé</div>

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return <div>Erreur utilisateur</div>

  const audioCount = await prisma.audioRecord.count({ where: { userId: user.id } })
  const transcribedCount = await prisma.audioRecord.count({ where: { userId: user.id, status: "transcribed" } })
  
  const favCollection = await prisma.collection.findFirst({
    where: { userId: user.id, type: "favorites" },
    include: { _count: { select: { segments: true } } }
  })
  const punchlineCount = favCollection?._count?.segments || 0

  const upcomingSessions = await prisma.studioSession.findMany({
    where: { userId: user.id, date: { gte: new Date() } },
    orderBy: { date: "asc" },
    take: 5
  })

  const recentAudios = await prisma.audioRecord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.subtitle}>Bienvenue dans votre Studio App.</p>
      </header>

      <div className={styles.statsGrid}>
        <Link href="/audio" className={styles.statCard}>
          <div className={styles.statIconWrapper}>
            <Mic2 size={24} className={styles.statIcon} />
          </div>
          <div className={styles.statInfo}>
            <h3>Audios importés</h3>
            <p className={styles.statNumber}>{audioCount}</p>
          </div>
        </Link>
        
        <Link href="/texts" className={styles.statCard}>
          <div className={styles.statIconWrapper}>
            <FileText size={24} className={styles.statIcon} />
          </div>
          <div className={styles.statInfo}>
            <h3>Textes transcrits</h3>
            <p className={styles.statNumber}>{transcribedCount}</p>
          </div>
        </Link>

        <Link href="/favorites" className={styles.statCard}>
          <div className={styles.statIconWrapper}>
            <BookmarkCheck size={24} className={styles.statIcon} />
          </div>
          <div className={styles.statInfo}>
            <h3>Punchlines sauvées</h3>
            <p className={styles.statNumber}>{punchlineCount}</p>
          </div>
        </Link>

        <Link href="/studio" className={styles.statCard}>
          <div className={styles.statIconWrapper}>
            <Calendar size={24} className={styles.statIcon} />
          </div>
          <div className={styles.statInfo}>
            <h3>Sessions à venir</h3>
            <p className={styles.statNumber}>{upcomingSessions.length}</p>
          </div>
        </Link>
      </div>

      <div className={styles.twoColumns}>
        <div className={styles.recentSection}>
          <h2 className={styles.sectionTitle}>Derniers imports</h2>
          {recentAudios.length === 0 ? (
            <div className={styles.emptyState}>
              Aucun enregistrement. <Link href="/audio">Importer un audio →</Link>
            </div>
          ) : (
            <div className={styles.recentList}>
              {recentAudios.map(a => (
                <Link href={a.status === 'transcribed' ? `/texts/${a.id}` : '/audio'} key={a.id} className={styles.recentItem}>
                  <Mic2 size={16} />
                  <span className={styles.recentTitle}>{a.title}</span>
                  <span className={styles.recentStatus} data-status={a.status}>{a.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className={styles.recentSection}>
          <h2 className={styles.sectionTitle}>Sessions Studio</h2>
          {upcomingSessions.length === 0 ? (
            <div className={styles.emptyState}>
              Aucune session planifiée. <Link href="/studio">Planifier →</Link>
            </div>
          ) : (
            <div className={styles.recentList}>
              {upcomingSessions.map(s => (
                <Link href={`/studio/${s.id}`} key={s.id} className={styles.recentItem}>
                  <Calendar size={16} />
                  <span className={styles.recentTitle}>{s.intention}</span>
                  <span className={styles.recentDate}>{s.date.toLocaleDateString('fr-FR')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
