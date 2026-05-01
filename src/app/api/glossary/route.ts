import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GLOSSARY_CATEGORIES, ensureDefaultGlossaryEntries } from "@/lib/text-processing/glossary-service"

export const runtime = "nodejs"

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return prisma.user.findUnique({ where: { email: session.user.email } })
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await ensureDefaultGlossaryEntries(user.id)
  const entries = await prisma.glossaryEntry.findMany({
    where: { userId: user.id },
    orderBy: [{ source: "asc" }, { term: "asc" }],
  })

  return NextResponse.json({ entries })
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const term = typeof body?.term === "string" ? body.term.trim() : ""
  const correction = typeof body?.correction === "string" ? body.correction.trim() : ""
  const category = typeof body?.category === "string" && GLOSSARY_CATEGORIES.includes(body.category)
    ? body.category
    : "autre"

  if (!term) {
    return NextResponse.json({ error: "Mot ou expression requis" }, { status: 400 })
  }

  const entry = await prisma.glossaryEntry.upsert({
    where: {
      userId_term: {
        userId: user.id,
        term,
      },
    },
    update: {
      correction: correction || null,
      category,
    },
    create: {
      userId: user.id,
      term,
      correction: correction || null,
      category,
      source: "user",
    },
  })

  return NextResponse.json({ entry })
}
