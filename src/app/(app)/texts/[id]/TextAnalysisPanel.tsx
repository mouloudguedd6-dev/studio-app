import { Activity, Brain, Disc, Gauge, Lightbulb, Music, Sparkles, Target } from "lucide-react"
import styles from "./textDetail.module.css"

type TextAnalysisView = {
  id: string
  provider: string
  themes: string[]
  mood: string[]
  energyScore: number
  lyricalScore: number
  punchlineScore: number
  hookScore: number
  daCompatibilityScore: number
  instrumentalCompatibilityScore: number
  globalScore: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestedUse: string
  punchlineCandidates: Array<{ text: string; reason: string; score: number; timecode: number | null }>
  hookCandidates: Array<{ text: string; reason: string; score: number; timecode: number | null }>
  compatibleInstrumentals: Array<{
    instrumentalId: string
    title: string
    score: number
    reason: string
    mood: string | null
    style: string | null
    bpm: number | null
    rightsStatus: string
  }>
  updatedAt: string
}

function formatTimecode(seconds: number | null) {
  if (seconds === null) return null
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0")
  return `${minutes}:${remainingSeconds}`
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.scorePill}>
      <span>{label}</span>
      <strong>{value}/100</strong>
    </div>
  )
}

export default function TextAnalysisPanel({ analysis }: { analysis: TextAnalysisView | null }) {
  if (!analysis) {
    return (
      <section className={styles.analysisPanel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Analyse artistique</h2>
            <p>Lancez une analyse V0 pour détecter thèmes, moods, punchlines et compatibilité DA.</p>
          </div>
        </div>
        <div className={styles.analysisEmpty}>
          <Brain size={34} />
          <p>Aucune analyse sauvegardée pour ce texte.</p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.analysisPanel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Analyse artistique</h2>
          <p>Provider {analysis.provider} · mise à jour {new Date(analysis.updatedAt).toLocaleDateString("fr-FR")}</p>
        </div>
        <div className={styles.globalScore}>
          <span>Score global</span>
          <strong>{analysis.globalScore}/100</strong>
        </div>
      </div>

      <p className={styles.analysisSummary}>{analysis.summary}</p>

      <div className={styles.scoreGrid}>
        <ScorePill label="DA" value={analysis.daCompatibilityScore} />
        <ScorePill label="Énergie" value={analysis.energyScore} />
        <ScorePill label="Texte" value={analysis.lyricalScore} />
        <ScorePill label="Punchlines" value={analysis.punchlineScore} />
        <ScorePill label="Hook" value={analysis.hookScore} />
        <ScorePill label="Instrus" value={analysis.instrumentalCompatibilityScore} />
      </div>

      <div className={styles.analysisColumns}>
        <div className={styles.analysisBlock}>
          <h3><Target size={16} /> Thèmes</h3>
          <div className={styles.tagList}>
            {analysis.themes.length > 0 ? analysis.themes.map((theme) => <span key={theme}>{theme}</span>) : <span>Non détecté</span>}
          </div>
        </div>

        <div className={styles.analysisBlock}>
          <h3><Music size={16} /> Mood</h3>
          <div className={styles.tagList}>
            {analysis.mood.length > 0 ? analysis.mood.map((mood) => <span key={mood}>{mood}</span>) : <span>Neutre</span>}
          </div>
        </div>

        <div className={styles.analysisBlock}>
          <h3><Gauge size={16} /> Usage conseillé</h3>
          <p>{analysis.suggestedUse}</p>
        </div>
      </div>

      <div className={styles.analysisColumns}>
        <div className={styles.analysisBlock}>
          <h3><Sparkles size={16} /> Forces</h3>
          <ul>
            {analysis.strengths.map((strength) => <li key={strength}>{strength}</li>)}
          </ul>
        </div>

        <div className={styles.analysisBlock}>
          <h3><Lightbulb size={16} /> À retravailler</h3>
          <ul>
            {analysis.weaknesses.map((weakness) => <li key={weakness}>{weakness}</li>)}
          </ul>
        </div>
      </div>

      <div className={styles.analysisColumns}>
        <div className={styles.analysisBlock}>
          <h3><Activity size={16} /> Punchlines candidates</h3>
          <div className={styles.candidateList}>
            {analysis.punchlineCandidates.length === 0 ? (
              <p>Aucune punchline forte détectée par la V0.</p>
            ) : analysis.punchlineCandidates.map((candidate) => (
              <div key={`${candidate.text}-${candidate.score}`} className={styles.candidateItem}>
                <strong>{candidate.text}</strong>
                <span>{candidate.score}/100{formatTimecode(candidate.timecode) ? ` · ${formatTimecode(candidate.timecode)}` : ""}</span>
                <p>{candidate.reason}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.analysisBlock}>
          <h3><Brain size={16} /> Hooks potentiels</h3>
          <div className={styles.candidateList}>
            {analysis.hookCandidates.length === 0 ? (
              <p>Aucun hook évident détecté par la V0.</p>
            ) : analysis.hookCandidates.map((candidate) => (
              <div key={`${candidate.text}-${candidate.score}`} className={styles.candidateItem}>
                <strong>{candidate.text}</strong>
                <span>{candidate.score}/100{formatTimecode(candidate.timecode) ? ` · ${formatTimecode(candidate.timecode)}` : ""}</span>
                <p>{candidate.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.analysisBlock}>
        <h3><Disc size={16} /> Instrumentales compatibles</h3>
        <div className={styles.instrumentalMatches}>
          {analysis.compatibleInstrumentals.length === 0 ? (
            <p>Aucune instrumentale disponible à comparer.</p>
          ) : analysis.compatibleInstrumentals.map((instrumental) => (
            <div key={instrumental.instrumentalId} className={styles.instrumentalMatch}>
              <div>
                <strong>{instrumental.title}</strong>
                <p>{instrumental.reason}</p>
                <span>
                  {[instrumental.mood, instrumental.style, instrumental.bpm ? `${instrumental.bpm} BPM` : null, instrumental.rightsStatus]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <strong>{instrumental.score}/100</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
