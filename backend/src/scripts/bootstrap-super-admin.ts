import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) {
    throw new Error('SUPER_ADMIN_EMAIL no está configurado. Agregalo al archivo .env del backend.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SUPER_ADMIN_EMAIL no contiene un email válido.')
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new Error(`No existe una cuenta con ${email}. Primero registrá esa cuenta desde /login o /register y luego volvé a ejecutar el bootstrap.`)
  }
  if (user.platformRole === 'SUPER_ADMIN') {
    console.log(`${email} ya está configurado como SUPER_ADMIN. No se realizaron cambios.`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { platformRole: 'SUPER_ADMIN', tokenVersion: { increment: 1 } },
  })
  console.log(`SUPER_ADMIN asignado correctamente a ${email}. Iniciá sesión nuevamente desde /login.`)
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
