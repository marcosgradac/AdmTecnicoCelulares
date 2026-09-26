/**
 * Catálogo compartido de marcas de dispositivos.
 * Centraliza la lista de marcas, la normalización del valor que se guarda en `deviceBrand`
 * (sin duplicar variantes tipo "samsung"/"SAMSUNG"), los tonos suaves y los logos de marca que usa `DeviceBrandAvatar`.
 */

import {
  siApple,
  siAsus,
  siBlackberry,
  siFairphone,
  siGoogle,
  siHonor,
  siHtc,
  siHuawei,
  siKyocera,
  siLg,
  siMeizu,
  siMotorola,
  siNokia,
  siOneplus,
  siOppo,
  siRazer,
  siSamsung,
  siSharp,
  siSony,
  siVivo,
  siXiaomi,
} from 'simple-icons'

/** Trazo vectorial (viewBox 24×24) y color de marca de un logo. Fuente: simple-icons (CC0-1.0), empaquetado en el frontend. */
interface DeviceBrandGlyph {
  path: string
  hex: string
}

export interface DeviceBrandTone {
  background: string
  color: string
}

interface DeviceBrandDefinition {
  /** Nombre normalizado que se guarda en `deviceBrand`. */
  label: string
  /** Variantes reconocidas (se normalizan a `label`). */
  aliases: string[]
  tone: DeviceBrandTone
  /** Logo de la marca; si falta, el avatar usa el celular genérico. */
  logo?: DeviceBrandGlyph
}

/** Opción especial del selector: habilita la carga manual de una marca desconocida. */
export const OTHER_DEVICE_BRAND = 'Otra'

const tone = (background: string, color: string): DeviceBrandTone => ({ background, color })

const tones = {
  gray: tone('#F0F2F5', '#4B5563'),
  blue: tone('#EAF2FE', '#2A5FA8'),
  violet: tone('#EFEBFE', '#5B3FD6'),
  orange: tone('#FFF1E3', '#B4560A'),
  red: tone('#FDEBEC', '#B02F35'),
  sky: tone('#E8F6FF', '#1C6EA4'),
  indigo: tone('#ECEEFD', '#3B4BB5'),
  green: tone('#E9F7F0', '#1F7A4D'),
  amber: tone('#FFF6E0', '#8A6100'),
  teal: tone('#E6F6F6', '#0F7673'),
  pink: tone('#FDEBF4', '#A83275'),
  slate: tone('#EDF1F6', '#3F5878'),
}

/** Tonos de referencia cuando la marca no se reconoce. */
const genericTone: DeviceBrandTone = tone('#F1F3F7', '#6B7280')

/** Luminancia relativa WCAG 2.1 de un color `#rrggbb` (o `rrggbb`). */
const relativeLuminance = (color: string) => {
  const hex = color.replace('#', '')
  const channel = (offset: number) => { const value = parseInt(hex.slice(offset, offset + 2), 16) / 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** Relación de contraste WCAG entre dos colores. */
const contrastRatio = (first: string, second: string) => {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

/** Usa el color característico de la marca cuando se lee bien sobre el fondo suave; si no, el color de texto del tono. */
const logoColor = (logo: DeviceBrandGlyph, avatarTone: DeviceBrandTone) => contrastRatio(logo.hex, avatarTone.background) >= 3 ? `#${logo.hex.toUpperCase()}` : avatarTone.color

/**
 * Catálogo de marcas de dispositivos.
 * Orden del selector: arriba las 13 más usadas en taller técnico, seguidas del resto en orden alfabético.
 * `logo` se asigna cuando simple-icons publica el logo oficial de la marca; de lo contrario queda en fallback (SmartphoneRounded).
 */
const deviceBrandDefinitions: DeviceBrandDefinition[] = [
  // --- Las 13 marcas más usadas arriba ---
  { label: 'Samsung', aliases: ['galaxy', 'samsug', 'sumsung'], tone: tones.blue, logo: siSamsung },
  { label: 'Motorola', aliases: ['moto'], tone: tones.violet, logo: siMotorola },
  { label: 'Apple', aliases: ['iphone', 'ipad', 'ipod'], tone: tones.gray, logo: siApple },
  { label: 'Xiaomi', aliases: ['xiomi', 'mi'], tone: tones.orange, logo: siXiaomi },
  { label: 'Redmi', aliases: ['redmi note'], tone: tones.orange },
  { label: 'POCO', aliases: ['poco'], tone: tones.orange },
  { label: 'TCL', aliases: [], tone: tones.indigo },
  { label: 'Huawei', aliases: [], tone: tones.red, logo: siHuawei },
  { label: 'Honor', aliases: [], tone: tones.sky, logo: siHonor },
  { label: 'ZTE', aliases: ['blade'], tone: tones.blue },
  { label: 'Oppo', aliases: ['oppo'], tone: tones.green, logo: siOppo },
  { label: 'Realme', aliases: ['real me'], tone: tones.amber },
  { label: 'Vivo', aliases: [], tone: tones.blue, logo: siVivo },

  // --- Resto del catálogo en orden alfabético claro ---
  { label: 'Alcatel', aliases: ['one touch', 'onetouch'], tone: tones.amber },
  { label: 'Asus', aliases: ['zenfone', 'rog phone'], tone: tones.indigo, logo: siAsus },
  { label: 'BlackBerry', aliases: ['black berry', 'rim'], tone: tones.slate, logo: siBlackberry },
  { label: 'Blackview', aliases: ['black view'], tone: tones.slate },
  { label: 'BLU', aliases: [], tone: tones.blue },
  { label: 'Coolpad', aliases: ['cool pad'], tone: tones.teal },
  { label: 'Cubot', aliases: [], tone: tones.indigo },
  { label: 'Doogee', aliases: [], tone: tones.amber },
  { label: 'Essential', aliases: ['essential phone'], tone: tones.gray },
  { label: 'Fairphone', aliases: ['fair phone'], tone: tones.sky, logo: siFairphone },
  { label: 'Google', aliases: ['pixel', 'nexus'], tone: tones.blue, logo: siGoogle },
  { label: 'Hisense', aliases: ['hi sense'], tone: tones.teal },
  { label: 'HTC', aliases: [], tone: tones.green, logo: siHtc },
  { label: 'Infinix', aliases: ['infinix mobile'], tone: tones.green },
  { label: 'iQOO', aliases: ['iqoo', 'i qoo'], tone: tones.amber },
  { label: 'itel', aliases: ['i tel', 'itel mobile'], tone: tones.red },
  { label: 'Kyocera', aliases: ['duraforce'], tone: tones.red, logo: siKyocera },
  { label: 'LeEco', aliases: ['letv', 'le tv'], tone: tones.indigo },
  { label: 'LG', aliases: ['lg electronics'], tone: tones.pink, logo: siLg },
  { label: 'Meizu', aliases: [], tone: tones.red, logo: siMeizu },
  { label: 'Microsoft', aliases: ['lumia', 'surface duo'], tone: tones.sky },
  { label: 'Nokia', aliases: ['nokia mobile', 'hmd'], tone: tones.teal, logo: siNokia },
  { label: 'Nothing', aliases: ['nothing phone', 'nothing tech'], tone: tones.gray },
  { label: 'OnePlus', aliases: ['one plus'], tone: tones.red, logo: siOneplus },
  { label: 'Oukitel', aliases: [], tone: tones.amber },
  { label: 'Palm', aliases: ['palm phone'], tone: tones.orange },
  { label: 'Razer', aliases: ['razer phone'], tone: tones.green, logo: siRazer },
  { label: 'Sharp', aliases: ['sharp aquos', 'aquos'], tone: tones.red, logo: siSharp },
  { label: 'Sony', aliases: ['xperia', 'sony ericsson'], tone: tones.slate, logo: siSony },
  { label: 'Tecno', aliases: ['tecno mobile', 'camon'], tone: tones.violet },
  { label: 'Ulefone', aliases: [], tone: tones.amber },
  { label: 'UMIDIGI', aliases: [], tone: tones.indigo },
]

/** Opciones del selector de marca, incluyendo la opción manual. */
export const deviceBrandOptions: string[] = [...deviceBrandDefinitions.map(definition => definition.label), OTHER_DEVICE_BRAND]

/** Clave de comparación: sin mayúsculas, sin acentos y sin signos. */
const brandKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const brandIndex = new Map<string, DeviceBrandDefinition>()
for (const definition of deviceBrandDefinitions) for (const alias of [definition.label, ...definition.aliases]) brandIndex.set(brandKey(alias), definition)

const definitionFor = (value?: string | null) => {
  const key = brandKey(value ?? '')
  if (!key) return undefined
  return brandIndex.get(key) ?? brandIndex.get(key.split(' ')[0])
}

/** Devuelve el nombre normalizado si la marca está en el catálogo (coincidencia exacta); si no, `null`. */
export function findKnownDeviceBrand(value?: string | null): string | null {
  const key = brandKey(value ?? '')
  return key ? brandIndex.get(key)?.label ?? null : null
}

/** Deja el valor listo para guardar: normaliza marcas conocidas y respeta las desconocidas. */
export function normalizeDeviceBrand(value?: string | null): string {
  const cleaned = (value ?? '').replace(/\s+/g, ' ').trim()
  return findKnownDeviceBrand(cleaned) ?? cleaned
}

/** Logo vectorial de la marca (null cuando todavía no lo tenemos: el avatar usa el celular genérico). */
export function deviceBrandLogo(value?: string | null): { path: string; color: string } | null {
  const definition = definitionFor(value)
  if (!definition?.logo) return null
  return { path: definition.logo.path, color: logoColor(definition.logo, definition.tone) }
}

/** Tono suave del avatar para una marca (genérico si no se reconoce). */
export function deviceBrandTone(value?: string | null): DeviceBrandTone {
  return definitionFor(value)?.tone ?? genericTone
}
