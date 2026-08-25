import { Resend } from 'resend'
import type { EmailDelivery, FakeMail, PasswordChangeEmailInput } from './email.types'
import { passwordChangeCodeTemplate } from './templates/password-change-code.template'

const fakeOutbox: FakeMail[] = []
const apiKey = process.env.RESEND_API_KEY
const resend = apiKey ? new Resend(apiKey) : null
const fromAddress = () => (process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL)?.trim()

export const clearFakeOutbox = () => { fakeOutbox.length = 0 }
export const getFakeOutbox = () => [...fakeOutbox]

const deliver = async (mail: FakeMail, html: string, text: string): Promise<EmailDelivery> => {
  if (process.env.MAIL_MODE === 'fake') { fakeOutbox.push(mail); return { id: `fake-${fakeOutbox.length}` } }
  const from = fromAddress()
  if (!resend || !from) throw new Error(`Configuración de email incompleta: ${!resend ? 'RESEND_API_KEY' : 'EMAIL_FROM'}`)
  const { data, error } = await resend.emails.send({ from, to: [mail.to], subject: mail.subject, html, text })
  if (error || !data?.id) throw new Error(error?.message || 'Resend no confirmó el envío')
  return { id: data.id }
}

export const sendPasswordChangeCode = async (input: PasswordChangeEmailInput) => {
  const template = passwordChangeCodeTemplate(input)
  return deliver({ to: input.to, subject: template.subject, code: input.code }, template.html, template.text)
}

export const sendPasswordResetEmail = async (to: string, token: string) => {
  const configuredFrontendUrl = process.env.FRONTEND_URL
  if (!configuredFrontendUrl && process.env.NODE_ENV === 'production') throw new Error('FRONTEND_URL es obligatorio')
  const resetUrl = `${(configuredFrontendUrl ?? 'http://localhost:5173').replace(/\/$/, '')}/restablecer-contrasena?token=${encodeURIComponent(token)}`
  return deliver(
    { to, subject: 'Restablecé tu contraseña de TecnoDesk', resetUrl },
    `<p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="${resetUrl}">Elegir una nueva contraseña</a></p><p>Si no fuiste vos, ignorá este correo.</p>`,
    `Restablecé tu contraseña de TecnoDesk: ${resetUrl}`,
  )
}
