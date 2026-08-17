import { TextField, type TextFieldProps } from '@mui/material'
export function IntegerField({ value, onValueChange, min = 0, max, ...props }: Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & { value: number; onValueChange: (value: number) => void; min?: number; max?: number }) {
  return <TextField {...props} type="text" value={value || ''} inputProps={{ inputMode:'numeric', pattern:'[0-9]*', ...props.inputProps }} onChange={event => { const digits=event.target.value.replace(/\D/g,''); const parsed=digits?Number(digits):0; onValueChange(Math.max(min, max === undefined ? parsed : Math.min(max, parsed))) }}/>
}
