import { ArrowBackRounded } from '@mui/icons-material'
import { Button } from '@mui/material'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../../components/brand/BrandLogo'
import './terms-page.scss'

const inline = (text: string) => text.split(/(\*\*[^*]+\*\*)/).map((part, index) => part.startsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)

export function LegalDocumentPage({ title, effectiveLabel, description, content }: { title: string; effectiveLabel: string; description: string; content: string }) {
  const lines = content.split('\n')
  return <main className="terms-page"><div className="terms-shell"><header className="terms-header"><Link to="/"><BrandLogo className="terms-logo" /></Link><span>DOCUMENTO LEGAL</span><h1>{title}</h1><p>Última actualización: {effectiveLabel}</p><small>{description}</small></header><article className="terms-document">{lines.map((raw, index) => { const line = raw.trim(); if (!line || line.startsWith('# ')) return null; if (line.startsWith('### ')) return <h3 key={index}>{line.slice(4)}</h3>; if (line.startsWith('## ')) return <h2 key={index}>{line.slice(3)}</h2>; if (line.startsWith('* ')) return <ul key={index}><li>{inline(line.slice(2))}</li></ul>; if (line === '---') return <hr key={index}/>; return <p key={index}>{inline(line)}</p> })}</article><footer className="terms-footer"><Button component={Link} to="/" startIcon={<ArrowBackRounded/>}>Volver a TecnoDesk</Button></footer></div></main>
}
