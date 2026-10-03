/**
 * Genera los iconos de la PWA a partir del logo oficial de TecnoDesk.
 *
 * FUENTE OFICIAL (única):
 *   `assets/brand/logo-perfil-tecnodesk.png`
 * Es el archivo que entregó el usuario ("Logo perfil tecnodesk"). Es un PNG
 * RGB de 1254x1254 SIN canal alfa, con fondo blanco, compuesto así:
 *
 *   - un anillo circular degradado (azul -> violeta), centro (626, 624.5),
 *     radio exterior ~613 px, radio interior ~571 px;
 *   - el isotipo "TD" con el rayo, dentro del anillo;
 *   - la palabra "TecnoDesk" abajo, dentro del anillo.
 *
 * NO se rediseña la marca. No se cambia ningún color, forma ni trazo: solo se
 * recorta y se re-muestrea el mismo artwork. El único color ajeno al logo es el
 * blanco de fondo, que es el mismo blanco que ya usa el logo y que el manifest
 * declara como `background_color`.
 *
 * Las regiones NO están escritas a mano: `detectBadge` y `detectIsotipo` las
 * miden sobre el archivo real (caja de tinta, barrido radial del anillo y banda
 * de filas más alta). Así, si algún día se entrega otro logo con la misma
 * marca, los recortes se recalculan solos en vez de quedar desfasados.
 *
 * Composición de cada icono:
 *   - `tecnodesk-192/512.png` (purpose "any"): el escudo completo, con las
 *     esquinas transparentes. Es el "logo perfil" tal cual.
 *   - `tecnodesk-maskable-192/512.png`: solo el isotipo TD sobre blanco
 *     opaco, dimensionado para entrar en la zona segura de Android. Un ícono
 *     maskable tiene que llenar todo el lienzo (Android lo recorta con círculo,
 *     squircle o rectángulo redondeado) y el TD es lo que sobrevive a un
 *     recorte agresivo y a 48 px en la pantalla de inicio.
 *   - `apple-touch-icon.png`: el escudo completo sobre blanco opaco. iOS no
 *     admite transparencia (pinta de negro el alfa) y aplica su propia máscara.
 *   - `favicon-32.png` / `favicon.ico`: solo el isotipo TD con fondo
 *     transparente. A 16-48 px la palabra "TecnoDesk" es ilegible.
 *
 * Sin dependencias: el PNG se decodifica y codifica con `node:zlib`, que ya
 * viene en Node. El remuestreo es un filtro de área (promedio ponderado por
 * cobertura y con alfa premultiplicado), que es el correcto para reducir
 * imágenes: evita aliasing y halos transparentes.
 *
 * Uso: npm run build:icons
 */
import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(ROOT, 'assets/brand/logo-perfil-tecnodesk.png')
const OUT_DIR = resolve(ROOT, 'public')

/**
 * Umbral de "tinta": cuánto tiene que alejarse un píxel del blanco para
 * contar como parte del logo. 18/255 es holgado para no perder el degradado
 * claro del anillo, que llega a 226,228,253.
 */
const INK_THRESHOLD = 18
/**
 * Rango de blanco que se considera "nada" al keyear el fondo del isotipo.
 * El logo no tiene canal alfa, así que el favicon necesita derivarlo: por
 * debajo de WHITE_KEY_START el píxel es totalmente transparente y por encima
 * de WHITE_KEY_END es totalmente opaco. Se conserva el COLOR original sin
 * desmultiplicar por alfa, para no oscurecer el azul marino del rayo.
 */
const WHITE_KEY_START = 246
const WHITE_KEY_END = 228
/** Fondo de los iconos que exigen opacidad (iOS y maskable). */
const OPAQUE_BACKGROUND = [255, 255, 255]

// ---------------------------------------------------------------------------
// Decodificación PNG (8 bits, sin entrelazado)
// ---------------------------------------------------------------------------

/**
 * Bytes por píxel según el tipo de color de PNG.
 *
 * El logo oficial entregado es `colorType 2` (RGB, sin alfa) sobre fondo
 * blanco, así que se aceptan los cuatro tipos y se normalizan a RGBA.
 */
const BYTES_PER_PIXEL = { 0: 1, 2: 3, 4: 2, 6: 4 }

function decodePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('El archivo de origen no es un PNG válido')

  const chunks = []
  let header = null
  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], colorType: data[9], interlace: data[12] }
    } else if (type === 'IDAT') {
      chunks.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  if (!header) throw new Error('El PNG no tiene cabecera IHDR')
  const sourceBytes = BYTES_PER_PIXEL[header.colorType]
  if (header.depth !== 8 || !sourceBytes || header.interlace !== 0) {
    throw new Error(
      `Solo se admite PNG de 8 bits sin entrelazado (depth=${header.depth}, colorType=${header.colorType}, interlace=${header.interlace})`,
    )
  }

  const { width, height } = header
  const stride = width * 4
  const sourceStride = width * sourceBytes
  const raw = inflateSync(Buffer.concat(chunks))
  const pixels = Buffer.alloc(stride * height)

  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    return pb <= pc ? b : c
  }

  // Los filtros PNG se aplican con el `bytesPerPixel` REAL del archivo (3 para
  // el logo RGB, 4 para un RGBA). Por eso la fila se descomprime aparte, en un
  // buffer del ancho de ORIGEN, y después se expande a RGBA. La fila anterior
  // también se guarda en ese mismo formato: leerla del buffer RGBA mezclaría
  // canales y produciría una imagen corrida.
  const scanline = Buffer.alloc(sourceStride)
  const previous = Buffer.alloc(sourceStride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (sourceStride + 1)]
    const line = raw.subarray(y * (sourceStride + 1) + 1, y * (sourceStride + 1) + 1 + sourceStride)
    for (let x = 0; x < sourceStride; x++) {
      const a = x >= sourceBytes ? scanline[x - sourceBytes] : 0
      const b = previous[x]
      const c = x >= sourceBytes ? previous[x - sourceBytes] : 0
      let value = line[x]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += Math.floor((a + b) / 2)
      else if (filter === 4) value += paeth(a, b, c)
      else if (filter !== 0) throw new Error(`Filtro PNG desconocido: ${filter}`)
      scanline[x] = value & 0xff
    }
    // El filtro Up/Paeth leen de la fila anterior YA reconstruida, así que la
    // copia se hace recién después de aplicar el filtro de esta fila.
    scanline.copy(previous)

    const out = pixels.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < width; x++) {
      const from = x * sourceBytes
      const to = x * 4
      if (sourceBytes === 4) {
        out[to] = scanline[from]
        out[to + 1] = scanline[from + 1]
        out[to + 2] = scanline[from + 2]
        out[to + 3] = scanline[from + 3]
      } else if (sourceBytes === 3) {
        // El logo oficial es RGB: no hay alfa. Se deja en 255 y el fondo blanco
        // se keyea después, al componer cada icono.
        out[to] = scanline[from]
        out[to + 1] = scanline[from + 1]
        out[to + 2] = scanline[from + 2]
        out[to + 3] = 255
      } else if (sourceBytes === 2) {
        out[to] = out[to + 1] = out[to + 2] = scanline[from]
        out[to + 3] = scanline[from + 1]
      } else {
        out[to] = out[to + 1] = out[to + 2] = scanline[from]
        out[to + 3] = 255
      }
    }
  }

  return { width, height, pixels, sourceHadAlpha: sourceBytes === 4 || sourceBytes === 2 }
}
// ---------------------------------------------------------------------------
// Codificación PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePng({ width, height, pixels }) {
  const stride = width * 4
  // Se elige el filtro por fila entre None/Sub/Up/Paeth con el heuristic
  // estándar de suma absoluta mínima: comprime bien y deja el archivo chico.
  const candidates = [0, 1, 2, 4]
  const encodedRows = []

  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null
    let best = null
    for (const filter of candidates) {
      const out = Buffer.alloc(stride)
      let score = 0
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? row[x - 4] : 0
        const b = prev ? prev[x] : 0
        const c = prev && x >= 4 ? prev[x - 4] : 0
        let predictor = 0
        if (filter === 1) predictor = a
        else if (filter === 2) predictor = b
        else if (filter === 4) {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        }
        const value = (row[x] - predictor) & 0xff
        out[x] = value
        score += value < 128 ? value : 256 - value
      }
      if (!best || score < best.score) best = { filter, out, score }
    }
    encodedRows.push(Buffer.from([best.filter]), best.out)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(encodedRows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
// ---------------------------------------------------------------------------
// Recorte y remuestreo
// ---------------------------------------------------------------------------

/** Un píxel es "tinta" del logo si se aleja del blanco más que el umbral. */
function inkAmount(image, x, y) {
  const index = (y * image.width + x) * 4
  return 255 - Math.min(image.pixels[index], image.pixels[index + 1], image.pixels[index + 2])
}

function isInk(image, x, y) {
  return inkAmount(image, x, y) > INK_THRESHOLD
}

/**
 * Caja que envuelve toda la tinta de `image`, acotada a `region`.
 *
 * `center` + `maxRadius` acotan además la búsqueda a un círculo. Sin eso, la
 * banda del isotipo incluiría los pedazos del anillo que la cruzan por los
 * lados, y el recorte del favicon se llevaría medio marco.
 */
function inkBounds(image, region, { center = null, maxRadius = Infinity } = {}) {
  let left = image.width
  let right = -1
  let top = image.height
  let bottom = -1
  for (let y = region.top; y < region.bottom; y++) {
    for (let x = region.left; x < region.right; x++) {
      if (center && Math.hypot(x - center.x, y - center.y) > maxRadius) continue
      if (!isInk(image, x, y)) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) throw new Error('No se encontró contenido del logo en la región indicada')
  return { left, top, right: right + 1, bottom: bottom + 1, width: right + 1 - left, height: bottom + 1 - top }
}

/**
 * Detecta el escudo: el anillo completo, con su centro y sus radios.
 *
 * El centro sale de la caja de toda la tinta y el radio exterior, del punto
 * más lejano a ese centro. Se mide sobre el archivo en vez de escribir
 * coordenadas a mano, para que el recorte no dependa de un número mágico.
 */
function detectBadge(image) {
  const bounds = inkBounds(image, { left: 0, top: 0, right: image.width, bottom: image.height })
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2
  const limit = Math.max(image.width, image.height)

  let outer = 0
  for (let degrees = 0; degrees < 360; degrees += 1) {
    const angle = (degrees * Math.PI) / 180
    for (let radius = 0; radius < limit; radius += 0.5) {
      const x = Math.round(centerX + radius * Math.cos(angle))
      const y = Math.round(centerY + radius * Math.sin(angle))
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) break
      if (isInk(image, x, y)) outer = radius
    }
  }

  // Radio interior del anillo.
  //
  // No se puede buscar "el primer píxel blanco hacia adentro" sobre un solo
  // radio: la banda del anillo es finita y su borde exterior cae en un píxel
  // cualquiera, así que arrancar justo ahí da una falsa alarma. Se arma el
  // perfil radial de cobertura y se ubica la banda del anillo: el radio
  // exterior es el de máxima cobertura, y el interior es el primer radio hacia
  // adentro donde el anillo ya NO está.
  //
  // El umbral es bajo a propósito (5%, no 80%): el borde interior del anillo
  // está suavizado y su cobertura cae de 1 a 0 a lo largo de ~7 px. Si se
  // pidiera el borde sólido, quedaría una orla del anillo pegada al recorte
  // del isotipo.
  const ANGLES = 360
  const RING_MIN_COVERAGE = 0.05
  const coverage = radius => {
    let ink = 0
    for (let degrees = 0; degrees < ANGLES; degrees++) {
      const angle = (degrees * Math.PI) / 180
      const x = Math.round(centerX + radius * Math.cos(angle))
      const y = Math.round(centerY + radius * Math.sin(angle))
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue
      if (isInk(image, x, y)) ink++
    }
    return ink / ANGLES
  }

  let peakRadius = 0
  let peak = 0
  for (let radius = 1; radius <= Math.ceil(outer); radius++) {
    const value = coverage(radius)
    if (value > peak) {
      peak = value
      peakRadius = radius
    }
  }
  if (peak < 0.8) throw new Error('No se encontró el anillo circular del logo')

  let inner = 0
  for (let radius = peakRadius; radius > 0; radius--) {
    if (coverage(radius) < RING_MIN_COVERAGE) {
      inner = radius
      break
    }
  }
  if (inner <= 0) throw new Error('No se pudo detectar el radio interior del anillo')

  return { bounds, centerX, centerY, outerRadius: peakRadius, innerRadius: inner }
}

/**
 * Detecta el isotipo TD: la banda de contenido más alta que queda dentro del
 * anillo. Así se separa del escudo sin escribir la coordenada a mano, y sin
 * que la palabra "TecnoDesk" se cuele en el recorte del favicon.
 */
function detectIsotipo(image, badge) {
  const limit = badge.innerRadius - 3
  const bands = []
  let current = null
  for (let y = 0; y < image.height; y++) {
    let hasInk = false
    for (let x = 0; x < image.width; x++) {
      if (Math.hypot(x - badge.centerX, y - badge.centerY) > limit) continue
      if (isInk(image, x, y)) {
        hasInk = true
        break
      }
    }
    if (hasInk) {
      if (!current) current = { top: y, bottom: y }
      else current.bottom = y
    } else if (current) {
      bands.push(current)
      current = null
    }
  }
  if (current) bands.push(current)
  if (bands.length === 0) throw new Error('No se encontró el isotipo dentro del anillo')

  // El isotipo es la banda más alta: la palabra es más baja que el TD.
  const band = bands.reduce((tallest, item) => (item.bottom - item.top > tallest.bottom - tallest.top ? item : tallest))
  return inkBounds(
    image,
    { left: 0, top: band.top, right: image.width, bottom: band.bottom + 1 },
    { center: { x: badge.centerX, y: badge.centerY }, maxRadius: limit },
  )
}

/**
 * Convierte el blanco de fondo en transparencia.
 *
 * El logo oficial llega en RGB sobre blanco, así que para los iconos que
 * necesitan fondo transparente (los "any" y el favicon) hay que derivar el
 * alfa. Se usa el canal más oscuro como medida de separación: un píxel blanco
 * tiene los tres canales en 255, y el logo solo baja de 246 cuando ya es
 * tinta. El color NO se desmultiplica por alfa, para que el azul marino del
 * rayo y el degradado violeta conserven exactamente su valor original.
 */
function keyWhiteToAlpha(image) {
  const pixels = Buffer.from(image.pixels)
  for (let index = 0; index < pixels.length; index += 4) {
    const darkest = Math.min(pixels[index], pixels[index + 1], pixels[index + 2])
    let alpha
    if (darkest >= WHITE_KEY_START) alpha = 0
    else if (darkest <= WHITE_KEY_END) alpha = 255
    else alpha = Math.round(((WHITE_KEY_START - darkest) / (WHITE_KEY_START - WHITE_KEY_END)) * 255)
    pixels[index + 3] = alpha
  }
  return { width: image.width, height: image.height, pixels }
}

/**
 * Dibuja `region` del logo centrado en un lienzo cuadrado de `size` px.
 *
 * `contentRatio` es la fracción del ancho del lienzo que ocupa la región, y
 * sale de la regla de cada plataforma, no de un gusto:
 *
 * - purpose "any": el sistema apenas recorta, así que el escudo va casi al
 *   borde del lienzo, igual que en el logo original.
 * - purpose "maskable": Android recorta con la máscara que quiera y solo
 *   garantiza el círculo central del 80%. El contenido se escala por su
 *   DIAGONAL para que entre entero en ese círculo, sea cual sea la máscara.
 * - apple-touch-icon: iOS no admite transparencia (pinta de negro el alfa) y
 *   aplica su propia máscara, así que va con fondo blanco opaco.
 *
 * Cada píxel destino promedia los píxeles fuente que cubre realmente (filtro
 * de área) usando alfa premultiplicado: es el remuestreo correcto para
 * reducir, no deforma el logo y no inventa bordes.
 */
function renderIcon(source, region, { size, contentRatio, opaqueBackground = null }) {
  const drawWidth = size * contentRatio
  const drawHeight = drawWidth * (region.height / region.width)
  const offsetX = (size - drawWidth) / 2
  const offsetY = (size - drawHeight) / 2
  const scaleX = region.width / drawWidth
  const scaleY = region.height / drawHeight

  const out = Buffer.alloc(size * size * 4)
  if (opaqueBackground) {
    const [r, g, b] = opaqueBackground
    for (let i = 0; i < size * size; i++) {
      out[i * 4] = r
      out[i * 4 + 1] = g
      out[i * 4 + 2] = b
      out[i * 4 + 3] = 255
    }
  }

  const fromX = Math.max(0, Math.floor(offsetX))
  const toX = Math.min(size, Math.ceil(offsetX + drawWidth))
  const fromY = Math.max(0, Math.floor(offsetY))
  const toY = Math.min(size, Math.ceil(offsetY + drawHeight))

  // `sx`/`sy` son coordenadas ABSOLUTAS dentro de la imagen de origen (ya
  // incluyen el desplazamiento del recorte), así que los límites se toman
  // contra el tamaño de la imagen completa, no contra el del recorte.
  for (let dy = fromY; dy < toY; dy++) {
    // Rectángulo que el píxel destino cubre en el espacio del logo.
    const sy0 = region.top + (dy - offsetY) * scaleY
    const sy1 = sy0 + scaleY
    const firstRow = Math.max(0, Math.floor(sy0))
    const lastRow = Math.min(source.height, Math.ceil(sy1))
    for (let dx = fromX; dx < toX; dx++) {
      const sx0 = region.left + (dx - offsetX) * scaleX
      const sx1 = sx0 + scaleX
      const firstCol = Math.max(0, Math.floor(sx0))
      const lastCol = Math.min(source.width, Math.ceil(sx1))

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let area = 0
      for (let sy = firstRow; sy < lastRow; sy++) {
        const overlapY = Math.min(sy + 1, sy1) - Math.max(sy, sy0)
        if (overlapY <= 0) continue
        for (let sx = firstCol; sx < lastCol; sx++) {
          const overlapX = Math.min(sx + 1, sx1) - Math.max(sx, sx0)
          if (overlapX <= 0) continue
          const weight = overlapX * overlapY
          const index = (sy * source.width + sx) * 4
          const alpha = source.pixels[index + 3] / 255
          r += source.pixels[index] * alpha * weight
          g += source.pixels[index + 1] * alpha * weight
          b += source.pixels[index + 2] * alpha * weight
          a += alpha * weight
          area += weight
        }
      }

      if (area <= 0) continue
      const alpha = a / area
      if (alpha <= 0) continue
      const target = (dy * size + dx) * 4
      out[target] = Math.min(255, Math.round(r / a))
      out[target + 1] = Math.min(255, Math.round(g / a))
      out[target + 2] = Math.min(255, Math.round(b / a))
      out[target + 3] = opaqueBackground ? 255 : Math.min(255, Math.round(alpha * 255))
    }
  }

  return { width: size, height: size, pixels: out }
}

/** Contenedor ICO con entradas PNG (soportado por Windows Vista en adelante). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const directories = []
  const payloads = []
  for (const image of images) {
    const directory = Buffer.alloc(16)
    directory[0] = image.size >= 256 ? 0 : image.size
    directory[1] = image.size >= 256 ? 0 : image.size
    directory.writeUInt16LE(1, 4)
    directory.writeUInt16LE(32, 6)
    directory.writeUInt32LE(image.data.length, 8)
    directory.writeUInt32LE(offset, 12)
    directories.push(directory)
    payloads.push(image.data)
    offset += image.data.length
  }
  return Buffer.concat([header, ...directories, ...payloads])
}
// ---------------------------------------------------------------------------
// Tamaños de salida
// ---------------------------------------------------------------------------

/**
 * `contentRatio` NO es un número mágico: sale de la geometría real de cada
 * región del logo y de la regla de zona segura de cada plataforma.
 *
 * - purpose "any": el sistema apenas recorta, así que el escudo ocupa el 92% del
 *   lienzo y conserva el margen del logo original.
 * - purpose "maskable": Android puede recortar con círculo, cuadrado redondeado,
 *   squircle o cualquier máscara. La garantía es que el contenido entre en un
 *   círculo de diámetro 80% del icono, así que se escala por la DIAGONAL de la
 *   región. Se calcula, no se estima.
 * - apple-touch-icon: iOS aplica su propia máscara y NO admite transparencia
 *   (pinta de negro el canal alfa), por eso va con fondo blanco opaco y algo
 *   más de margen.
 * - favicon: a 16-48 px solo se lee el isotipo, y lo más posible.
 */
const ANY_CONTENT_RATIO = 0.92
const APPLE_CONTENT_RATIO = 0.86
const FAVICON_CONTENT_RATIO = 0.98
/** Diámetro de la zona segura de un icono maskable, como fracción del lado. */
const MASKABLE_SAFE_DIAMETER = 0.8

/** Mayor `contentRatio` con el que la diagonal de la región entra en la zona segura. */
function maskableContentRatio(region) {
  const diagonalFactor = Math.hypot(1, region.height / region.width)
  return MASKABLE_SAFE_DIAMETER / diagonalFactor
}

// ---------------------------------------------------------------------------

const decoded = decodePng(readFileSync(SOURCE))
if (decoded.sourceHadAlpha) {
  // Si algún día se entrega el logo con canal alfa, este script no debe
  // adivinar: el keyeo de blanco solo tiene sentido sobre una imagen opaca.
  throw new Error('El logo oficial ya trae canal alfa: revisá si sigue haciendo falta el keyeo de blanco')
}

const badge = detectBadge(decoded)
const isotipo = detectIsotipo(decoded, badge)
// Con alfa derivado, los iconos "any" y el favicon quedan con fondo
// transparente en vez de un cuadrado blanco.
const keyed = keyWhiteToAlpha(decoded)

console.log(`Fuente: ${SOURCE}`)
console.log(`  ${decoded.width}x${decoded.height} px, ${decoded.sourceHadAlpha ? 'con alfa' : 'RGB sin alfa'} (fondo blanco)`)
console.log(`  escudo: ${badge.bounds.width}x${badge.bounds.height} px, centro (${badge.centerX}, ${badge.centerY}), radio ${badge.outerRadius}`)
console.log(`  isotipo TD: ${isotipo.width}x${isotipo.height} px en (${isotipo.left}, ${isotipo.top})`)
console.log(`Zona segura maskable: diagonal dentro de ${(MASKABLE_SAFE_DIAMETER * 100).toFixed(0)}%`)

/**
 * Cada destino declara qué parte del logo usa:
 * - `badge`: el escudo completo (anillo + TD + "TecnoDesk").
 * - `isotipo`: solo el TD, que es lo legible a tamaños pequeños.
 */
const TARGETS = [
  { file: 'tecnodesk-192.png', size: 192, region: 'badge', contentRatio: ANY_CONTENT_RATIO },
  { file: 'tecnodesk-512.png', size: 512, region: 'badge', contentRatio: ANY_CONTENT_RATIO },
  // El maskable usa solo el TD: el anillo y la palabra se pierden bajo una
  // máscara agresiva, y el lienzo va blanco opaco porque Android recorta el
  // icono completo y no puede haber esquinas transparentes.
  { file: 'tecnodesk-maskable-192.png', size: 192, region: 'isotipo', contentRatio: maskableContentRatio(isotipo), opaqueBackground: OPAQUE_BACKGROUND },
  { file: 'tecnodesk-maskable-512.png', size: 512, region: 'isotipo', contentRatio: maskableContentRatio(isotipo), opaqueBackground: OPAQUE_BACKGROUND },
  { file: 'apple-touch-icon.png', size: 180, region: 'badge', contentRatio: APPLE_CONTENT_RATIO, opaqueBackground: OPAQUE_BACKGROUND },
  // PNG aparte para la pestaña del navegador: el .ico no se aplica bien en
  // temas oscuros de Chrome/Edge, que recortan el icono sin margen.
  { file: 'favicon-32.png', size: 32, region: 'isotipo', contentRatio: FAVICON_CONTENT_RATIO },
]
const FAVICON_SIZES = [16, 32, 48]

for (const target of TARGETS) {
  const region = target.region === 'badge' ? badge.bounds : isotipo
  const png = encodePng(
    renderIcon(keyed, region, {
      size: target.size,
      contentRatio: target.contentRatio,
      opaqueBackground: target.opaqueBackground ?? null,
    }),
  )
  writeFileSync(resolve(OUT_DIR, target.file), png)
  console.log(
    `  ${target.file} (${target.size}x${target.size}, ${target.region}, ratio ${target.contentRatio.toFixed(3)}, ${(png.length / 1024).toFixed(1)} kB)`,
  )
}

const faviconImages = FAVICON_SIZES.map(size => ({
  size,
  data: encodePng(renderIcon(keyed, isotipo, { size, contentRatio: FAVICON_CONTENT_RATIO, opaqueBackground: null })),
}))
writeFileSync(resolve(OUT_DIR, 'favicon.ico'), buildIco(faviconImages))
console.log(`  favicon.ico (${FAVICON_SIZES.join(' / ')}, isotipo, ratio ${FAVICON_CONTENT_RATIO})`)