# Seguridad 9B — preparación del primer backup real

Estado: implementación de preparación; validación ficticia y revisión independiente.
Base confirmada: `333c370ac7f45dff33ec314daf4ac397328740a4`.
No se conectó a Supabase ni se solicitaron credenciales productivas.
Exportación real, claves productivas, tareas automáticas y despliegues siguen sin activar.

## Alcance y alternativas

La autorización comprende desarrollo y pruebas ficticias, un único PR en borrador
en `codex/security-9b-supabase-backup-preparation`; no merge ni producción.
La restauración conserva las guardas locales de 9A y nunca admite un destino remoto.

Alternativas evaluadas:

1. Aumentar el buffer actual: sencillo, pero el consumo continúa creciendo con el
   dump y no resuelve el requisito de streaming. Descartado.
2. Un único flujo AES-GCM: poco código, pero no autentica los bytes hasta su final.
   Requiere una primera pasada completa antes de restaurar y controles adicionales
   si el archivo cambia durante la segunda. No elegido para el formato nuevo.
3. **Formato versionado con bloques AES-256-GCM y manifiesto autenticado**: memoria
   acotada, autenticación de cada bloque antes de entregarlo y verificación completa
   previa a cualquier restauración. Recomendado; exige pruebas del envelope y una
   revisión independiente específica. Usa los algoritmos estándar de Node/OpenSSL.

## Inventario actual, por lectura de repositorio

- 26 modelos Prisma y 36 migraciones SQL; datasource PostgreSQL por DATABASE_URL.
- 9A produce custom archive en RAM: límite 128 MiB, timeout 120 segundos, marcador
  manifest final, AES-GCM/AAD y checksums; operaciones locales rechazan remotos.
- Los nuevos comandos de backup no son hooks de instalación, build ni arranque.
- `start-production.cjs` ejecuta migrate deploy antes del servidor. La validación
  de recuperación debe importar la aplicación directamente, sin ese launcher.
- `Business.logoUrl` y `RepairPhoto.url` contienen referencias o data URLs: sólo
  las bytes almacenadas en la fila están incluidas. URLs no respaldan archivos.
- `Device.unlockCodeEncrypted` necesita la clave original de aplicación aparte.
- No se encontró integración de Storage que permita afirmar que objetos externos
  estén cubiertos. Storage, adjuntos externos, secretos y configuración de servicios
  requieren inventario separado autorizado. No se verificó su estado productivo.
- Auth/JWT, permisos, CORS, Origin Auth, rate limiting y CSP no cambian.

## Separación de interfaces

Mantener `cli.mjs`, `safety.mjs` y el comportamiento local 9A. Agregar una interfaz
separada de exportación y un motor de streaming. La validación del destino usa
`validateLocalConfig`, `connectLocal` y `assertEmpty` existentes, antes de escribir.

La política remota entregada estará `enabled: false`, con allowlist vacía.
No existe fallback a DATABASE_URL, dotenv, PGHOST, PGSERVICE ni otros valores
heredados. Tampoco flags force/unsafe/skip-safety. Antes de abrir red se requiere
una política privada explícita para un único proyecto/endpoint/modo/base/rol/schemas.
Activar esa política para datos reales requiere autorización independiente.
CI sólo usa endpoints simulados y no recibe esa política productiva.

Campos de origen: projectRef, host, port, database, user, passwordFile,
mode (`direct` o `session`), caFile y schemas. No URL de conexión ni parámetros
arbitrarios. Password/config/policy/key fuera de Git, con permisos privados;
valores sensibles nunca en argv, stderr mostrado, manifiestos ni respuestas.

Validación implementada:

- Proyecto exactamente autorizado; directo `db.<projectRef>.supabase.co:5432`.
- Session pooler: hostname exacto previamente aprobado del Dashboard, puerto 5432
  y usuario con sufijo del proyecto. No adivinar el hostname por región.
- Base exacta aprobada y rol limitado. Rechazar transaction pooler 6543, comodines,
  URLs, múltiples hosts y campos extra.
- Resolver sólo el endpoint autorizado; fijar la dirección para el hijo conservando
  hostname para TLS. Rechazar direcciones locales/privadas para la interfaz real.
- libpq `verify-full`, CA explícita y TLS mínimo 1.2; sin downgrade a require/disable.
- Comprobación efectiva de base, usuario, versión mayor 17 y TLS de la sesión.
  La identidad del proyecto se basa además en host/certificado/ruta del pooler;
  PostgreSQL no proporciona por sí solo una prueba universal de Supabase Project Ref.
- Preferir conexión directa; session sólo cuando IPv6 no esté disponible y se haya
  probado su compatibilidad. Ninguna de estas comprobaciones contacta producción
  durante esta preparación.
- Dump limitado a `public`, donde están los modelos
  de TecnoDesk. No afirmar cobertura de auth/storage/realtime ni otros internos.
  Dependencias de extensiones/funciones/roles externos pueden bloquear recuperación.
  El alcance definitivo se aprueba antes del primer respaldo real.

## Streaming, autenticidad y publicación

Nuevo envelope `TDBACK02`; V1 conserva sus herramientas y recuperación existentes.
El nuevo lector reconoce V1 y delega al lector 9A, con su límite original documentado.

- `pg_dump custom` -> bloques plaintext de hasta 1 MiB -> AES-256-GCM -> archivo
  privado exclusivo. Backpressure; no buffer de toda la base ni plaintext en disco.
- Clave raíz raw 32 bytes. Salt aleatorio por backup y HKDF-SHA256 con etiquetas
  diferentes para clave de cifrado y clave HMAC del manifiesto. Nonce de 12 bytes
  formado por contador por bloque bajo esa clave derivada única.
- AAD incluye versión, identidad del bundle, salt, índice y longitud. Cada bloque
  tiene tag GCM de 16 bytes. Reordenar, duplicar o manipular bloques debe fallar.
- SHA-256 incremental de plaintext y envelope cifrado; manifiesto pequeño con
  versión, UTC, tamaños, checksums, cantidad de bloques, versión PostgreSQL, commit,
  estado de estructura y `restoreTest: not-tested`. HMAC-SHA256 autentica todos los
  campos del manifiesto. Ningún dato de clientes ni identificación del rol/origen.
- El manifiesto es el marcador final: sólo después de salida cero del dump, flujo
  terminado, límites cumplidos, autenticidad y catálogo pg_restore validados.
- Archivos wx/0600 y directorios privados; rechazar symlinks/junctions/ancestros.
  Cerrar/fsync archivos antes del marcador y verificar los checksums tras copiar.
  No prometer supervivencia absoluta a pérdida de energía en cualquier filesystem.
- Timeout predeterminado 15 minutos, configurable de 1 ms a 60 minutos (los límites
  pequeños permiten probar cancelación); límite inicial
  4 GiB, configurable hasta 64 GiB. Se ajustarán tras pruebas y recursos medidos;
  no son una estimación del tamaño real. Lock wait máximo 10 segundos.
- Fallos/cancelaciones matan sólo el proceso hijo propio, esperan su cierre y
  retiran exclusivamente el bundle incompleto creado por la operación.

## Restauración

1. Abrir archivos privados y verificar manifiesto, totalidad del envelope, todos
   los tags, checksums, bloques, tamaños y EOF. No enviar SQL en esta pasada.
2. Validar catálogo custom y verificar destino local, versión y vacío.
3. Segunda lectura desde handles propios; autenticar cada bloque antes de pasarlo
   a pg_restore. Rechazar cambio de identidad/estado del archivo y nueva corrupción.
4. No cerrar normalmente stdin hasta comprobar footer/EOF, contador y hashes.
   Errores o cancelaciones interrumpen el hijo y esperan rollback.
5. pg_restore sólo genera SQL hacia un pipe; `psql -X --single-transaction
   --set ON_ERROR_STOP=1 --file=-` controla el commit. EOF de ese pipe depende de
   autenticación completa, archivo sin cambios y salida cero de pg_restore.
   Un dump filtrado por schema crea `public`: `--clean --if-exists` se permite
   exclusivamente después de verificar local/disposable/effective/empty y dentro
   de esa transacción. Un destino con datos, enum, función u otro schema se rechaza.
   No hay reset, DROP DATABASE ni TRUNCATE ni opción de omitir las guardas.
6. Comparación de datos independiente obligatoria; no convertir estructura válida
   en una declaración falsa de recuperación. No iniciar migraciones del backend.

Límite de amenaza: procesos del mismo usuario/administrador, binarios comprometidos,
swap, crash dumps y SQL de archivos provenientes de fuentes no confiables. Las ACL
y handles reducen errores; no garantizan aislamiento frente a un administrador.

## Ensayo ficticio y criterios verificables

Crear cluster PostgreSQL 17 propio en TEMP, sin servicio permanente, dos talleres
y fixtures de todos los modelos de 9A. Transporte TLS con CA/certificados de ensayo.
El mapeo a loopback pertenece exclusivamente a utilidades de tests, no a flags ni
excepciones productivas. No modificar hosts/DNS del equipo para simular Supabase.

Probar origen permitido y rechazo previo de host/proyecto/modo incorrectos, TLS
con CA equivocada y hostname incorrecto, herencia productiva, permisos insuficientes,
timeout, interrupción real del dump, cancelación intermedia, ENOSPC/EACCES simulados,
clave errónea, manipulación de manifiesto/bloques, truncamiento y rutas con enlaces.

Un fixture adicional de carga, sólo en la base desechable, debe generar un custom
archive mayor de 128 MiB con datos incomprimibles. Medir tamaños, duración y memoria
sin imprimir filas; no confundir tamaño del DB con tamaño del archive comprimido.
Comparar filas/IDs/importes/fechas/FKs/constraints/índices/secuencias/migraciones y
digest del payload. Probar API restaurada con credenciales ficticias de 9A.
Probar restauración rechazada en cualquier remoto y en destinos locales no vacíos.
Revalidar V1 y recuperar una copia V2 desde un segundo directorio privado.

Ejecutar tests 9A/9B, types/builds y regresiones pertinentes 4–8. CI sólo cluster
desechable y certificados/claves ficticios, sin secretos ni artefactos de backups.
Revisión independiente antes de PR final; resolver Critical/Important demostrados.

## Custodia, retención y automatización futura

No generar clave real ahora. El operador la generará fuera del chat/repositorio,
con permisos privados. La clave y su segunda copia permanecen separadas de backups;
guardar claves antiguas por ID de custodia para conservar capacidad tras rotación.
Perder la clave impide recuperar el backup. Probar la copia de clave con datos
ficticios y, tras autorización, con un restore aislado del respaldo real.

Retención 7/4/3 continúa dry-run, sin eliminar archivos automáticamente. Propuesta
3-2-1: copia cifrada local, unidad externa desconectada y segunda ubicación física.
Verificar la segunda copia completa con clave y recuperación aislada; checksum
de ciphertext solo no demuestra que pueda recuperarse.

Recomendación provisional: equipo propio existente que permanezca encendido y
unidad externa rotada. No requiere contratar servicios, pero tiene costo de energía,
mantenimiento y posible hardware si no existe. Windows Scheduler en notebook
apagada no ejecuta; wake-to-run puede despertar suspensión, no garantiza arranque
desde apagado. Reintentos, última ejecución exitosa, alerta por omisión y ensayos
periódicos son diseño futuro, no tareas activadas.

GitHub Actions alojado puede ejecutar con notebook apagada. La alternativa gratuita
futura es un job programado en repositorio privado, permisos mínimos y entorno
protegido: instalar PG17, construir los archivos privados desde secretos fuera de
argv/logs, exportar con esta interfaz, verificar, guardar únicamente ciphertext y
manifiesto en un destino off-site aprobado y destruir los archivos privados del
runner. La clave de descifrado debe tener copia offline independiente; no colocar
datos, claves ni credenciales en artefactos públicos. Un job de CI ficticio no
habilita un job de producción. Nunca ejecutar datos reales desde PRs/forks.

[GitHub Free](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
incluye 2.000 minutos mensuales y 500 MB de artefactos privados, compartidos con
otros jobs. Ejemplo de planificación: 5 minutos diarios son unos 150 al mes;
esto es una estimación, no una medición de producción. 7 copias de un archivo de
144 MiB ya exceden 500 MB: usar almacenamiento off-site ya disponible o reducir
retención sólo después de aprobarlo, jamás eliminar automáticamente con este PR.
No configurar exceso pago. Los schedules pueden demorarse u omitirse bajo carga:
comprobar última ejecución exitosa desde un monitor independiente, reintentar con
timeouts y hacer recuperación periódica, antes de prometer un RPO.
[Límites del scheduler](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Un equipo propio/NAS existente siempre encendido ofrece mayor control y evita
confiar credenciales/datos a runners de terceros; requiere energía y mantenimiento.
Un runner propio también depende de ese equipo, pero no de la notebook. Si no hay
ese hardware, GitHub alojado es la alternativa concreta anterior, condicionada a
aprobación de custodia, cuotas y destino. Ninguna opción está activada aquí.
No se promete que un free tier externo tenga fiabilidad o capacidad garantizadas.

## Primer respaldo real: autorización posterior

### Operación preparada, todavía sin autorización para datos reales

`npm run backup:stream -- <comando> <flags>` ofrece `create-local`,
`export-authorized`, `verify`, `restore` y `catalog`. Los comandos antiguos
`backup:local` y `test:backup` conservan el comportamiento 9A.

Config de ejemplo exclusivamente ficticia, guardada en archivo privado fuera de Git:

```json
{
  "projectRef": "abcdefghijklmnopqrst",
  "host": "db.abcdefghijklmnopqrst.supabase.co",
  "port": 5432,
  "database": "postgres",
  "user": "backup_reader",
  "mode": "direct",
  "schemas": ["public"],
  "passwordFile": "/private/source-password",
  "caFile": "/private/source-ca.pem"
}
```

La política privada tiene exactamente `enabled`, `projectRef` y `origins`;
`origins` debe contener un solo objeto con host/port/database/user/mode/schemas
idénticos. La plantilla del repositorio está desactivada y su lista vacía: no es
una autorización. Configurar una política habilitada para producción será un
paso explícito y supervisado posterior. Usar rutas absolutas propias de Windows
o Unix, permisos sólo del propietario/SYSTEM/Administradores, clave raw de 32
bytes y PostgreSQL 17; no pasar password ni clave en argumentos ni URLs.

Ejemplo de forma del comando futuro, **no ejecutado ni aprobado para producción**:

```text
node --max-old-space-size=32 scripts/backup/stream-cli.mjs export-authorized
  --config <archivo-privado-origen> --policy <archivo-privado-autorizacion>
  --key-file <archivo-privado-clave> --bin <directorio-absoluto-pg17>
  --output <directorio-privado> --commit <SHA-revisado>
```

`verify --bundle <bundle-privado> --key-file ... --bin ...` autentica y valida
estructura; no afirma recuperación de datos. `restore` agrega un `--config`
local `tecnodesk_backup_test_*`, vacío, disposable y verificado. `catalog` agrega
`--output` y muestra retención dry-run; no elimina. Todos los comandos gestionan
SIGINT/SIGTERM, límites y mensajes categóricos, sin imprimir SQL/stderr de PG.

Confirmar proyecto `zxdrxobjoalzqukzzmko`, endpoint/modo/TLS, rol de lectura suficiente
(no superuser/BYPASSRLS concedidos como atajo), schemas y dependencias, estimación de
volumen, espacio/cuotas/impacto, destino privado, custodia de clave, segunda copia,
ventana/timeouts/aborto, destino aislado y comparación completa. RLS puede impedir
exportación de filas con un rol ordinario; no tratar un dump parcial como completo.

La aprobación debe identificar el SHA revisado, origen y schemas exactos, ventana,
destinos cifrados/custodia, segunda copia y restore local desechable. Sin contraseña
en chat. Ninguna parte de ese procedimiento se ejecuta sobre producción en este PR.
Seguridad 9 completa permanece pendiente del respaldo real y recuperación aprobados.

## Evidencia de implementación y auditoría

Ensayo local Windows / Node 24.21 / PostgreSQL 17.11: base propia en loopback,
certificados y claves ficticios, 26 modelos reales, dos talleres y todas las
migraciones. No se contactó Supabase ni se leyó ningún dato/clave de producción.

| Métrica | Exportación | Restauración |
| --- | ---: | ---: |
| Archive plaintext custom | 172.290.378 bytes (164,3 MiB) | mismo archivo |
| Envelope cifrado | 172.294.942 bytes | mismo archivo |
| Tiempo | 21.936 ms | 8.828 ms |
| RSS inicial Node | 50.810.880 bytes | 50.761.728 bytes |
| RSS pico Node | 76.713.984 bytes (73,2 MiB) | 72.740.864 bytes (69,4 MiB) |
| Memoria externa pico Node | 22.774.026 bytes | 21.602.804 bytes |

Workers independientes, heap máximo 32 MiB; muestreo cada 10 ms más máximo RSS
del sistema (`resourceUsage`). Las medidas son del proceso Node, no incluyen el
servidor PostgreSQL ni los procesos nativos pg_dump/pg_restore/psql. Los pipes
mantienen backpressure; el archive completo no reside en Node ni en un archivo
plaintext. Se agregó un payload aleatorio de 144 MiB que se compara por digest
completo tras recuperar, además de todas las filas, restricciones e índices.
Duraciones/RSS varían según equipo y CI; no son cifras de Supabase real.

Las pruebas verifican tags, claves distintas por archivo, HMAC, corrupción de
payload/tag/EOF/manifiesto, orden, duplicación, truncamiento, copia independiente,
destino remoto/no vacío, archivos compartidos/en Git/enlaces, límite, timeout,
ENOSPC/EACCES, cancelación durante publicación, interrupción real de pg_dump,
fallo del footer con COPY activo y rollback completo, y cancelación SQL activa.
CA válida ajena, hostname errado y servidor que rechaza TLS fallan sin downgrade.
El session pooler se simula con traducción de transporte de tests; **no** se
afirma compatibilidad real con Supavisor, su TLS interno ni el proyecto real.

V1 `TDBACK01`: exportación 9A, verificación y recuperación por interfaz nueva,
comparación exacta y 29 grupos originales 9A aprobados. Su límite de 128 MiB
continúa intacto; V2 no obliga a reescribir ni recifrar respaldos anteriores.

Regresiones locales: typecheck/build backend y frontend; Origin Auth/IP/health/OG;
355 comprobaciones de aislamiento, 289 de roles, 90 de sesiones; stored XSS;
21 checks UI de sesiones, 17 de borrado, nueve grupos de hardening y CSP compilada;
contratos frontend/PWA; reportes, privacidad financiera, equipo, billing/planes,
pagos, garantías, stock, ventas, concurrencia y perfiles en bases desechables.
CI incluye 9A y 9B sobre PG17 local, sin secretos ni uploads de backups.

Revisión independiente: se reprodujo un fallo importante de commit prematuro
en pg_restore (terminaba exit 0 sin EOF stdin). Se corrigió con SQL streaming
gobernado por psql; el fallo después del último bloque con COPY activo y la
cancelación real dejan la base vacía. También se corrigió cancelación durante
publicación y cierre de handles ante límites inválidos. La revisión final no
encontró problemas críticos/importantes demostrados pendientes.

Antes del ensayo real siguen pendientes permisos/RLS efectivos, CA/endpoint y
versión reales, dependencias fuera de public (roles/extensiones), volumen/impacto,
custodia y destino off-site. Datos referenciados externamente no están incluidos.
Las pruebas ficticias no autorizan ni sustituyen esa comprobación supervisada.

## Fuentes primarias revisadas

- [Conexiones Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [TLS Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Backups y límites Free/Storage](https://supabase.com/docs/guides/platform/backups)
- [Cambios PostgreSQL 17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
- [libpq verify-full](https://www.postgresql.org/docs/17/libpq-ssl.html)
- [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html)
- [pg_restore 17](https://www.postgresql.org/docs/17/app-pgrestore.html)
- [Windows wake-to-run](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-waketorun)
- [Cuotas GitHub Actions](https://docs.github.com/en/actions/reference/limits)
