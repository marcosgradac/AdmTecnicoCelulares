/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

declare module '*.scss' {
  const content: Record<string, string>
  export default content
}

declare module '*.module.scss' {
  const content: Record<string, string>
  export default content
}
