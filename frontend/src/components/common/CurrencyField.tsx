import { useEffect, useState } from 'react'
import { TextField, type TextFieldProps } from '@mui/material'

const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
export const formatCurrencyValue = (value: number) => formatter.format(value).replace(/\s/g, '')
export function CurrencyField({ value, onValueChange, onEmpty, ...props }: Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & { value: number | null | undefined; onValueChange: (value: number) => void; onEmpty?: () => void }) {
  const [focused, setFocused] = useState(false), [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => { if (!focused) setDraft(value == null ? '' : String(value)) }, [value, focused])
  const display = focused ? draft : value == null ? '' : formatCurrencyValue(value)
  return <TextField {...props} type="text" value={display} inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', ...props.inputProps }} onFocus={event => { setFocused(true); setDraft(value == null ? '' : String(value)); props.onFocus?.(event) }} onBlur={event => { setFocused(false); props.onBlur?.(event) }} onChange={event => { const digits = event.target.value.replace(/\D/g, ''); setDraft(digits); if (digits === '') onEmpty?.(); else onValueChange(Number(digits)) }}/>
}
