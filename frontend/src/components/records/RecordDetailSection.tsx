import { useId, useState, type ReactNode } from 'react'
import { Box, Button, Card, CardContent, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { ExpandMoreRounded } from '@mui/icons-material'
import { GRADIENT_TEXT_SX } from '../../theme/tokens'

/** Mobile disclosures retain their content and every editable descendant. */
export function RecordDetailSection({ title, children, mb, titleLeading }: { title: string; children: ReactNode; mb?: number; titleLeading?: ReactNode }) {
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'))
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  return <Card sx={{ mb }}><CardContent sx={theme => ({ [theme.breakpoints.down('md')]: { p: 1.5, '&:last-child': { pb: 1.5 } } })}>
    {mobile ? <Button fullWidth aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)} endIcon={<ExpandMoreRounded sx={{ transform: expanded ? 'rotate(180deg)' : undefined }} />} sx={{ justifyContent: 'space-between', textAlign: 'left', color: 'text.primary', fontWeight: 750, minHeight: 44 }}>{title}</Button> : <Stack direction="row" gap={1}>{titleLeading}<Typography variant="h2" sx={GRADIENT_TEXT_SX}>{title}</Typography></Stack>}
    <Box id={id} hidden={mobile && !expanded} sx={{ pt: mobile && expanded ? 1 : 0 }}>{children}</Box>
  </CardContent></Card>
}
