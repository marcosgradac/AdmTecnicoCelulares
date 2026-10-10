const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const previewProcessMax = Number(process.env.RATE_LIMIT_TRACKING_PREVIEW_PROCESS_MAX ?? 120)
if (process.env.CLIENT_IP_MODE === 'cf' && (!Number.isInteger(previewProcessMax) || previewProcessMax < 1 || previewProcessMax > 600)) {
  throw new Error('Invalid preview process budget: use an integer between 1 and 600')
}

const baselinePreviewLimit = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > 600) {
    throw new Error('Invalid baseline preview budget: use an integer between 1 and 600')
  }
  return value
}
const baselineLinkMax = baselinePreviewLimit('RATE_LIMIT_TRACKING_PREVIEW_BASELINE_LINK_MAX', 10)
const baselineProcessMax = baselinePreviewLimit('RATE_LIMIT_TRACKING_PREVIEW_BASELINE_PROCESS_MAX', 600)

const previewCfMax = Number(process.env.RATE_LIMIT_TRACKING_PREVIEW_CF_MAX ?? 120)
if (!Number.isInteger(previewCfMax) || previewCfMax < 1 || previewCfMax > 600) {
  throw new Error('Invalid CF preview budget: use an integer between 1 and 600')
}

export const securityConfig = {
  payloadLimit: process.env.JSON_PAYLOAD_LIMIT ?? '256kb',
  rateLimits: {
    // Techo anti-abuso por IP. En un comercio real varios empleados pueden salir por la
    // misma IP publica, asi que este limite protege el proceso y no el uso individual:
    // el presupuesto por persona vive en `authenticatedApi`, que se aplica tras authenticate.
    global: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_GLOBAL_MAX', 600) },
    authenticatedApi: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_AUTH_MAX', 300) },
    loginIp: { windowMs: 15 * 60_000, limit: numberFromEnv('RATE_LIMIT_LOGIN_IP_MAX', 20) },
    signup: { windowMs: 60 * 60_000, limit: numberFromEnv('RATE_LIMIT_SIGNUP_MAX', 3) },
    passwordCodeUser: { windowMs: 15 * 60_000, limit: numberFromEnv('RATE_LIMIT_PASSWORD_CODE_USER_MAX', 3) },
    passwordCodeIp: { windowMs: 60 * 60_000, limit: numberFromEnv('RATE_LIMIT_PASSWORD_CODE_IP_MAX', 10) },
    passwordVerify: { windowMs: 15 * 60_000, limit: numberFromEnv('RATE_LIMIT_PASSWORD_VERIFY_MAX', 15) },
    publicTracking: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_PUBLIC_TRACKING_MAX', 60) },
    trackingPreview: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_TRACKING_PREVIEW_MAX', 30) },
    trackingPreviewBaseline: { linkLimit: baselineLinkMax, processLimit: baselineProcessMax },
    // Experimental shared-egress ceiling; per-IP+link still uses trackingPreview above.
    trackingPreviewCf: { limit: previewCfMax, processLimit: previewProcessMax },
    health: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_HEALTH_MAX', 30) },
    authenticatedWrites: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_AUTH_WRITES_MAX', 30) },
    superAdminWrites: { windowMs: 60_000, limit: numberFromEnv('RATE_LIMIT_SUPER_ADMIN_WRITES_MAX', 20) },
  },
  login: { captchaAfterFailures: 3, backoffAfterFailures: 5, stateTtlMs: 30 * 60_000 },
  tracking: { captchaAfterMisses: 10, stateTtlMs: 15 * 60_000 },
} as const
