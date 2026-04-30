"use client"

import { SessionProvider } from "next-auth/react"
import { AudioPlaybackManager } from "./AudioPlaybackManager"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AudioPlaybackManager />
      {children}
    </SessionProvider>
  )
}
