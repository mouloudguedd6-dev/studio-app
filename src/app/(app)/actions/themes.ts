"use server"

import { prisma } from "@/lib/prisma"

const DEFAULT_THEMES = [
  "amour", "ex", "meufs", "argent", "famille",
  "travail", "rue", "ambition", "trahison", "solitude",
  "nuit", "club", "loyauté", "hustle", "douleur"
]

export async function ensureDefaultThemes() {
  for (const name of DEFAULT_THEMES) {
    await prisma.theme.upsert({
      where: { name },
      update: {},
      create: { name }
    })
  }
}

export async function assignThemeToSegment(segmentId: string, themeName: string) {
  const theme = await prisma.theme.upsert({
    where: { name: themeName },
    update: {},
    create: { name: themeName }
  })

  await prisma.segment.update({
    where: { id: segmentId },
    data: { themes: { connect: { id: theme.id } } }
  })
}

export async function removeThemeFromSegment(segmentId: string, themeId: string) {
  await prisma.segment.update({
    where: { id: segmentId },
    data: { themes: { disconnect: { id: themeId } } }
  })
}
