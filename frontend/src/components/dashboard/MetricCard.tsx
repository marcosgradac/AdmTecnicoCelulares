import { Box, Card, CardContent, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export function MetricCard({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone: string }) {
  return <Card className={`dashboard-metric dashboard-metric--${tone}`}><CardContent>
    <Box className="dashboard-metric__icon">{icon}</Box><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h2">{value}</Typography>
  </CardContent></Card>
}
