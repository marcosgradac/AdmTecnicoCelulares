import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { BrandLogo } from '../brand/BrandLogo'
import { SecurityHighlights } from './SecurityHighlights'
import type { AuthVisualVariant } from './auth-visual.types'
import technician from '../../assets/brand/tecnodesk-tecnico-derecha.png'
import './auth-layout.scss'

export function AuthLayout({ title, description, children, variant = 'login' }: {
  title: string
  description: string
  children: ReactNode
  variant?: AuthVisualVariant
}) {
  const accountFlow = variant === 'login' || variant === 'register'
  return <main className={`auth-shell auth-shell--${variant}`}>
    <section className="auth-workspace" aria-labelledby="auth-title">
      <header className="auth-brand"><BrandLogo className="auth-logo" /></header>
      <div className="auth-workspace-body">
        <div className="auth-intro">
          <span className="auth-eyebrow">TU TALLER, CONECTADO.</span>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
        </div>
        <div className="auth-card">
          {accountFlow && <nav className="auth-tabs" aria-label="Acceso a TecnoDesk">
            <NavLink to="/login">Iniciar sesión</NavLink>
            <NavLink to="/register">Crear cuenta</NavLink>
          </nav>}
          <div className="auth-card-content">{children}</div>
        </div>
      </div>
      <footer className="auth-trust"><SecurityHighlights /></footer>
    </section>
    <aside className="auth-photograph" aria-label="Taller conectado con TecnoDesk">
      <img src={technician} alt="Técnico reparando un celular en un taller iluminado en azul y violeta, con indicadores de reparaciones, notificación al cliente y pago registrado." />
    </aside>
  </main>
}
