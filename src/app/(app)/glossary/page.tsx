import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureDefaultGlossaryEntries } from "@/lib/text-processing/glossary-service"
import GlossaryManager from "./GlossaryManager"
import styles from "./glossary.module.css"

export default async function GlossaryPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return <div>Non autorisé</div>

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return <div>Utilisateur introuvable</div>

  await ensureDefaultGlossaryEntries(user.id)
  const entries = await prisma.glossaryEntry.findMany({
    where: { userId: user.id },
    orderBy: [{ source: "asc" }, { term: "asc" }],
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Glossaire</h1>
        <p className={styles.subtitle}>
          Vocabulaire discret pour aider les clean lyrics sans ralentir l&apos;écriture.
        </p>
      </header>

      <GlossaryManager
        initialEntries={entries.map((entry) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
