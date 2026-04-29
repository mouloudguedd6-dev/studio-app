const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'admin@studio.com' },
    update: { password: 'admin' },
    create: {
      email: 'admin@studio.com',
      name: 'Admin Rapper',
      password: 'admin',
    },
  })
  console.log('Seeded User:', user)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
