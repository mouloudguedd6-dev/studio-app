export type GlossaryEntry = {
  value: string
  aliases?: string[]
  correction?: string | null
  category?: string | null
  source?: string
}

export const DEFAULT_ARTIST_GLOSSARY: GlossaryEntry[] = [
  { value: "Limsé", aliases: ["limse"], category: "nom artiste", source: "system" },
  { value: "Selim", aliases: ["selim"], category: "nom artiste", source: "system" },
  { value: "SELIM C", aliases: ["selim c", "selimc"], category: "nom artiste", source: "system" },
  { value: "Moha", aliases: ["moha"], category: "proche", source: "system" },
]

export function getArtistGlossary() {
  return DEFAULT_ARTIST_GLOSSARY
}

export function getGlossaryTerms(entries = getArtistGlossary()) {
  return entries.flatMap((entry) => [entry.value, ...(entry.aliases || [])])
}

export function normalizeTerm(term: string) {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}
