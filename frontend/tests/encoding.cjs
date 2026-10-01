// Falla si algún texto del proyecto quedó con la codificación rota (mojibake): UTF-8
// interpretado como otra cosa (acentos dobles, punto medio roto, caracter de reemplazo).
// No depende del navegador. Uso: npm run test:encoding
//
// Nota: este archivo no contiene literalmente los caracteres corruptos (solo escapes
// \uXXXX), porque de lo contrario el propio detector se marcaría a sí mismo.
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const TARGETS = ['src', 'tests', '../backend/src', '../backend/tests']
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.html', '.css'])
const IGNORED = new Set(['node_modules', 'dist', 'build', 'coverage', '.git'])

// Secuencias típicas de UTF-8 leído como Windows-1252/Latin-1.
const PATTERNS = [
  { name: 'acentos con doble codificacion', regex: /[\u00C3\u00C2]/ },
  { name: 'caracter de reemplazo U+FFFD', regex: /\uFFFD/ },
  // Comillas, guiones y signos rotos que empiezan con A-circunflejo.
  { name: 'signos rotos con A-circunflejo', regex: /\u00E2[\u20AC\u201A\u0192\u2030\u0153\u017D\u2018\u201C\u2019\u201E\u2020\u2021\u2022\u2026\u2013\u2014\u02DC\u2122\u0161\u2039\u203A\u0080]/ },
  { name: 'A-circunflejo suelto', regex: /\u00E2(?=[^\s])/ },
]

function collectFiles(dir, files = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return files }
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, files)
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full)
  }
  return files
}

const findings = []
let scanned = 0
for (const target of TARGETS) {
  for (const file of collectFiles(path.resolve(ROOT, target))) {
    scanned++
    // Leido como UTF-8: un archivo bien guardado no debe perder caracteres al decodificar.
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    lines.forEach((text, index) => {
      for (const { name, regex } of PATTERNS) {
        if (regex.test(text)) findings.push({ file, line: index + 1, pattern: name, sample: text.trim().slice(0, 120) })
      }
    })
  }
}

if (findings.length) {
  console.error(`MOJIBAKE DETECTADO: ${findings.length} texto(s) con encoding roto`)
  for (const finding of findings) {
    console.error(`  ${path.relative(ROOT, finding.file)}:${finding.line} [${finding.pattern}]`)
    console.error(`    ${finding.sample}`)
  }
  console.error('Corrige los textos a UTF-8 valido; no conviertas el proyecto entero de forma masiva.')
  process.exit(1)
}
console.log(`ENCODING PASSED: ${scanned} archivo(s) revisados en frontend/src, frontend/tests, backend/src y backend/tests, sin mojibake`)
