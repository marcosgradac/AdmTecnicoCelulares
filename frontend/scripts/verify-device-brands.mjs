/**
 * Verificación automática del catálogo de marcas de dispositivos.
 * - Confirma que todos los imports de simple-icons existan en la versión instalada.
 * - Reporta cuántas marcas tiene el selector, cuáles tienen logo real y cuáles quedan en fallback.
 * - Revisa el orden del selector, los alias y que la opción "Otra" siga funcionando.
 * Uso: npm run verify:brands
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import * as simpleIcons from 'simple-icons'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'src', 'config', 'deviceBrands.ts')
const source = await readFile(configPath, 'utf8')

const failures = []
const check = (ok, message) => { if (!ok) failures.push(message) }

// 1) Que no haya imports inexistentes en simple-icons.
const imported = [...source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*'simple-icons'/g)]
  .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean))
const missingImports = imported.filter(name => !(name in simpleIcons))
check(imported.length > 0, 'No se detectaron imports desde simple-icons')
check(missingImports.length === 0, `Imports inexistentes en simple-icons: ${missingImports.join(', ')}`)

// 2) Ejecutar el catálogo real (transpila el TS en memoria y carga el módulo).
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const simpleIconsUrl = pathToFileURL(path.join(root, 'node_modules', 'simple-icons', 'index.mjs')).href
const moduleCode = javascript.replace(/(["'])simple-icons\1/g, JSON.stringify(simpleIconsUrl))
const catalog = await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString('base64')}`)

const { deviceBrandOptions, findKnownDeviceBrand, normalizeDeviceBrand, deviceBrandLogo, deviceBrandTone, OTHER_DEVICE_BRAND } = catalog
const brands = deviceBrandOptions.filter(option => option !== OTHER_DEVICE_BRAND)

// 3) "Otra" siempre al final, sin duplicados.
check(deviceBrandOptions.at(-1) === OTHER_DEVICE_BRAND, `La opción "${OTHER_DEVICE_BRAND}" debe ser la última del selector`)
check(new Set(deviceBrandOptions).size === deviceBrandOptions.length, 'Hay opciones duplicadas en el selector')

// 4) Las 13 marcas más usadas arriba y el resto en orden alfabético.
const mostUsed = ['Samsung', 'Motorola', 'Apple', 'Xiaomi', 'Redmi', 'POCO', 'TCL', 'Huawei', 'Honor', 'ZTE', 'Oppo', 'Realme', 'Vivo']
check(JSON.stringify(brands.slice(0, mostUsed.length)) === JSON.stringify(mostUsed), `El bloque de marcas más usadas no coincide con: ${mostUsed.join(', ')}`)
const rest = brands.slice(mostUsed.length)
check(JSON.stringify(rest) === JSON.stringify([...rest].sort((a, b) => a.localeCompare(b, 'es'))), 'El resto de las marcas no está en orden alfabético')

// 5) Logos reales vs. fallback del celular genérico.
const withLogo = brands.filter(brand => deviceBrandLogo(brand) !== null)
const fallback = brands.filter(brand => deviceBrandLogo(brand) === null)
for (const brand of withLogo) {
  const logo = deviceBrandLogo(brand)
  check(Boolean(logo?.path) && /^#[0-9A-F]{6}$/.test(logo?.color ?? ''), `Logo inválido para ${brand}`)
}

// 6) Normalización y alias.
const aliasCases = {
  vivo: 'Vivo', VIVO: 'Vivo', iqoo: 'iQOO', 'i qoo': 'iQOO', 'nothing phone': 'Nothing',
  'black berry': 'BlackBerry', blackberry: 'BlackBerry', htc: 'HTC', pixel: 'Google', lumia: 'Microsoft',
  iphone: 'Apple', ipad: 'Apple', galaxy: 'Samsung', moto: 'Motorola', xperia: 'Sony',
  'real me': 'Realme', 'one plus': 'OnePlus', zenfone: 'Asus', blade: 'ZTE', 'samsug': 'Samsung', mi: 'Xiaomi',
}
  let failed = false
  for (const caseItem of Object.entries(aliasCases)) {
    const [value, expected] = caseItem
    const actual = normalizeDeviceBrand(value)
    check(actual === expected, `El alias "${value}" debería normalizar a "${expected}" y dio "${actual}"`)
    if (actual !== expected) failed = true
  }
  console.log(`Alias principales verificados: ${Object.keys(aliasCases).length} casos, ${failed ? 'con fallos' : 'sin fallos'}`)
  check(!failed, 'Hay alias principales que no normalizan correctamente')

// 7) "Otra", marcas libres y valores vacíos.
check(deviceBrandLogo(OTHER_DEVICE_BRAND) === null, '"Otra" no debe tener logo')
check(findKnownDeviceBrand(OTHER_DEVICE_BRAND) === null, '"Otra" no debe entrar al índice de marcas')
check(deviceBrandLogo('') === null && deviceBrandLogo('Marca Inventada') === null, 'Valores vacíos o desconocidos deben usar el fallback')
check(deviceBrandTone('').background === deviceBrandTone('Marca Inventada').background, 'El tono genérico debe ser estable')
check(normalizeDeviceBrand('  Marca   Inventada ') === 'Marca Inventada', 'Las marcas libres deben conservarse tal cual')
check(normalizeDeviceBrand('   ') === '', 'Un valor en blanco debe quedar vacío')

// Reporte
console.log(`Marcas del selector: ${brands.length} (+ "${OTHER_DEVICE_BRAND}" = ${deviceBrandOptions.length} opciones)`)
console.log(`Con logo real (${withLogo.length}): ${withLogo.join(', ')}`)
console.log(`Con fallback SmartphoneRounded (${fallback.length}): ${fallback.join(', ')}`)
console.log(`Imports de simple-icons: ${imported.length} verificados, ${missingImports.length} inexistentes`)
console.log(failures.length ? `FALLOS=${failures.length}\n- ${failures.join('\n- ')}` : 'FALLOS=0')
process.exitCode = failures.length ? 1 : 0
