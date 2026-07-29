import { Button } from '@mui/material'
import type { ButtonProps } from '@mui/material'
import type React from 'react'

export function AppButton(props: ButtonProps & { [key: string]: any }) {
  const { sx, children, ...rest } = props as any
  const defaultSx = {
    height: 48,
    minWidth: 140,
    padding: '12px 28px',
    borderRadius: '14px',
    fontWeight: 700,
    fontSize: '1.05rem',
    textTransform: 'none',
  }

  const mergedSx = Array.isArray(sx) ? [defaultSx, ...sx] : { ...defaultSx, ...(sx || {}) }

  return (
    <Button {...rest} sx={mergedSx}>
      {children}
    </Button>
  )
}

export default AppButton
