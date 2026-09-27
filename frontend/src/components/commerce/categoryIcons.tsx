import type { SvgIconComponent } from '@mui/icons-material'
import {
  AlbumRounded, AirRounded, BatteryChargingFullRounded, BatteryFullRounded,
  BatteryStdRounded, BluetoothRounded, Brightness7Rounded, BuildCircleRounded,
  BuildRounded, BusinessCenterRounded, CableRounded, CameraAltRounded,
  CategoryRounded, ComputerRounded, ConstructionRounded, ContactlessRounded,
  DeveloperBoardRounded, DiamondRounded, ElectricBoltRounded, EarbudsRounded, ExtensionRounded, FingerprintRounded,
  FlashlightOnRounded, GrainRounded, HandymanRounded, HeadphonesRounded,
  HeadsetRounded, HomeRounded, Inventory2Rounded, KeyboardRounded, LayersRounded,
  LanRounded, LaptopRounded, LightbulbRounded, LocalOfferRounded,
  LocalShippingRounded, MemoryRounded, MicRounded, MonitorRounded, MouseRounded,
  NetworkCheckRounded, NightlightRounded, PetsRounded, PhoneAndroidRounded,
  PhoneIphoneRounded, PhotoCameraRounded, PrecisionManufacturingRounded,
  RadioRounded, RouterRounded, ScaleRounded, SdStorageRounded, SensorsRounded,
  SettingsInputComponentRounded, SignalCellularAltRounded, SimCardRounded,
  SmartphoneRounded, SpaRounded, SpeakerGroupRounded, SpeakerRounded,
  SportsBasketballRounded, SportsEsportsRounded, StorageRounded, StorefrontRounded,
  SupportAgentRounded, SwapHorizRounded, TabletRounded, ToysRounded, TvRounded,
  UmbrellaRounded, UsbRounded, VideocamRounded, WarehouseRounded, WatchRounded,
  WifiRounded,
} from '@mui/icons-material'

export interface CategoryIconOption {
  key: string
  label: string
  icon: SvgIconComponent
  /** Grupo temático: ordena y etiqueta el selector para que sea navegable. */
  group: string
}

/**
 * Catálogo curado para TecnoDesk: solo @mui/icons-material, sin librerías nuevas.
 * `iconKey` se persiste en la categoría; una clave desconocida cae al fallback.
 * Los grupos siguen el rubro real del negocio para que el selector sea legible.
 */
export const CATEGORY_ICONS: ReadonlyArray<CategoryIconOption> = [
  // Celulares y tablets
  { key: 'smartphone', label: 'Smartphones', icon: SmartphoneRounded, group: 'Celulares y tablets' },
  { key: 'phone', label: 'Teléfonos', icon: PhoneAndroidRounded, group: 'Celulares y tablets' },
  { key: 'iphone', label: 'iPhone', icon: PhoneIphoneRounded, group: 'Celulares y tablets' },
  { key: 'tablet', label: 'Tablets', icon: TabletRounded, group: 'Celulares y tablets' },
  { key: 'watch', label: 'Smartwatches', icon: WatchRounded, group: 'Celulares y tablets' },
  { key: 'sim', label: 'SIM / Chips', icon: SimCardRounded, group: 'Celulares y tablets' },
  { key: 'signal', label: 'Antenas / Señal', icon: SignalCellularAltRounded, group: 'Celulares y tablets' },
  { key: 'sensor', label: 'Sensores', icon: SensorsRounded, group: 'Celulares y tablets' },
  { key: 'fingerprint', label: 'Biometría', icon: FingerprintRounded, group: 'Celulares y tablets' },

  // Audio
  { key: 'headphones', label: 'Audio', icon: HeadphonesRounded, group: 'Audio y sonido' },
  { key: 'earbuds', label: 'Auriculares', icon: EarbudsRounded, group: 'Audio y sonido' },
  { key: 'headset', label: 'Headsets', icon: HeadsetRounded, group: 'Audio y sonido' },
  { key: 'speaker', label: 'Parlantes', icon: SpeakerRounded, group: 'Audio y sonido' },
  { key: 'speaker-group', label: 'Bocinas', icon: SpeakerGroupRounded, group: 'Audio y sonido' },
  { key: 'mic', label: 'Micrófonos', icon: MicRounded, group: 'Audio y sonido' },
  { key: 'music', label: 'Música', icon: AlbumRounded, group: 'Audio y sonido' },
  { key: 'radio', label: 'Radios', icon: RadioRounded, group: 'Audio y sonido' },

  // Carga y energía
  { key: 'charger', label: 'Cargadores', icon: ElectricBoltRounded, group: 'Carga y energía' },
  { key: 'power-bank', label: 'Power banks', icon: BatteryFullRounded, group: 'Carga y energía' },
  { key: 'battery', label: 'Baterías', icon: BatteryChargingFullRounded, group: 'Carga y energía' },
  { key: 'battery-cell', label: 'Celdas', icon: BatteryStdRounded, group: 'Carga y energía' },
  { key: 'flashlight', label: 'Linternas', icon: FlashlightOnRounded, group: 'Carga y energía' },
  { key: 'brightness', label: 'Iluminación', icon: Brightness7Rounded, group: 'Carga y energía' },
  { key: 'lightbulb', label: 'Luces', icon: LightbulbRounded, group: 'Carga y energía' },
  { key: 'nightlight', label: 'Nightlight', icon: NightlightRounded, group: 'Carga y energía' },

  // Cables y conectividad
  { key: 'cable', label: 'Cables', icon: CableRounded, group: 'Cables y conectividad' },
  { key: 'usb', label: 'Adaptadores USB', icon: UsbRounded, group: 'Cables y conectividad' },
  { key: 'adapter', label: 'Adaptadores', icon: ExtensionRounded, group: 'Cables y conectividad' },
  { key: 'connector', label: 'Conectores', icon: SettingsInputComponentRounded, group: 'Cables y conectividad' },
  { key: 'bluetooth', label: 'Accesorios BT', icon: BluetoothRounded, group: 'Cables y conectividad' },
  { key: 'nfc', label: 'NFC', icon: ContactlessRounded, group: 'Cables y conectividad' },
  { key: 'wifi', label: 'WiFi', icon: WifiRounded, group: 'Cables y conectividad' },
  { key: 'router', label: 'Routers', icon: RouterRounded, group: 'Cables y conectividad' },
  { key: 'network', label: 'Redes', icon: NetworkCheckRounded, group: 'Cables y conectividad' },
  { key: 'lan', label: 'Cables de red', icon: LanRounded, group: 'Cables y conectividad' },

  // Fundas, vidrios y protección
  { key: 'case', label: 'Fundas', icon: Inventory2Rounded, group: 'Fundas y protección' },
  { key: 'screen-protector', label: 'Vidrios', icon: LayersRounded, group: 'Fundas y protección' },
  { key: 'film', label: 'Películas', icon: GrainRounded, group: 'Fundas y protección' },
  { key: 'reinforce', label: 'Refuerzos', icon: BuildRounded, group: 'Fundas y protección' },
  // Memorias y almacenamiento
  { key: 'memory', label: 'Memorias', icon: MemoryRounded, group: 'Memorias y datos' },
  { key: 'sd', label: 'Micro SD', icon: SdStorageRounded, group: 'Memorias y datos' },
  { key: 'storage', label: 'Almacenamiento', icon: StorageRounded, group: 'Memorias y datos' },

  // Computación
  { key: 'laptop', label: 'Notebooks', icon: LaptopRounded, group: 'Computación' },
  { key: 'computer', label: 'Computadoras', icon: ComputerRounded, group: 'Computación' },
  { key: 'monitor', label: 'Monitores', icon: MonitorRounded, group: 'Computación' },
  { key: 'keyboard', label: 'Teclados', icon: KeyboardRounded, group: 'Computación' },
  { key: 'mouse', label: 'Mouses', icon: MouseRounded, group: 'Computación' },
  { key: 'gaming', label: 'Gaming', icon: SportsEsportsRounded, group: 'Computación' },
  { key: 'tv', label: 'Televisores', icon: TvRounded, group: 'Computación' },

  // Foto y video
  { key: 'camera', label: 'Cámaras', icon: PhotoCameraRounded, group: 'Foto y video' },
  { key: 'camera-dslr', label: 'Cámaras DSLR', icon: CameraAltRounded, group: 'Foto y video' },
  { key: 'video', label: 'Cámaras de video', icon: VideocamRounded, group: 'Foto y video' },
  { key: 'drone', label: 'Drones', icon: AirRounded, group: 'Foto y video' },

  // Repuestos y taller
  { key: 'tools', label: 'Herramientas', icon: HandymanRounded, group: 'Repuestos y taller' },
  { key: 'spare-parts', label: 'Repuestos', icon: PrecisionManufacturingRounded, group: 'Repuestos y taller' },
  { key: 'modules', label: 'Módulos', icon: DeveloperBoardRounded, group: 'Repuestos y taller' },
  { key: 'assembly', label: 'Ensamblaje', icon: BuildCircleRounded, group: 'Repuestos y taller' },
  { key: 'installation', label: 'Instalación', icon: ConstructionRounded, group: 'Repuestos y taller' },
  { key: 'scale', label: 'Básculas', icon: ScaleRounded, group: 'Repuestos y taller' },
  { key: 'swap', label: 'Intercambios', icon: SwapHorizRounded, group: 'Repuestos y taller' },

  // Hogar y otros rubros
  { key: 'home', label: 'Hogar', icon: HomeRounded, group: 'Hogar y otros' },
  { key: 'pets', label: 'Mascotas', icon: PetsRounded, group: 'Hogar y otros' },
  { key: 'beauty', label: 'Cuidado personal', icon: SpaRounded, group: 'Hogar y otros' },
  { key: 'sports', label: 'Deportes', icon: SportsBasketballRounded, group: 'Hogar y otros' },
  { key: 'toys', label: 'Juguetes', icon: ToysRounded, group: 'Hogar y otros' },
  { key: 'weather', label: 'Clima', icon: UmbrellaRounded, group: 'Hogar y otros' },
  { key: 'supplies', label: 'Insumos', icon: BusinessCenterRounded, group: 'Hogar y otros' },
  { key: 'store', label: 'Comercio', icon: StorefrontRounded, group: 'Hogar y otros' },
  { key: 'warehouse', label: 'Depósito', icon: WarehouseRounded, group: 'Hogar y otros' },
  { key: 'shipping', label: 'Envíos', icon: LocalShippingRounded, group: 'Hogar y otros' },
  { key: 'offers', label: 'Promociones', icon: LocalOfferRounded, group: 'Hogar y otros' },
  { key: 'premium', label: 'Premium', icon: DiamondRounded, group: 'Hogar y otros' },
  { key: 'support', label: 'Soporte', icon: SupportAgentRounded, group: 'Hogar y otros' },

  { key: 'generic', label: 'General', icon: CategoryRounded, group: 'General' },
]

/** Nombres de grupo en el orden en que deben aparecer, sin repeticiones. */
export const CATEGORY_ICON_GROUPS: ReadonlyArray<string> = Array.from(
  new Set(CATEGORY_ICONS.map(entry => entry.group)),
)

const BY_KEY = new Map(CATEGORY_ICONS.map(entry => [entry.key, entry.icon]))

/** Resuelve el componente de icono elegido; si la clave no existe o falta, devuelve el fallback. */
export function categoryIcon(iconKey: string | null | undefined): SvgIconComponent {
  return (iconKey && BY_KEY.get(iconKey)) || BY_KEY.get('generic')!
}

/** Etiqueta legible de una clave, con fallback genérico. */
export function categoryIconLabel(iconKey: string | null | undefined): string {
  return CATEGORY_ICONS.find(entry => entry.key === iconKey)?.label ?? 'General'
}

/**
 * Tonos pastel por grupo temático. Solo presentación: el mismo grupo siempre
 * comparte color, así la fila de categorías se lee como una paleta y no como
 * un arcoíris. Fondo apenas teñido, texto saturado para mantener contraste.
 */
export type CategoryTone = 'violet' | 'blue' | 'green' | 'orange' | 'pink'

export const CATEGORY_TONES: Record<CategoryTone, { background: string; color: string; border: string }> = {
  violet: { background: '#F0ECFF', color: '#5B3FD6', border: '#E2DAFF' },
  blue: { background: '#E9F2FF', color: '#1F6FEB', border: '#D6E7FF' },
  green: { background: '#E7F7EE', color: '#1F8E55', border: '#CFEBDB' },
  orange: { background: '#FEF1E3', color: '#C4740C', border: '#F8E1C6' },
  pink: { background: '#FDEBF3', color: '#C6488C', border: '#F9D9E7' },
}

const TONE_BY_GROUP: Record<string, CategoryTone> = {
  'Celulares y tablets': 'violet',
  'Audio y sonido': 'pink',
  'Carga y energía': 'orange',
  'Cables y conectividad': 'blue',
  'Fundas y protección': 'green',
  'Memorias y datos': 'blue',
  'Computación': 'violet',
  'Foto y video': 'pink',
  'Repuestos y taller': 'orange',
  'Hogar y otros': 'green',
  General: 'violet',
}

const GROUP_BY_KEY = new Map(CATEGORY_ICONS.map(entry => [entry.key, entry.group]))

/** Resuelve el tono pastel de una categoría a partir del grupo de su icono. */
export function categoryTone(iconKey: string | null | undefined): CategoryTone {
  const group = (iconKey && GROUP_BY_KEY.get(iconKey)) || 'General'
  return TONE_BY_GROUP[group] || 'violet'
}
