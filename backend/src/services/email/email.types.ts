export interface PasswordChangeEmailInput { to: string; name: string; code: string; expiresInMinutes: number }
export interface EmailDelivery { id: string }
export interface FakeMail { to: string; subject: string; resetUrl?: string; code?: string }
