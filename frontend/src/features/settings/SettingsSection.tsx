import { Box, Card, CardContent, Typography } from '@mui/material'
import type { ReactNode } from 'react'
export function SettingsSection({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) { return <Card id={id} sx={{ scrollMarginTop: 96 }}><CardContent><Typography variant="h2">{title}</Typography><Typography color="text.secondary" mt={.5} mb={2.5}>{description}</Typography><Box>{children}</Box></CardContent></Card> }
