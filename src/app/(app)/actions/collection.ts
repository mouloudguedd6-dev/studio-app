"use server"

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function toggleFavoriteSegment(segmentId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { error: "Unauthorized" }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { error: "User not found" }

  // Get or create "Favorites" collection
  let favCollection = await prisma.collection.findFirst({
    where: { userId: user.id, type: "favorites" }
  })

  if (!favCollection) {
    favCollection = await prisma.collection.create({
      data: { userId: user.id, name: "Mes Punchlines", type: "favorites" }
    })
  }

  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
    include: { collections: true }
  })

  if (!segment) return { error: "Segment not found" }

  const isFavorited = segment.collections.some(c => c.id === favCollection!.id)

  if (isFavorited) {
    await prisma.segment.update({
      where: { id: segmentId },
      data: { collections: { disconnect: { id: favCollection.id } } }
    })
  } else {
    await prisma.segment.update({
      where: { id: segmentId },
      data: { collections: { connect: { id: favCollection.id } } }
    })
  }

  revalidatePath("/texts")
  revalidatePath(`/texts/${segment.transcriptionId}`) // Simplification
  
  return { success: true, isFavorited: !isFavorited }
}
