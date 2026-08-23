import { useState } from 'react'
import { IconButton, InputAdornment, TextField } from '@mui/material'
import type { TextFieldProps } from '@mui/material'
import { LockRounded, VisibilityOffRounded, VisibilityRounded } from '@mui/icons-material'

export function PasswordField({ value, onChange, label = 'Contraseña', autoComplete = 'current-password', showLeadingIcon = false, ...rest }: TextFieldProps & { showLeadingIcon?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <TextField
      {...rest}
      label={label}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange as any}
      autoComplete={autoComplete}
      InputProps={{
        startAdornment: showLeadingIcon ? <InputAdornment position="start"><LockRounded /></InputAdornment> : undefined,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(s => !s)} edge="end">
              {show ? <VisibilityOffRounded /> : <VisibilityRounded />}
            </IconButton>
          </InputAdornment>
        ),
        sx: { height: 56, px: 1 },
      }}
      sx={{ '& .MuiInputBase-root': { borderRadius: 10 } }}
    />
  )
}

export default PasswordField
