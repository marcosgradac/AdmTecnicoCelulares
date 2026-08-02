import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Button, IconButton } from '@mui/material'
import { BuildRounded, CloseRounded, MenuRounded } from '@mui/icons-material'
export function LandingHeader() {
  const [open,setOpen]=useState(false),[scrolled,setScrolled]=useState(false)
  useEffect(()=>{const fn=()=>setScrolled(scrollY>16);addEventListener('scroll',fn,{passive:true});return()=>removeEventListener('scroll',fn)},[])
  const close=()=>setOpen(false)
  return <header className={`landing-header ${scrolled?'is-scrolled':''}`}><div className="landing-container landing-nav">
    <Link className="landing-logo" to="/" onClick={close}><i><BuildRounded/></i><span>CelluFix<small>Gestión técnica</small></span></Link>
    <IconButton className="landing-menu-button" aria-label={open?'Cerrar menú':'Abrir menú'} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?<CloseRounded/>:<MenuRounded/>}</IconButton>
    <Box component="nav" aria-label="Navegación de la landing" className={open?'is-open':''}>
      <a href="#funciones" onClick={close}>Funciones</a><a href="#como-funciona" onClick={close}>Cómo funciona</a><a href="#seguimiento" onClick={close}>Seguimiento</a><a href="#preguntas" onClick={close}>Preguntas frecuentes</a>
      <Button component={Link} to="/login" variant="text">Iniciar sesión</Button><Button component={Link} to="/registro" variant="contained">Crear cuenta</Button>
    </Box>
  </div></header>
}
