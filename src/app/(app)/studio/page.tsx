import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import styles from "./studio.module.css"
import { Calendar, Plus, Package, ArrowRight } from "lucide-react"
import Link from "next/link"

export default async function StudioSessionsPage() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user?.email) return <div>Non autorisé</div>

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const studioSessions = await prisma.studioSession.findMany({
    where: { userId: user?.id },
    include: { _count: { select: { studioPacks: true } } },
    orderBy: { date: "asc" }
  })

  // Server Action to add session
  async function addSession(formData: FormData) {
    "use server"
    const sessionToken = await getServerSession(authOptions)
    if (!sessionToken?.user?.email) return
    const u = await prisma.user.findUnique({ where: { email: sessionToken.user.email } })
    if (!u) return

    const intention = formData.get("intention") as string
    const dateStr = formData.get("date") as string

    if (intention && dateStr) {
      await prisma.studioSession.create({
        data: {
          userId: u.id,
          intention,
          date: new Date(dateStr)
        }
      })
      revalidatePath("/studio")
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Studio Sessions</h1>
          <p className={styles.subtitle}>Planifiez vos sessions et générez vos Studio Packs.</p>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.formSection}>
          <h2 className={styles.sectionTitle}>Planifier une session</h2>
          <form action={addSession} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="date">Date de la session</label>
              <input type="date" id="date" name="date" required className={styles.input} />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="intention">Intention / Thème du morceau</label>
              <input type="text" id="intention" name="intention" placeholder="Ex: Morceau d'été afro-pop" required className={styles.input} />
            </div>
            <button type="submit" className={styles.submitBtn}>
              <Plus size={18} /> Ajouter
            </button>
          </form>
        </div>

        <div className={styles.sessionsList}>
          <h2 className={styles.sectionTitle}>Prochaines Sessions</h2>
          {studioSessions.length === 0 ? (
            <div className={styles.emptyState}>
              <Calendar size={32} className={styles.emptyIcon} />
              <p>Aucune session planifiée.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {studioSessions.map((s) => (
                <div key={s.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <Calendar size={20} className={styles.cardIcon} />
                    <h3 className={styles.cardTitle}>{s.date.toLocaleDateString('fr-FR')}</h3>
                  </div>
                  <p className={styles.cardIntention}>{s.intention}</p>
                  
                  <div className={styles.cardActions}>
                    <span className={styles.packCount}>
                      {s._count.studioPacks} pack{s._count.studioPacks !== 1 ? 's' : ''}
                    </span>
                    <Link href={`/studio/${s.id}`} className={styles.generateBtn}>
                      <Package size={16} /> {s._count.studioPacks > 0 ? 'Voir l\'Atelier' : 'Préparer le Pack A/B'}
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
