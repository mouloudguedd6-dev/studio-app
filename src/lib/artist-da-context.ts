import { prisma } from "@/lib/prisma"

type NullableText = string | null | undefined

export type ArtistDAContext = {
  artistIdentity: string
  referenceArtists: string[]
  moods: string[]
  instrumentalStyles: string[]
  influences: string
  artisticDirection: string
  artisticNotes: string
  suggestedInstrumentalReferences: Array<{
    id: string
    title: string
    youtubeUrl: string | null
    mood: string | null
    style: string | null
    bpm: number | null
    note: string | null
    referenceArtist: string | null
    scope: "artist"
  }>
  availableInstrumentals: InstrumentalContext[]
}

export type InstrumentalContext = {
  id: string
  title: string
  audioFilePath: string | null
  duration: number | null
  fileSize: number | null
  format: string | null
  bpm: number | null
  musicalKey: string | null
  mood: string | null
  style: string | null
  referenceArtist: string | null
  rightsStatus: string
  youtubeUrl: string | null
  notes: string | null
  scope: "artist" | "song"
  createdAt: Date | null
  updatedAt: Date | null
}

function splitArtistList(value: NullableText) {
  return (value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitTextList(value: NullableText) {
  return (value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function buildInstrumentalContext(userId: string): Promise<InstrumentalContext[]> {
  const instrumentals = await prisma.instrumental.findMany({
    where: {
      userId,
      scope: "available",
    },
    orderBy: { updatedAt: "desc" },
  })

  return instrumentals.map((instrumental) => ({
    id: instrumental.id,
    title: instrumental.name,
    audioFilePath: instrumental.localPath,
    duration: instrumental.duration,
    fileSize: instrumental.fileSize,
    format: instrumental.format,
    bpm: instrumental.bpm,
    musicalKey: instrumental.musicalKey,
    mood: instrumental.mood,
    style: instrumental.style,
    referenceArtist: instrumental.referenceArtist,
    rightsStatus: instrumental.rightsStatus,
    youtubeUrl: instrumental.youtubeUrl,
    notes: instrumental.notes,
    scope: "artist",
    createdAt: instrumental.createdAt,
    updatedAt: instrumental.updatedAt,
  }))
}

export async function getArtistProfileContext(userId: string): Promise<ArtistDAContext> {
  const [profile, suggestedInstrumentalReferences, availableInstrumentals] = await Promise.all([
    prisma.daProfile.findUnique({ where: { userId } }),
    prisma.suggestedInstrumentalReference.findMany({
      where: { userId, scope: "artist" },
      orderBy: { updatedAt: "desc" },
    }),
    buildInstrumentalContext(userId),
  ])

  return {
    artistIdentity: profile?.artistIdentity || "",
    referenceArtists: splitArtistList(profile?.artistsRef),
    moods: splitTextList(profile?.moods),
    instrumentalStyles: splitTextList(profile?.instrumentalStyles),
    influences: profile?.influences || "",
    artisticDirection: profile?.artisticDirection || "",
    artisticNotes: profile?.artisticNotes || "",
    suggestedInstrumentalReferences: suggestedInstrumentalReferences.map((reference) => ({
      id: reference.id,
      title: reference.title,
      youtubeUrl: reference.youtubeUrl,
      mood: reference.mood,
      style: reference.style,
      bpm: reference.bpm,
      note: reference.note,
      referenceArtist: reference.referenceArtist,
      scope: "artist",
    })),
    availableInstrumentals,
  }
}

export async function buildArtistDAContext(userId: string) {
  return getArtistProfileContext(userId)
}

export async function buildCreativeContext(userId: string) {
  const artistDA = await getArtistProfileContext(userId)

  return {
    artistDA,
    lyrics: [],
    punchlines: [],
    songLevelInstrumentalSuggestions: [],
  }
}
