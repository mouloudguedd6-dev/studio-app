import { prisma } from "@/lib/prisma"
import { DEFAULT_ARTIST_GLOSSARY, type GlossaryEntry } from "./artist-glossary"

export type GlossaryCategory =
  | "nom artiste"
  | "proche"
  | "argot"
  | "darija"
  | "expression"
  | "adlib"
  | "autre"

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  "nom artiste",
  "proche",
  "argot",
  "darija",
  "expression",
  "adlib",
  "autre",
]

export async function ensureDefaultGlossaryEntries(userId: string) {
  const existingCount = await prisma.glossaryEntry.count({ where: { userId } })
  if (existingCount > 0) return

  await Promise.all(
    DEFAULT_ARTIST_GLOSSARY.map((entry) =>
      prisma.glossaryEntry.upsert({
        where: {
          userId_term: {
            userId,
            term: entry.value,
          },
        },
        update: {},
        create: {
          userId,
          term: entry.value,
          correction: entry.correction || null,
          category: entry.category || "autre",
          source: entry.source || "system",
        },
      })
    )
  )
}

export async function getUserGlossary(userId: string): Promise<GlossaryEntry[]> {
  const entries = await prisma.glossaryEntry.findMany({
    where: { userId },
    orderBy: [{ source: "asc" }, { term: "asc" }],
  })

  return entries.map((entry) => ({
    value: entry.term,
    correction: entry.correction,
    category: entry.category,
    source: entry.source,
  }))
}
