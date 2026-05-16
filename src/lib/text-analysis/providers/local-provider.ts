import type {
  CompatibleInstrumental,
  SuggestedUse,
  TextAnalysisCandidate,
  TextAnalysisInput,
  TextAnalysisProvider,
  TextAnalysisResult,
} from "@/lib/text-analysis/types"

const STOP_WORDS = new Set([
  "alors", "avec", "avoir", "dans", "des", "elle", "elles", "est", "les", "leur", "mais", "mes", "moi",
  "mon", "nos", "notre", "nous", "pas", "plus", "pour", "que", "qui", "quoi", "sans", "ses", "son",
  "sur", "tes", "toi", "ton", "tous", "tout", "une", "vous", "aux", "ces", "chez", "comme", "fait",
  "faut", "j'ai", "j’suis", "suis", "c'est", "c’est", "j’", "quand", "encore", "très", "trop",
])

const MOOD_LEXICON = [
  { mood: "love", terms: ["amour", "aime", "coeur", "cœur", "bébé", "baby", "elle", "toi", "nous", "sentiment"] },
  { mood: "sombre", terms: ["nuit", "noir", "sombre", "peine", "triste", "pleure", "seul", "vide", "ombre"] },
  { mood: "introspectif", terms: ["moi", "âme", "pense", "souvenir", "passé", "vécu", "rêve", "doute", "tête"] },
  { mood: "énergique", terms: ["vite", "fort", "feu", "bouge", "club", "danse", "crie", "run", "gang", "money"] },
  { mood: "mélodique", terms: ["mélodie", "voix", "chanter", "refrain", "note", "larme", "vibe", "flow"] },
  { mood: "oriental", terms: ["bled", "dar", "maroc", "casablanca", "oriental", "mama", "maman", "famille"] },
  { mood: "street", terms: ["rue", "bloc", "tess", "terrain", "business", "deal", "frère", "frero", "zone"] },
]

const THEME_LEXICON = [
  { theme: "amour", terms: ["amour", "aime", "coeur", "cœur", "baby", "elle", "toi"] },
  { theme: "rupture", terms: ["trahison", "parti", "partie", "blessé", "mensonge", "quitté", "absence"] },
  { theme: "ambition", terms: ["réussir", "million", "argent", "sommet", "victoire", "gagner", "avenir"] },
  { theme: "famille", terms: ["mama", "maman", "père", "frère", "soeur", "sœur", "famille"] },
  { theme: "rue", terms: ["rue", "bloc", "quartier", "terrain", "police", "tess", "zone"] },
  { theme: "exil / racines", terms: ["bled", "pays", "maroc", "dar", "racine", "frontière", "famille"] },
  { theme: "doute", terms: ["doute", "peur", "stress", "fatigué", "perdu", "question", "tête"] },
]

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function tokenize(text: string) {
  return normalize(text)
    .replace(/['’]/g, " ")
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function countTermMatches(haystack: string, terms: string[]) {
  return terms.reduce((score, term) => score + (haystack.includes(normalize(term)) ? 1 : 0), 0)
}

function getTopThemes(text: string, tokens: string[]) {
  const normalizedText = normalize(text)
  const lexicalThemes = THEME_LEXICON
    .map((entry) => ({ name: entry.theme, score: countTermMatches(normalizedText, entry.terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.name)

  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1)
  const recurringWords = Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word)

  return unique([...lexicalThemes, ...recurringWords]).slice(0, 7)
}

function getMoods(text: string) {
  const normalizedText = normalize(text)
  return MOOD_LEXICON
    .map((entry) => ({ mood: entry.mood, score: countTermMatches(normalizedText, entry.terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.mood)
    .slice(0, 5)
}

function splitLines(input: TextAnalysisInput) {
  if (input.segments.length > 0) {
    return input.segments
      .map((segment) => ({
        text: segment.text.trim(),
        timecode: segment.startTime,
      }))
      .filter((line) => line.text.length > 0)
  }

  return input.text
    .split(/\n+/)
    .map((line) => ({ text: line.trim(), timecode: null }))
    .filter((line) => line.text.length > 0)
}

function scoreLine(text: string, index: number) {
  const words = tokenize(text)
  const lengthScore = words.length >= 5 && words.length <= 16 ? 25 : words.length > 2 ? 14 : 5
  const punctuationScore = /[!?]/.test(text) ? 10 : 0
  const contrastScore = /\b(mais|jamais|toujours|sans|avec|contre|pourtant)\b/i.test(text) ? 12 : 0
  const imageScore = countTermMatches(normalize(text), ["coeur", "nuit", "ombre", "feu", "ciel", "rue", "reve", "larme"]) * 6
  const earlyBonus = index < 6 ? 4 : 0

  return clampScore(38 + lengthScore + punctuationScore + contrastScore + imageScore + earlyBonus)
}

function getPunchlineCandidates(lines: Array<{ text: string; timecode: number | null }>) {
  return lines
    .map((line, index) => ({
      text: line.text,
      reason: "Phrase courte avec image, contraste ou impact direct.",
      score: scoreLine(line.text, index),
      timecode: line.timecode,
    }))
    .filter((candidate) => candidate.text.length >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

function getHookCandidates(lines: Array<{ text: string; timecode: number | null }>) {
  const counts = new Map<string, { count: number; text: string; timecode: number | null }>()

  for (const line of lines) {
    const key = normalize(line.text).replace(/[^a-z0-9]+/g, " ").trim()
    if (!key || key.length < 8) continue
    const existing = counts.get(key)
    counts.set(key, {
      count: (existing?.count || 0) + 1,
      text: existing?.text || line.text,
      timecode: existing?.timecode ?? line.timecode,
    })
  }

  const repeated = Array.from(counts.values())
    .filter((entry) => entry.count > 1)
    .map((entry) => ({
      text: entry.text,
      reason: `Ligne répétée ${entry.count} fois, candidate naturelle pour un refrain.`,
      score: clampScore(64 + entry.count * 12),
      timecode: entry.timecode,
    }))

  const shortMelodic = lines
    .filter((line) => {
      const wordCount = tokenize(line.text).length
      return wordCount >= 3 && wordCount <= 10 && /[aeiouy][a-z]{0,2}\b/i.test(line.text)
    })
    .map((line) => ({
      text: line.text,
      reason: "Ligne compacte, mémorisable et facile à répéter.",
      score: clampScore(58 + Math.min(line.text.length, 80) / 4),
      timecode: line.timecode,
    }))

  return [...repeated, ...shortMelodic]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
}

function getEnergyScore(text: string, lines: Array<{ text: string; timecode: number | null }>) {
  const tokens = tokenize(text)
  const exclamations = (text.match(/[!?]/g) || []).length
  const capsLines = lines.filter((line) => /[A-ZÀ-Ý]{4,}/.test(line.text)).length
  const energeticMatches = countTermMatches(normalize(text), ["feu", "vite", "fort", "club", "danse", "money", "gang", "run"])

  return clampScore(35 + Math.min(tokens.length, 160) / 3 + exclamations * 4 + capsLines * 3 + energeticMatches * 7)
}

function getLyricalScore(tokens: string[], lines: Array<{ text: string; timecode: number | null }>) {
  const uniqueRatio = tokens.length > 0 ? new Set(tokens).size / tokens.length : 0
  const averageLineLength = lines.length > 0
    ? lines.reduce((sum, line) => sum + tokenize(line.text).length, 0) / lines.length
    : 0
  const structureScore = averageLineLength >= 5 && averageLineLength <= 14 ? 18 : 8

  return clampScore(34 + uniqueRatio * 34 + structureScore + Math.min(lines.length, 24))
}

function scoreDACompatibility(text: string, moods: string[], input: TextAnalysisInput) {
  const daTerms = [
    ...input.artistDA.referenceArtists,
    ...input.artistDA.moods,
    ...input.artistDA.instrumentalStyles,
    input.artistDA.influences,
    input.artistDA.artisticDirection,
    input.artistDA.artisticNotes,
    ...input.artistDA.suggestedInstrumentalReferences.flatMap((reference) => [
      reference.title,
      reference.mood || "",
      reference.style || "",
      reference.referenceArtist || "",
      reference.note || "",
    ]),
  ]
    .flatMap((value) => tokenize(value || ""))
    .filter((term) => term.length > 2)

  if (daTerms.length === 0) return 45

  const textTokens = new Set(tokenize(text))
  const directMatches = unique(daTerms).filter((term) => textTokens.has(term)).length
  const moodMatches = moods.filter((mood) => input.artistDA.moods.map(normalize).includes(normalize(mood))).length

  return clampScore(42 + directMatches * 8 + moodMatches * 14)
}

function scoreInstrumentalCompatibility(
  text: string,
  moods: string[],
  themes: string[],
  input: TextAnalysisInput
): CompatibleInstrumental[] {
  const textTokens = new Set(tokenize([text, ...moods, ...themes].join(" ")))

  return input.artistDA.availableInstrumentals
    .map((instrumental) => {
      const fields = [
        instrumental.mood || "",
        instrumental.style || "",
        instrumental.referenceArtist || "",
        instrumental.notes || "",
        instrumental.title,
      ]
      const instrumentalTokens = unique(fields.flatMap((field) => tokenize(field)))
      const matches = instrumentalTokens.filter((token) => textTokens.has(token))
      const moodMatch = instrumental.mood
        ? moods.some((mood) => normalize(instrumental.mood || "").includes(normalize(mood)))
        : false
      const styleFromDA = instrumental.style
        ? input.artistDA.instrumentalStyles.some((style) => normalize(style).includes(normalize(instrumental.style || "")))
        : false
      const rightsBoost = ["perso", "achete", "libre"].includes(instrumental.rightsStatus) ? 8 : 0
      const bpmBoost = instrumental.bpm && instrumental.bpm >= 90 && instrumental.bpm <= 155 ? 4 : 0
      const score = clampScore(38 + matches.length * 9 + (moodMatch ? 18 : 0) + (styleFromDA ? 10 : 0) + rightsBoost + bpmBoost)

      const reasonParts = [
        matches.length > 0 ? `mots communs: ${matches.slice(0, 4).join(", ")}` : "",
        moodMatch ? "mood aligné" : "",
        styleFromDA ? "style cohérent avec la DA" : "",
        rightsBoost ? "statut droits exploitable" : "",
      ].filter(Boolean)

      return {
        instrumentalId: instrumental.id,
        title: instrumental.title,
        score,
        reason: reasonParts.join(" · ") || "Compatibilité générale avec le contexte artiste.",
        mood: instrumental.mood,
        style: instrumental.style,
        bpm: instrumental.bpm,
        rightsStatus: instrumental.rightsStatus,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

function chooseSuggestedUse(hookScore: number, punchlineScore: number, energyScore: number, linesCount: number): SuggestedUse {
  if (hookScore >= 74) return "refrain"
  if (punchlineScore >= 76 && linesCount >= 6) return "couplet"
  if (energyScore >= 78) return "freestyle"
  if (linesCount <= 4) return "intro"
  if (linesCount <= 8) return "pont"
  return "à retravailler"
}

export const localTextAnalysisProvider: TextAnalysisProvider = {
  name: "local",
  async analyze(input: TextAnalysisInput): Promise<TextAnalysisResult> {
    const text = input.text.trim()
    const tokens = tokenize(text)
    const lines = splitLines(input)
    const themes = getTopThemes(text, tokens)
    const moods = getMoods(text)
    const punchlineCandidates = getPunchlineCandidates(lines)
    const hookCandidates = getHookCandidates(lines)
    const energyScore = getEnergyScore(text, lines)
    const lyricalScore = getLyricalScore(tokens, lines)
    const punchlineScore = punchlineCandidates[0]?.score || 42
    const hookScore = hookCandidates[0]?.score || 38
    const daCompatibilityScore = scoreDACompatibility(text, moods, input)
    const compatibleInstrumentals = scoreInstrumentalCompatibility(text, moods, themes, input)
    const instrumentalCompatibilityScore = compatibleInstrumentals[0]?.score || (input.artistDA.availableInstrumentals.length > 0 ? 35 : 0)
    const globalScore = clampScore(
      energyScore * 0.16 +
      lyricalScore * 0.22 +
      punchlineScore * 0.18 +
      hookScore * 0.14 +
      daCompatibilityScore * 0.2 +
      instrumentalCompatibilityScore * 0.1
    )
    const suggestedUse = chooseSuggestedUse(hookScore, punchlineScore, energyScore, lines.length)
    const strengths = [
      punchlineScore >= 70 ? "Plusieurs lignes ont un potentiel punchline exploitable." : "",
      hookScore >= 70 ? "Une répétition ou ligne courte peut servir de hook." : "",
      daCompatibilityScore >= 70 ? "Le texte colle bien à la DA artiste actuelle." : "",
      instrumentalCompatibilityScore >= 70 ? "Des instrumentales disponibles matchent le texte." : "",
    ].filter(Boolean)
    const weaknesses = [
      moods.length === 0 ? "Mood peu identifiable dans la V0 locale." : "",
      themes.length < 2 ? "Thèmes encore peu marqués, à préciser en atelier." : "",
      hookScore < 55 ? "Refrain potentiel faible, chercher une phrase plus répétable." : "",
      daCompatibilityScore < 55 ? "Compatibilité DA à renforcer avec vocabulaire, mood ou intention plus SELIM." : "",
    ].filter(Boolean)

    return {
      provider: "local",
      themes,
      mood: moods,
      energyScore,
      lyricalScore,
      punchlineScore,
      hookScore,
      daCompatibilityScore,
      instrumentalCompatibilityScore,
      globalScore,
      summary: `Analyse V0 locale : texte plutôt ${moods.slice(0, 2).join(" / ") || "neutre"}, usage conseillé ${suggestedUse}, score global ${globalScore}/100.`,
      strengths: strengths.length > 0 ? strengths : ["Base exploitable pour préparer un Studio Pack."],
      weaknesses: weaknesses.length > 0 ? weaknesses : ["Aucune faiblesse majeure détectée par la V0 locale."],
      suggestedUse,
      punchlineCandidates,
      hookCandidates,
      compatibleInstrumentals,
    }
  },
}
