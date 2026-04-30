"use client"

import { useEffect } from "react"
import { setActiveAudioElement } from "@/lib/audio-playback"

export function AudioPlaybackManager() {
  useEffect(() => {
    const handlePlay = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) {
        setActiveAudioElement(event.target)
      }
    }

    document.addEventListener("play", handlePlay, true)
    return () => document.removeEventListener("play", handlePlay, true)
  }, [])

  return null
}
