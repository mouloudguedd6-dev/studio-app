import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import styles from "./search.module.css"
import { Search as SearchIcon, Library, Hash, Mic2, Clock, BookmarkPlus } from "lucide-react"
import Link from "next/link"
import { ensureDefaultThemes } from "../actions/themes"

export default async function SearchPage(
  props: { searchParams: Promise<{ q?: string; theme?: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user?.email) return <div>Non autorisé</div>

  // Ensure themes exist
  await ensureDefaultThemes()

  const searchParams = await props.searchParams
  const q = searchParams.q || ""
  const selectedTheme = searchParams.theme || ""

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  const allThemes = await prisma.theme.findMany({ orderBy: { name: 'asc' } })
  
  let results: any[] = []
  
  const whereClause: any = {
    transcription: { audioRecord: { userId: user?.id } }
  }

  if (q.trim().length > 0) {
    whereClause.text = { contains: q }
  }

  if (selectedTheme) {
    whereClause.themes = { some: { name: selectedTheme } }
  }

  if (q.trim().length > 0 || selectedTheme) {
    results = await prisma.segment.findMany({
      where: whereClause,
      include: {
        transcription: { include: { audioRecord: true } },
        themes: true,
        collections: true
      },
      take: 100
    })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Recherche & Thèmes</h1>
          <p className={styles.subtitle}>Retrouvez n'importe quelle phrase par mot-clé ou thème.</p>
        </div>
      </header>

      <div className={styles.searchSection}>
        <form className={styles.searchForm}>
          <SearchIcon className={styles.searchIcon} size={20} />
          <input 
            type="text" 
            name="q" 
            defaultValue={q} 
            placeholder="Rechercher une punchline, un mot, un thème..." 
            className={styles.searchInput}
          />
          {selectedTheme && <input type="hidden" name="theme" value={selectedTheme} />}
          <button type="submit" className={styles.searchBtn}>Chercher</button>
        </form>

        <div className={styles.themesQuick}>
          <span>Filtrer par thème :</span>
          <div className={styles.themeTags}>
            <Link 
              href={`/search${q ? `?q=${q}` : ''}`} 
              className={`${styles.themeTag} ${!selectedTheme ? styles.themeActive : ''}`}
            >
              Tous
            </Link>
            {allThemes.map(theme => (
              <Link 
                key={theme.id} 
                href={`/search?${q ? `q=${q}&` : ''}theme=${theme.name}`}
                className={`${styles.themeTag} ${selectedTheme === theme.name ? styles.themeActive : ''}`}
              >
                <Hash size={12}/> {theme.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.results}>
        {(q || selectedTheme) && <h2 className={styles.resultsTitle}>{results.length} résultats{q ? ` pour "${q}"` : ''}{selectedTheme ? ` [thème: ${selectedTheme}]` : ''}</h2>}
        
        {!q && !selectedTheme ? (
          <div className={styles.emptyState}>
            <Library size={48} className={styles.emptyIcon} />
            <p>Utilisez la barre de recherche ou cliquez un thème pour explorer vos textes.</p>
          </div>
        ) : results.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Aucun résultat trouvé.</p>
          </div>
        ) : (
          <div className={styles.resultsList}>
            {results.map((segment) => (
              <div key={segment.id} className={styles.resultItem}>
                <div className={styles.resultText}>"{segment.text}"</div>
                <div className={styles.resultMeta}>
                  <span><Mic2 size={14} /> {segment.transcription.audioRecord.title}</span>
                  <span><Clock size={14} /> {Math.floor(segment.startTime / 60)}:{(segment.startTime % 60).toFixed(0).padStart(2, '0')} – {Math.floor(segment.endTime / 60)}:{(segment.endTime % 60).toFixed(0).padStart(2, '0')}</span>
                </div>
                {segment.themes.length > 0 && (
                  <div className={styles.resultThemes}>
                    {segment.themes.map((t: any) => (
                      <span key={t.id} className={styles.resultThemeTag}><Hash size={11}/> {t.name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
