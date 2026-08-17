export interface FakeMail {
  to: string
  subject: string
  resetUrl: string
}

const fakeOutbox: FakeMail[] = []

export const clearFakeOutbox = () => { fakeOutbox.length = 0 }
export const getFakeOutbox = () => [...fakeOutbox]

export const sendPasswordResetEmail = async (to: string, token: string) => {
  const configuredFrontendUrl = process.env.FRONTEND_URL
  if (!configuredFrontendUrl && process.env.NODE_ENV === 'production') throw new Error('FRONTEND_URL es obligatorio en producción')
  const frontendUrl = (configuredFrontendUrl ?? 'http://localhost:5173').replace(/\/$/, '')
  const resetUrl = `${frontendUrl}/restablecer-contrasena?token=${encodeURIComponent(token)}`
  const mail = { to, subject: 'Restablecé tu contraseña de TecnoDesk', resetUrl }

  if ((process.env.MAIL_MODE ?? 'console') === 'fake') {
    fakeOutbox.push(mail)
    return
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn('[mail:console] Solicitud de restablecimiento generada, pero no hay un proveedor de correo configurado')
    return
  }

  console.info(`[mail:console] ${mail.subject} | Destino: ${to} | Enlace: ${resetUrl}`)
}
