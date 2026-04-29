"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Cpu, Loader2 } from "lucide-react"

export default function YaourtGenerator({ 
  maquetteId, 
  variant,
  packSegments
}: { 
  maquetteId: string, 
  variant: string,
  packSegments: any[]
}) {
  const [isGenerating, setIsGenerating] = useState(false)
  const router = useRouter()

  const handleGenerate = async () => {
    setIsGenerating(true)
    
    try {
      const res = await fetch("/api/yaourt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maquetteId }),
      })

      if (res.ok) {
        router.refresh()
      } else {
        alert("Erreur lors de la génération du Yaourt audio")
      }
    } catch (err) {
      console.error(err)
      alert("Erreur réseau")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <button 
        onClick={handleGenerate}
        disabled={isGenerating || packSegments.length === 0}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1.5rem',
          background: variant === 'A' ? 'var(--accent-color)' : '#ff4081',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 600,
          cursor: isGenerating || packSegments.length === 0 ? 'not-allowed' : 'pointer',
          opacity: isGenerating || packSegments.length === 0 ? 0.7 : 1,
        }}
      >
        {isGenerating ? <Loader2 size={18} className="spinner" /> : <Cpu size={18} />}
        {isGenerating ? "Génération FFMPEG en cours..." : "Générer la piste vocale (Real Voice)"}
      </button>
      {packSegments.length === 0 && (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Le pack ne contient aucun segment de texte.
        </p>
      )}
    </div>
  )
}
