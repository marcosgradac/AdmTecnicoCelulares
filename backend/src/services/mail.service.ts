export interface FakeMail {
  to: string
  subject: string
  resetUrl: string
}

const fakeOutbox: FakeMail[] = []

export const clearFakeOutbox = () => { fakeOutbox.length = 0 }
export const getFakeOutbox = () => [...fakeOutbox]

export const sendPasswordResetEmail = async (to: string, token: string) => {
  const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  const resetUrl = `${frontendUrl}/restablecer-contrasena?token=${encodeURIComponent(token)}`
  const mail = { to, subject: 'Restablecé tu contraseña de CelluFix', resetUrl }

  if ((process.env.MAIL_MODE ?? 'console') === 'fake') {
    fakeOutbox.push(mail)
    return
  }

  console.info(`[mail:console] ${mail.subject} | Destino: ${to} | Enlace: ${resetUrl}`)
}
