import { ArrowBackRounded, ContactSupportRounded, Facebook, Instagram, WhatsApp } from '@mui/icons-material'
import { Box, Button, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { FACEBOOK_SUPPORT_URL, INSTAGRAM_SUPPORT_URL, WHATSAPP_SUPPORT_URL } from '../../config/socialLinks'
import { SupportChannel, type SupportChannelData } from './components/SupportChannel'
import { SupportTopics } from './components/SupportTopics'
import './support.scss'

const supportChannels = [
  { name: 'WhatsApp', description: 'Consultas rápidas y asistencia.', action: 'Hablar por WhatsApp', url: WHATSAPP_SUPPORT_URL, icon: WhatsApp, tone: 'whatsapp' },
  { name: 'Instagram', description: 'Mensajes, consultas y novedades.', action: 'Abrir Instagram', url: INSTAGRAM_SUPPORT_URL, icon: Instagram, tone: 'instagram' },
  { name: 'Facebook', description: 'Consultas y novedades de TecnoDesk.', action: 'Abrir Facebook', url: FACEBOOK_SUPPORT_URL, icon: Facebook, tone: 'facebook' },
] satisfies SupportChannelData[]

export function SupportPage() {
  const navigate = useNavigate()
  return <Box className="support-page">
    <Button startIcon={<ArrowBackRounded />} onClick={() => navigate('/admin/configuracion')} sx={{ mb: 2 }}>Volver a Configuración</Button>
    <PageHeader context="SOPORTE" title="¿En qué podemos ayudarte?" description="Estamos para ayudarte con cualquier duda, consulta o problema relacionado con TecnoDesk." />
    <Box className="support-intro"><Box className="support-intro__icon"><ContactSupportRounded /></Box><Box><Typography variant="h2">¿Tenés alguna consulta?</Typography><Typography color="text.secondary">Elegí el canal que prefieras y comunicate con nuestro equipo.</Typography></Box></Box>
    <Box className="support-channels">{supportChannels.map(channel => <SupportChannel key={channel.name} channel={channel} />)}</Box>
    <SupportTopics />
  </Box>
}
