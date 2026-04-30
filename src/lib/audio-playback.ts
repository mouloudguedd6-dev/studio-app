type AudioPlaybackGlobal = typeof globalThis & {
  __studioActiveAudio?: HTMLMediaElement | null
}

function getPlaybackGlobal() {
  return globalThis as AudioPlaybackGlobal
}

export function setActiveAudioElement(audio: HTMLMediaElement) {
  const playbackGlobal = getPlaybackGlobal()
  const previousAudio = playbackGlobal.__studioActiveAudio

  if (previousAudio && previousAudio !== audio && !previousAudio.paused) {
    previousAudio.pause()
  }

  playbackGlobal.__studioActiveAudio = audio
}

export async function playAudioExclusively(audio: HTMLMediaElement) {
  setActiveAudioElement(audio)
  await audio.play()
}
