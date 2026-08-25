import { ArrowOutwardRounded } from '@mui/icons-material'
import { Box, Button, Typography, type SvgIconProps } from '@mui/material'
import type { ComponentType } from 'react'

export interface SupportChannelData {
  name: string
  description: string
  action: string
  url: string
  icon: ComponentType<SvgIconProps>
  tone: 'whatsapp' | 'instagram' | 'facebook'
}

export function SupportChannel({ channel }: { channel: SupportChannelData }) {
  const Icon = channel.icon
  return <Box className={`support-channel support-channel--${channel.tone}`}><Box className="support-channel__icon"><Icon /></Box><Box className="support-channel__body"><Typography variant="h2">{channel.name}</Typography><Typography color="text.secondary">{channel.description}</Typography><Button component="a" href={channel.url} target="_blank" rel="noopener noreferrer" endIcon={<ArrowOutwardRounded />} variant="text">{channel.action}</Button></Box></Box>
}
