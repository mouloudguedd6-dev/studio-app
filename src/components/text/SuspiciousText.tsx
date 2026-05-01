import type { SuspiciousWord } from "@/lib/text-processing/clean-lyrics"

type SuspiciousTextProps = {
  text: string
  suspiciousWords: SuspiciousWord[]
  className?: string
  suspiciousClassName?: string
}

function normalizeToken(token: string) {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

export function SuspiciousText({
  text,
  suspiciousWords,
  className,
  suspiciousClassName,
}: SuspiciousTextProps) {
  const suspiciousByTerm = new Map(
    suspiciousWords.map((word) => [normalizeToken(word.term), word])
  )

  const parts = text.split(/(\n|[\p{L}][\p{L}’'-]*)/gu)

  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (part === "\n") return <br key={`${part}-${index}`} />

        const suspiciousWord = suspiciousByTerm.get(normalizeToken(part))
        if (!suspiciousWord) return <span key={`${part}-${index}`}>{part}</span>

        const title = suspiciousWord.suggestion
          ? `${suspiciousWord.reason}. Suggestion : ${suspiciousWord.suggestion}`
          : suspiciousWord.reason

        return (
          <strong key={`${part}-${index}`} className={suspiciousClassName} title={title}>
            {part}
          </strong>
        )
      })}
    </div>
  )
}
