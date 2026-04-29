import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Package, Play, Music, Mic2 } from "lucide-react"
import styles from "./sessionDetail.module.css"

export default async function StudioSessionPage(
  props: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return <div>Non autorisé</div>

  const params = await props.params

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const studioSession = await prisma.studioSession.findFirst({
    where: { id: params.id, userId: user?.id },
    include: {
      studioPacks: {
        include: {
          maquettes: {
            include: { instrumental: true }
          }
        }
      }
    }
  })

  if (!studioSession) notFound()

  // Server action to generate pack
  async function generateStudioPack() {
    "use server"
    const s = await getServerSession(authOptions)
    if (!s?.user?.email) return
    const u = await prisma.user.findUnique({ where: { email: s.user.email } })
    if (!u) return

    // 1. Fetch favorites
    const favCollection = await prisma.collection.findFirst({
      where: { userId: u.id, type: "favorites" },
      include: { segments: { include: { transcription: { include: { audioRecord: true } } } } }
    })

    const segments = favCollection?.segments || []
    
    // Create Pack
    const pack = await prisma.studioPack.create({
      data: {
        studioSessionId: params.id,
        name: `Pack: ${studioSession?.intention || 'Sans thème'}`,
        packSegments: {
          create: segments.map((seg, i) => ({
            segmentId: seg.id,
            order: i,
            role: i % 2 === 0 ? "Couplet" : "Refrain"
          }))
        }
      }
    })

    // Create 2 Instrumental suggestions (YouTube references)
    const instA = await prisma.instrumental.create({
      data: { name: "Type Beat - Sombre/Drill", youtubeUrl: "https://youtube.com/watch?v=demoA", bpm: 140 }
    })
    const instB = await prisma.instrumental.create({
      data: { name: "Type Beat - Mélancolique/Acoustique", youtubeUrl: "https://youtube.com/watch?v=demoB", bpm: 110 }
    })

    // Create 2 Maquettes (A and B) linked to the same text basis
    await prisma.maquette.create({
      data: { studioPackId: pack.id, instrumentalId: instA.id, variant: "A" }
    })
    await prisma.maquette.create({
      data: { studioPackId: pack.id, instrumentalId: instB.id, variant: "B" }
    })

    redirect(`/studio/${params.id}`)
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/studio" className={styles.backBtn}>
            <ArrowLeft size={20} />
            Retour
          </Link>
        </div>
        
        <h1 className={styles.title}>Session du {studioSession.date.toLocaleDateString('fr-FR')}</h1>
        <p className={styles.intention}>Intention : {studioSession.intention}</p>
      </header>

      <div className={styles.content}>
        {studioSession.studioPacks.length === 0 ? (
          <div className={styles.emptyState}>
            <Package size={48} className={styles.emptyIcon} />
            <h2>Aucun Studio Pack généré</h2>
            <p>L'application va assembler vos meilleures punchlines favorites pour créer une structure de travail avec 2 directions instrumentales.</p>
            <form action={generateStudioPack}>
              <button type="submit" className={styles.generateBtn}>
                <Package size={18} /> Générer le Studio Pack A/B
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.packList}>
            {studioSession.studioPacks.map(pack => (
              <div key={pack.id} className={styles.packCard}>
                <div className={styles.packHeader}>
                  <h3>{pack.name}</h3>
                  <Link href={`/studio/${studioSession.id}/pack/${pack.id}`} className={styles.openPackBtn}>
                    Ouvrir l'Atelier
                  </Link>
                </div>
                
                <div className={styles.maquettesGrid}>
                  {pack.maquettes.map(maq => (
                    <div key={maq.id} className={styles.maquetteCard}>
                      <div className={styles.maqHeader}>
                        <Music size={16} /> Direction {maq.variant}
                      </div>
                      <div className={styles.instruDetails}>
                        <strong>{maq.instrumental.name}</strong>
                        {maq.instrumental.youtubeUrl && (
                          <a href={maq.instrumental.youtubeUrl} target="_blank" rel="noreferrer" className={styles.ytLink}>
                            Réf. YouTube
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
