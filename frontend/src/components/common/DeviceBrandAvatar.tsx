import { Avatar, Box } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { SmartphoneRounded } from '@mui/icons-material'
import { deviceBrandLogo, deviceBrandTone } from '../../config/deviceBrands'

/** Avatar sobrio de 30–36 px con el logo de la marca; usa el celular genérico cuando la marca es desconocida o todavía no tiene logo. */
export function DeviceBrandAvatar({ brand, size = 34 }: { brand?: string | null; size?: number }) {
  const tone = deviceBrandTone(brand)
  const logo = deviceBrandLogo(brand)
  const glyph = Math.round(size * 0.56)
  return <Avatar aria-hidden sx={{ width: size, height: size, flexShrink: 0, bgcolor: tone.background, color: tone.color, border: '1px solid', borderColor: alpha(tone.color, 0.16), '& svg': { fontSize: Math.round(size * 0.5) } }}>{logo ? <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill={logo.color}><path d={logo.path} /></svg> : <SmartphoneRounded />}</Avatar>
}

/** Fila compacta del selector de marca: logo y nombre, con el celular genérico cuando no hay logo. */
export function DeviceBrandOption({ option, optionProps }: { option: string; optionProps: React.HTMLAttributes<HTMLLIElement> & { key: React.Key } }) {
  const { key, ...rest } = optionProps
  return <Box component="li" key={key} {...rest} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><DeviceBrandAvatar brand={option} size={22} />{option}</Box>
}
