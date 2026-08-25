import { BuildCircleOutlined, LightbulbOutlined, LockPersonOutlined, SpaceDashboardOutlined } from '@mui/icons-material'
import { Box, Typography } from '@mui/material'

const topics = [
  { title: 'Uso de TecnoDesk', description: 'Dudas sobre funciones y herramientas del sistema.', icon: SpaceDashboardOutlined },
  { title: 'Cuenta y acceso', description: 'Inicio de sesión, contraseña o configuración.', icon: LockPersonOutlined },
  { title: 'Problemas técnicos', description: 'Algo no funciona como debería.', icon: BuildCircleOutlined },
  { title: 'Sugerencias', description: 'Ideas o propuestas para mejorar TecnoDesk.', icon: LightbulbOutlined },
] as const

export function SupportTopics() {
  return <Box component="section" className="support-topics"><Typography variant="h2" color="primary.main" mb={2}>¿Sobre qué necesitás ayuda?</Typography><Box className="support-topics__grid">{topics.map(({ title, description, icon: Icon }) => <Box className="support-topic" key={title}><Icon /><Box><Typography fontWeight={800}>{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Box></Box>)}</Box></Box>
}
