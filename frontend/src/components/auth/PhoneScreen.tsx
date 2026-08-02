import { PhoneShowcase } from './phone-showcase/PhoneShowcase'
import type { PhoneScreenDefinition } from './phone-showcase/phoneShowcase.types'

export function PhoneScreen({ screen, reducedMotion }: { screen: PhoneScreenDefinition; reducedMotion: boolean }) {
  return <div className="phone-screen"><PhoneShowcase screen={screen} reducedMotion={reducedMotion} /></div>
}
