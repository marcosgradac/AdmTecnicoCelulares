import { PhoneScreen } from './PhoneScreen'
import type { AuthVisualVariant } from './auth-visual.types'
export function CelluFixPhone3D({ variant }: { variant: AuthVisualVariant }) {
  return <div className="phone-stage"><div className="phone-shadow" /><div className="phone-shell"><div className="phone-notch" /><PhoneScreen variant={variant} /><div className="phone-shine" /></div></div>
}
