import { Box, Card, CardContent, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { GRADIENT_TEXT_SX } from '../../theme/tokens'

export function SettingsSection({ id, title, description, children, active = true, mobileOnly = false }: { id: string; title: string; description: string; children: ReactNode; active?: boolean; mobileOnly?: boolean }) { return <Card id={id} className="settings-section" sx={{ scrollMarginTop: 96, display: { xs: active ? 'block' : 'none', md: mobileOnly ? 'none' : 'block' } }}><CardContent><Typography variant="h2" sx={GRADIENT_TEXT_SX}>{title}</Typography><Typography color="text.secondary" mt={.5} mb={2.5}>{description}</Typography><Box>{children}</Box></CardContent></Card> }
