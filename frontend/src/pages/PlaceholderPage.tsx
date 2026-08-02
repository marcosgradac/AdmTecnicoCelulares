import { ConstructionRounded } from '@mui/icons-material'
import { Box, Card, CardContent, Typography } from '@mui/material'

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <Card><CardContent><Box minHeight={320} display="grid" textAlign="center" sx={{ placeItems: 'center' }}>
    <Box><ConstructionRounded color="primary" sx={{ fontSize: 48, mb: 1 }} /><Typography variant="h1">{title}</Typography><Typography color="text.secondary" mt={1}>{description}</Typography></Box>
  </Box></CardContent></Card>
}
