import { LaptopMacRounded, SmartphoneRounded, TabletMacRounded } from '@mui/icons-material'
import { ResponsiveDevicesMockup } from './mockups/ResponsiveDevicesMockup'

const devices = [
  { icon: LaptopMacRounded, title: 'Computadora', text: 'Para trabajar cómodo desde el taller.' },
  { icon: TabletMacRounded, title: 'Tablet', text: 'Ideal para usar desde el mostrador.' },
  { icon: SmartphoneRounded, title: 'Celular', text: 'Consultá y gestioná desde cualquier lugar.' },
]

export function ResponsiveDevicesSection() {
  return (
    <section className="story-section responsive-devices-story">
      <div className="landing-container">
        <div className="responsive-devices-heading" data-reveal>
          <span>100% RESPONSIVE · SIN INSTALACIONES</span>
          <h2>Tu taller, desde cualquier dispositivo</h2>
          <p>
            TecnoDesk se adapta automáticamente a tu pantalla para que puedas trabajar desde la
            computadora, una tablet o tu celular.
          </p>
        </div>

        <ResponsiveDevicesMockup />

        <div className="responsive-device-notes" data-reveal>
          {devices.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <i><Icon /></i>
              <span><strong>{title}</strong><small>{text}</small></span>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
