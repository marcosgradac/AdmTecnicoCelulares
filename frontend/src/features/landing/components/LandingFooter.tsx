import { Link } from 'react-router-dom'
import { BrandLogo } from '../../../components/brand/BrandLogo'
import './footer.scss'

export function LandingFooter(){return <footer className="landing-footer"><div className="landing-container"><div className="footer-brand" aria-label="TecnoDesk"><BrandLogo compact className="footer-brand__mark"/><span className="footer-brand__copy"><strong>TecnoDesk</strong><small>Gestión técnica para reparaciones</small></span></div><nav><a href="#funciones">Funciones</a><a href="#como-funciona">Cómo funciona</a><a href="#preguntas">Preguntas frecuentes</a><Link to="/login">Iniciar sesión</Link><Link to="/registro">Crear cuenta</Link><Link to="/terminos-y-condiciones">Términos</Link><Link to="/privacidad">Privacidad</Link></nav><small className="footer-copyright">© {new Date().getFullYear()} TecnoDesk. Todos los derechos reservados.</small></div></footer>}
