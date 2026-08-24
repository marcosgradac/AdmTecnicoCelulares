const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const securityConfig = {
  payloadLimit: process.env.JSON_PAYLOAD_LIMIT ?? '256kb',
  rateLimits: {
    global: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_GLOBAL_MAX', 120) },
    loginIp: { windowMs: 15 * 60_000, limit: numberFromEnv('RATE_LIMIT_LOGIN_IP_MAX', 20) },
    signup: { windowMs: 60 * 60_000, limit: numberFromEnv('RATE_LIMIT_SIGNUP_MAX', 3) },
    passwordCodeUser: { windowMs: 15 * 60_000, limit: numberFromEnv('RATE_LIMIT_PASSWORD_CODE_USER_MAX', 3) },
    passwordCodeIp: { windowMs: 60 * 60_000, limit: numberFromEnv('RATE_LIMIT_PASSWORD_CODE_IP_MAX', 10) },
    passwordVerify: { windowMs: 15 * 60_000, limit: numberFromEnv('RATE_LIMIT_PASSWORD_VERIFY_MAX', 15) },
    publicTracking: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_PUBLIC_TRACKING_MAX', 60) },
    authenticatedWrites: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_AUTH_WRITES_MAX', 30) },
    superAdminWrites: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_SUPER_ADMIN_WRITES_MAX', 20) },
  },
  login: { captchaAfterFailures: 3, backoffAfterFailures: 5, stateTtlMs: 30 * 60_000 },
  tracking: { captchaAfterMisses: 10, stateTtlMs: 15 * 60_000 },
} as const
