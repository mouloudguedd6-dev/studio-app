"use client"

import { useState } from "react"
import { Play, BookmarkPlus, BookmarkCheck } from "lucide-react"
import { toggleFavoriteSegment } from "../../actions/collection"
import { playAudioExclusively } from "@/lib/audio-playback"
import styles from "./textDetail.module.css"

type SegmentRowData = {
  id: string
  startTime: number
  endTime: number
  text: string
}

export default function SegmentRow({ 
  segment, 
  audioPath,
  isInitiallyFavorited 
}: { 
  segment: SegmentRowData, 
  audioPath: string,
  isInitiallyFavorited: boolean 
}) {
  const [isFav, setIsFav] = useState(isInitiallyFavorited)
  const [isPlaying, setIsPlaying] = useState(false)

  const handleToggleFav = async () => {
    // Optimistic UI
    setIsFav(!isFav)
    await toggleFavoriteSegment(segment.id)
  }

  const playSegment = async () => {
    const audio = new Audio(`/api/audio/${audioPath}`)
    audio.currentTime = segment.startTime
    await playAudioExclusively(audio)
    setIsPlaying(true)
    
    setTimeout(() => {
      audio.pause()
      setIsPlaying(false)
    }, (segment.endTime - segment.startTime) * 1000)
  }

  return (
    <div className={styles.segmentRow}>
      <div className={styles.timecode}>
        {Math.floor(segment.startTime / 60)}:{(segment.startTime % 60).toString().padStart(2, '0').substring(0,2)}
      </div>
      <div className={styles.textLine}>
        {segment.text}
      </div>
      <div className={styles.lineActions}>
        <button className={styles.iconBtn} onClick={playSegment} title="Écouter cet extrait">
          <Play size={16} fill={isPlaying ? "currentColor" : "none"} />
        </button>
        <button 
          className={`${styles.iconBtn} ${isFav ? styles.iconFav : ''}`} 
          onClick={handleToggleFav} 
          title={isFav ? "Retirer des punchlines" : "Ajouter aux punchlines"}
        >
          {isFav ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
        </button>
      </div>
    </div>
  )
}
