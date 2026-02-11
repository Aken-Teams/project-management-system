import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Create default users
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      name: 'Alice Chen',
      email: 'alice@example.com',
      role: 'pm',
    },
  })

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      name: 'Bob Wang',
      email: 'bob@example.com',
      role: 'member',
    },
  })

  const carol = await prisma.user.upsert({
    where: { email: 'carol@example.com' },
    update: {},
    create: {
      name: 'Carol Lee',
      email: 'carol@example.com',
      role: 'executive',
    },
  })

  console.log('Created users:')
  console.log(`  - ${alice.name} (${alice.role})`)
  console.log(`  - ${bob.name} (${bob.role})`)
  console.log(`  - ${carol.name} (${carol.role})`)

  // Initialize project code sequences for current year
  const currentYear = new Date().getFullYear()
  const projectTypes = ['sourcing', 'npi', 'cost_saving', 'cip', 'other'] as const

  for (const type of projectTypes) {
    await prisma.projectCodeSequence.upsert({
      where: {
        projectType_year: {
          projectType: type,
          year: currentYear,
        },
      },
      update: {},
      create: {
        projectType: type,
        year: currentYear,
        lastSeq: 0,
      },
    })
  }

  console.log(`Initialized project code sequences for ${currentYear}`)
  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
