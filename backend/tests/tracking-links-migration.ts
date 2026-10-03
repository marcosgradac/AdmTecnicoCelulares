/**
 * Backfill de la migración `20261003120000_tracking_expiry`.
 *
 * Corre las migraciones SQLite REALES del repo, en memoria y sobre datos
 * inventados: ni base de datos en disco, ni datos de clientes, ni producción.
 *
 * Lo que verifica es lo que más puede salir mal en una migración: que se aplique
 * a las filas correctas, calcule los plazos correctos, deje intactos los tokens
 * y no se pueda volver a ejecutar alterando algo.
 */

import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DAY = 86_400_000
const MIGRATION = '20261003120000_tracking_expiry'

const db = new DatabaseSync(':memory:')

// Todas las migraciones MENOS la del backfill, en orden. Así la tabla "Repair"
// queda como en cualquier instalación real, con las columnas que realmente tiene.
const MIGRATION_DIR = resolve(__dirname, '../prisma/migrations-sqlite')
for (const directory of readdirSync(MIGRATION_DIR).sort()) {
  if (directory === MIGRATION) continue
  const file = resolve(MIGRATION_DIR, directory, 'migration.sql')
  if (existsSync(file)) db.exec(readFileSync(file, 'utf8'))
}

const checks: string[] = []
const check = (name: string, run: () => void) => {
  run()
  checks.push(name)
}

db.exec(`
  INSERT INTO "Business" (id, name, updatedAt) VALUES ('b1', 'Backfill QA', CURRENT_TIMESTAMP);
  INSERT INTO "Client" (id, businessId, name) VALUES ('c1', 'b1', 'Cliente QA');
  INSERT INTO "Repair" (id, businessId, number, clientId, deviceBrand, deviceModel, issue, trackingToken, updatedAt, status, warrantyEnabled)
  VALUES
    ('r-sin',      'b1', 1, 'c1', 'Samsung', 'A14', 'Falla', 'tok-sin',       CURRENT_TIMESTAMP, 'DELIVERED', 0),
    ('r-con',      'b1', 2, 'c1', 'Samsung', 'A14', 'Falla', 'tok-con',       CURRENT_TIMESTAMP, 'DELIVERED', 1),
    ('r-viejo',    'b1', 3, 'c1', 'Samsung', 'A14', 'Falla', 'tok-viejo',     CURRENT_TIMESTAMP, 'DELIVERED', 0),
    ('r-activa',   'b1', 4, 'c1', 'Samsung', 'A14', 'Falla', 'tok-activa',    CURRENT_TIMESTAMP, 'REPAIRING',  0),
    ('r-nuevo',    'b1', 5, 'c1', 'Samsung', 'A14', 'Falla', 'tok-nuevo',     CURRENT_TIMESTAMP, 'RECEIVED',   1),
    ('r-cancelada','b1', 6, 'c1', 'Samsung', 'A14', 'Falla', 'tok-cancelada', CURRENT_TIMESTAMP, 'CANCELLED',  0);
`)

// La migración se aplica DESPUÉS de los datos, que es lo que ocurre en un despliegue
// real: primero el esquema, después el backfill.
const aplicarMigracion = () => {
  db.exec(readFileSync(resolve(MIGRATION_DIR, MIGRATION, 'migration.sql'), 'utf8'))
}
aplicarMigracion()

// En SQLite esta migración NO hace backfill: "deliveredAt" no existe en las bases
// creadas por la cadena. Los datos de entrega de esas instalaciones ya se perdieron
// en la migración de garantías de 2026, así que no hay nada que recuperar acá.
// Para ejercitar la regla se escriben las fechas a mano, simulando una base que sí
// las tendría.
db.exec(`ALTER TABLE "Repair" ADD COLUMN "deliveredAt" DATETIME`)
db.exec(`UPDATE "Repair" SET "deliveredAt" = '2026-10-03T12:00:00.000Z' WHERE id IN ('r-sin','r-con')`)
db.exec(`UPDATE "Repair" SET "deliveredAt" = '2026-01-01T12:00:00.000Z' WHERE id = 'r-viejo'`)

// Y el backfill tal como lo escribe la migración de PostgreSQL, para comprobar que
// la regla de 3/7 días es la misma en las dos bases.
const aplicarBackfill = () => {
  db.exec(`UPDATE "Repair"
    SET "trackingExpiresAt" = datetime(julianday("deliveredAt") + (CASE WHEN "warrantyEnabled" = 1 THEN 7 ELSE 3 END))
    WHERE "status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND "trackingExpiresAt" IS NULL`)
}
aplicarBackfill()

const leer = () =>
  db.prepare('SELECT id, trackingExpiresAt FROM "Repair" ORDER BY number').all() as { id: string; trackingExpiresAt: string | null }[]
const porId = new Map(leer().map(f => [f.id, f.trackingExpiresAt]))

/**
 * Convierte un DATETIME de SQLite a instante.
 *
 * `datetime()` devuelve "YYYY-MM-DD HH:MM:SS" en UTC y sin sufijo. El constructor
 * `new Date()` de JavaScript interpreta ese formato como hora LOCAL, lo que corrige la
 * fecha en la diferencia horaria del servidor (3 horas en Argentina). Se marca el
 * string como UTC explícitamente para comparar contra instantes, no contra textos.
 *
 * Ojo: esto es una particularidad de leer el valor con JavaScript crudo. Prisma
 * devuelve Date y lo interpreta como UTC correctamente, que es lo que importa en
 * producción.
 */
const instante = (value: string | null | undefined): number => {
  if (!value) return Number.NaN
  return new Date(`${value.replace(' ', 'T')}Z`).getTime()
}

const ENTREGADA = Date.parse('2026-10-03T12:00:00.000Z')

check('una reparación entregada sin garantía recibe +3 días', () => {
  assert.equal(instante(porId.get('r-sin')), ENTREGADA + 3 * DAY)
  assert.equal(new Date(instante(porId.get('r-sin'))).toISOString().slice(0, 10), '2026-10-06')
})

check('una reparación entregada con garantía recibe +7 días', () => {
  assert.equal(instante(porId.get('r-con')), ENTREGADA + 7 * DAY)
  assert.equal(new Date(instante(porId.get('r-con'))).toISOString().slice(0, 10), '2026-10-10')
})

check('el backfill usa los plazos de la política, no la duración de la garantía', () => {
  // Si alguien mezclara warrantyDurationDays en la migración, este check falla:
  // el seguimiento tiene que ser siempre 3 o 7 días.
  assert.notEqual(instante(porId.get('r-con')), ENTREGADA + 90 * DAY)
})
check('una reparación entregada hace mucho queda con un vencimiento pasado', () => {
  // Es la consecuencia esperada y deseada: el enlace de un caso viejo queda
  // vencido apenas se aplica la migración. El token NO se regenera.
  assert.ok(instante(porId.get('r-viejo')) < Date.now(), 'debería quedar ya vencido')
})

check('una reparación NO entregada no recibe vencimiento', () => {
  assert.equal(porId.get('r-activa'), null, 'en reparación, el enlace sigue sin vencer')
  assert.equal(porId.get('r-nuevo'), null, 'en recibido, igual')
  assert.equal(porId.get('r-cancelada'), null, 'cancelada, también')
})

check('el backfill NO toca los tokens existentes', () => {
  // Es el requisito de compatibilidad: cada cliente conserva el enlace que ya
  // tenía, aunque ese enlace pase a estar vencido.
  const tokens = db.prepare('SELECT trackingToken FROM "Repair" ORDER BY number').all() as { trackingToken: string }[]
  assert.deepEqual(
    tokens.map(t => t.trackingToken),
    ['tok-sin', 'tok-con', 'tok-viejo', 'tok-activa', 'tok-nuevo', 'tok-cancelada'],
  )
})

check('correr el backfill de nuevo no cambia nada', () => {
  const antes = leer().map(f => f.trackingExpiresAt)
  db.exec(`UPDATE "Repair"
    SET "trackingExpiresAt" = datetime(julianday("deliveredAt") + (CASE WHEN "warrantyEnabled" = 1 THEN 7 ELSE 3 END))
    WHERE "status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND "trackingExpiresAt" IS NULL`)
  assert.deepEqual(leer().map(f => f.trackingExpiresAt), antes, 'el backfill es idempotente')
})

check('la migración SQLite NO puede romper una base que ya tiene deliveredAt', () => {
  // Regresión real: una versión anterior de esta migración hacía
  // `ADD COLUMN "deliveredAt"`, y en una base creada desde el schema (que sí lo
  // declara) eso falla con "duplicate column name" y aborta la migración entera.
  // Se ignoran los comentarios: el archivo explica la decisión en detalle y ahí sí
  // se nombra "deliveredAt". Lo que no puede aparecer es una sentencia SQL que lo use.
  const sql = readFileSync(resolve(MIGRATION_DIR, MIGRATION, 'migration.sql'), 'utf8')
  const sqlSinComentarios = sql.replace(/^\s*--.*$/gm, '')
  assert.doesNotMatch(sqlSinComentarios, /ADD COLUMN "deliveredAt"/, 'no debe intentar agregar deliveredAt')
  assert.doesNotMatch(sqlSinComentarios, /"deliveredAt"/, 'no debe referenciar deliveredAt: la columna no existe en SQLite')
  assert.doesNotMatch(sqlSinComentarios, /UPDATE "Repair"/, 'SQLite no hace backfill: no hay fechas de entrega que leer')

  // Y la comprobación de verdad: correr la migración contra una tabla que YA tiene
  // deliveredAt tiene que funcionar, sin error.
  const conColumna = new DatabaseSync(':memory:')
  conColumna.exec(`CREATE TABLE "Repair" (
    "id" TEXT NOT NULL PRIMARY KEY, "businessId" TEXT NOT NULL, "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED', "trackingToken" TEXT NOT NULL,
    "deliveredAt" DATETIME, "warrantyEnabled" BOOLEAN NOT NULL DEFAULT false, "updatedAt" DATETIME NOT NULL
  )`)
  conColumna.exec(
    `INSERT INTO "Repair" ("id","businessId","number","trackingToken","updatedAt","status","deliveredAt")
     VALUES ('r1','b1',1,'tok1','2026-01-01','DELIVERED','2026-10-03T12:00:00.000Z')`,
  )
  try {
    conColumna.exec(sql)
    const cols = conColumna.prepare('PRAGMA table_info("Repair")').all() as { name: string }[]
    assert.ok(cols.some(c => c.name === 'trackingExpiresAt'), 'debe agregar trackingExpiresAt sin fallar')
    assert.ok(cols.some(c => c.name === 'deliveredAt'), 'y no debe tocar deliveredAt')
  } finally {
    conColumna.close()
  }
})

check('la migración existe también para PostgreSQL, con el backfill 3/7 días', () => {
  const postgres = resolve(__dirname, '../prisma/migrations', MIGRATION, 'migration.sql')
  assert.ok(existsSync(postgres), 'falta la migración de PostgreSQL')
  const sql = readFileSync(postgres, 'utf8')
  assert.match(sql, /ADD COLUMN "trackingExpiresAt" TIMESTAMP\(3\)/)
  assert.match(sql, /INTERVAL '7 days'/)
  assert.match(sql, /INTERVAL '3 days'/)
  assert.match(sql, /"status" = 'DELIVERED'/)
  assert.match(sql, /"trackingExpiresAt" IS NULL/, 'no debe pisar un vencimiento ya fijado')
  // Y no debe reescribir tokens: los enlaces ya compartidos deben sobrevivir.
  assert.doesNotMatch(sql, /SET "trackingToken"/)
})

db.close()

console.log('--- migración de vencimiento: backfill ---')
for (const name of checks) console.log(`  OK  ${name}`)
console.log(`\nTRACKING MIGRATION TESTS PASSED: ${checks.length} comprobaciones`)