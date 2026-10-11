# Seguridad 9 — preparación de backups PostgreSQL

Estado: preparación reproducible exclusivamente local. No se accedió a Supabase,
Render, Vercel ni Cloudflare; no hay backup, clave, automatización ni recuperación
productiva en este cambio. No fusionar ni desplegar sin aprobación independiente.

## Cobertura y límites

La referencia del código es main `cc9a5ece3af40893941560d0732d552ed35448c0`.
La base de TecnoDesk usa PostgreSQL mediante Prisma: 26 modelos y 36 migraciones
SQL. El ensayo aplica estas migraciones únicamente en una base nueva propia.
`pg_dump --format=custom` produce un snapshot consistente de una base, incluyendo
tablas, datos, índices, restricciones, secuencias, funciones y enums accesibles al
usuario. El dump no reemplaza un backup del servidor completo.

La cobertura ficticia incluye dos talleres, propietarios, técnicos, clientes,
dispositivos, reparaciones, historial, fotos referenciadas, garantías y gastos,
pagos y caja, stock y movimientos de compra, repuestos, categorías, productos,
ventas y líneas, equipos de reventa, planes, suscripciones, solicitudes de pago,
configuración de facturación, notas de plataforma y auditoría. También usuarios,
hashes de contraseña de prueba, versiones de tokens y capacidades de recuperación.
La lista de fixtures se contrasta automáticamente con **todos** los modelos del
schema y del cliente Prisma; ninguno puede quedar vacío ni omitirse.

No se respaldan roles globales, propietarios ni ACL (`--no-owner --no-acl`), secretos
de aplicación, configuración de infraestructura o DNS. Una URL de `RepairPhoto`
no copia el archivo externo. Un logo almacenado como data URL sí forma parte de la
fila. La revisión del repositorio no encontró una integración de Storage que
permita afirmar cobertura de objetos: si existen objetos externos/Supabase Storage,
requieren inventario y respaldo independiente autorizado. La documentación oficial
advierte que los backups de base de datos no incluyen los objetos de Storage.
Los valores cifrados como `Device.unlockCodeEncrypted` necesitan recuperar también
la clave original de aplicación mediante un procedimiento de secretos separado;
los backups no la incluyen. El ensayo compara ese valor byte por byte, sin afirmar
que una clave ficticia pueda descifrarlo.

## Arquitectura y herramientas

Implementación independiente en `backend/scripts/backup/`: Node 22 o superior,
`node:crypto` (OpenSSL), `pg` ya existente, y herramientas oficiales PostgreSQL 17
`pg_dump`, `pg_restore`, `psql`. Sin dependencias criptográficas nuevas.

1. Configuración JSON explícita con seis campos; no dotenv, no URL heredada.
2. Rechazo previo de todo host remoto, pooler 6543, parámetros extra, nombre no
   autorizado o destino que no sea explícitamente desechable.
3. Conexión efectiva: dirección IPv4 loopback, puerto, base y versión 17 coinciden.
   Se utiliza `host(inet_server_addr())`, evitando confundir `127.0.0.1/32` con un
   host diferente sin relajar la guarda.
4. Herramientas cliente también versión mayor 17. Entorno de hijos por allowlist;
   no se propagan `DATABASE_URL`, `DIRECT_URL`, `PGSERVICE`, `PGOPTIONS`,
   `NODE_OPTIONS` ni otras credenciales heredadas. Contraseña por `PGPASSWORD`,
   nunca por argv. El dueño del proceso/administrador puede inspeccionar su entorno:
   esta solución no protege frente a un administrador del sistema comprometido.
5. Dump custom por pipe en memoria, límite **128 MiB**, timeout 120 segundos y
   bloqueo máximo de adquisición del dump 10 segundos. Sin archivo plaintext.
6. Verificación de firma `PGDMP` y catálogo de `pg_restore --list` antes de publicar.
7. AES-256-GCM con clave aleatoria de 32 bytes, nonce aleatorio de 12 bytes y tag de
   16 bytes. Es cifrado estándar de Node/OpenSSL; el envelope sólo añade `TDBACK01`
   como identificación. Metadata autenticada como AAD y SHA-256 del plaintext y ciphertext.
8. Carpeta exclusiva `backup-<UTC>-<UUID>` y archivos `wx`, sin sobrescritura.
   Se publica primero `archive.tdbackup` y luego `manifest.json` como marcador de
   finalización. Ante error se elimina sólo la carpeta nueva creada por la operación.
9. Restauración tras validar cifrado, checksum, estructura y destino vacío dos veces:
   `pg_restore --single-transaction --exit-on-error`, sin `--clean`, reset ni borrado
   de base. Fallos y cancelaciones cierran el hijo antes de informar el resultado.

El manifiesto contiene ID, UTC, versión PostgreSQL/cliente, formato, tamaño,
checksums, commit opcional y validación. **`restoreTest: not-tested` es deliberado**:
la integridad del archivo y la estructura no prueban recuperación de datos. El
ensayo separado demuestra recuperación y comparación íntegra; no falsifica el
manifiesto autenticado para convertir una verificación estructural en un restore.
`restore` devuelve `dataComparison: required`; el operador debe completar esa fase.
No hay nombres de clientes, correos, contraseñas, URLs de conexión ni datos
comerciales en los manifiestos o salidas de estas herramientas.

El CLI exige clave raw de exactamente 32 bytes fuera de **cualquier** repositorio
Git. En Unix exige dueño actual y permisos privados; en Windows inspecciona ACL y
rechaza permisos de lectura concedidos a identidades distintas del usuario actual,
SYSTEM y Administradores. También exige directorio de salida privado. Se rechazan
symlinks/junctions de archivos y ancestros. Esto reduce accidentes, pero no elimina
carreras frente a otro proceso del mismo usuario que cambie rutas entre validación
y apertura. Usar directorios exclusivos, discos cifrados y herramientas confiables.

La clave ficticia del ensayo existe sólo en memoria y temporalmente en su directorio
privado para probar el CLI; se borra al terminar. No se generó clave productiva.
Los buffers plaintext se sobrescriben al finalizar; Node/OS pueden conservar copias
internas o swap. Usar cifrado de disco, controles de acceso y evitar crash dumps.
No se promete borrado físico seguro en SSD ni que el snapshot incluya datos escritos
después de iniciarse. La publicación no hace fsync: una pérdida de energía puede
dejar archivos incompletos, que deberán fallar la siguiente verificación.

## Requisitos, Windows y Linux

Se verificó localmente PostgreSQL **17.11** con Node **24.21.0**. CI usa Node 22 y
PostgreSQL 17. No mezclar clientes 16/18 con este formato. Las extensiones y objetos
propios de Supabase deben ensayarse aparte antes de cualquier restore real; el
ensayo actual cubre el schema de TecnoDesk, no todos los schemas internos de Supabase.

Windows: descargar los binarios oficiales desde
[PostgreSQL Windows](https://www.postgresql.org/download/windows/) / EDB y extraerlos
sin instalar servicios. Definir `PG_BIN` apuntando a su `bin` para los tests. La
carpeta local `.security9-tools` es ignorada y no forma parte del PR. Ejecutar:

```powershell
Set-Location C:\ruta\AdmTecnicoCelulares\backend
$env:PG_BIN = 'C:\herramientas\postgresql17\bin'
npm run test:backup
```

El ensayo genera su propio cluster en TEMP, reservado en loopback, bases con sufijo
aleatorio y ACL exclusiva; lo detiene y limpia al terminar. Auth trust existe sólo
en ese cluster ficticio y no debe reutilizarse para datos reales. No inicia servicios
permanentes. Un fallo abrupto del proceso puede impedir `finally`: identificar el
directorio `tecnodesk-security9-*` y su `postmaster.opts`, confirmar que es el cluster
del ensayo y detener **sólo ese cluster** antes de limpiar. Nunca detener PostgreSQL
por nombre de proceso global ni borrar carpetas ajenas.

Linux/CI: instalar `postgresql-17` y `postgresql-client-17` mediante el
[repositorio oficial PGDG](https://www.postgresql.org/download/linux/ubuntu/).
`PG_BIN=/usr/lib/postgresql/17/bin npm run test:backup`. El job usa Ubuntu 24.04,
desactiva la creación automática de clusters del paquete y ejecuta `initdb` como
usuario no root. Sólo bases propias en TEMP y claves ficticias. No usa secretos
productivos, acceso a Supabase ni upload-artifact/cache de backups.

## Uso manual exclusivamente local

El ejemplo `local.config.example.json` es ficticio. Crear otro archivo privado
`backup.config.local.json` fuera de Git, con host loopback, puerto de prueba, base
`tecnodesk_backup_test_` seguida de 6–40 caracteres `[a-z0-9]`, usuario local,
contraseña ficticia y `disposable: true`. Preparar un directorio exclusivo privado
y una clave de ensayo raw 32 bytes fuera del repositorio. No pegar valores en la
consola ni usar una clave real para practicar. En Windows, retirar herencia y
conceder FullControl sólo al usuario actual, SYSTEM y Administradores; el CLI
rechaza la ruta si los permisos no son privados. En Unix: carpeta 0700, clave 0600.

Ejemplos (paths ficticios; nunca incluyen el contenido de la clave):

```powershell
npm run backup:local -- create --config C:\ensayo\backup.config.local.json --key-file C:\claves-ensayo\private.backup-key --bin C:\herramientas\postgresql17\bin --output C:\ensayo\backup-output
npm run backup:local -- verify --key-file C:\claves-ensayo\private.backup-key --bin C:\herramientas\postgresql17\bin --bundle C:\ensayo\backup-output\backup-ID-FICTICIO
npm run backup:local -- catalog --key-file C:\claves-ensayo\private.backup-key --bin C:\herramientas\postgresql17\bin --output C:\ensayo\backup-output
npm run backup:local -- restore --config C:\ensayo\destino.config.local.json --key-file C:\claves-ensayo\private.backup-key --bin C:\herramientas\postgresql17\bin --bundle C:\ensayo\backup-output\backup-ID-FICTICIO
```

`verify` y `catalog` no conectan a base de datos. `restore` sólo acepta base local
vacía; también rechaza enums, funciones, extensiones adicionales o schemas previos.
No reutilizar una base de desarrollo existente. Restaurar sólo archivos confiables:
un dump puede contener funciones/SQL que se ejecuten en el servidor aislado. El
cifrado autentica al poseedor de la clave, no vuelve seguro un dump desconocido.

## Retención y almacenamiento propuestos

`catalog` verifica autenticación/checksum/estructura de cada carpeta `backup-*`,
requiere que nombre e ID coincidan y falla si hay un bundle incompleto/manipulado.
No considera esa carpeta una versión válida ni la elimina. El catálogo determina
duplicados por checksum plaintext autenticado (no por ciphertext con nonce distinto).
No imprime filas, hashes de usuarios ni la clave.

La política conserva el más reciente de 7 días distintos, 4 semanas UTC que empiezan
el lunes y 3 meses distintos, usando la unión para evitar borrado accidental de
ejemplares semanales/mensuales. No garantiza 14 archivos diferentes: hay solapamiento.
`deleteAutomatically: false` siempre; sólo entrega IDs de candidatos. Si faltan
días/semanas, conserva versiones anteriores disponibles y **no** afirma que se haya
cumplido frecuencia/RPO. No hay comando de eliminación ni tarea recurrente.

Propuesta 3-2-1 sin contratar nada: copia local cifrada en disco protegido, copia
cifrada en unidad externa y una tercera copia cifrada fuera del equipo/ubicación
principal, preferentemente offline. Las tres deben verificarse; una unidad externa
siempre conectada no protege suficientemente contra ransomware. No está implementado
ni se subió nada a servicios externos. Separar la custodia y respaldo de la clave;
perderla impide recuperar. No almacenar clave junto al bundle ni asumir que BitLocker
sustituye cifrado de archivo. Capacidad orientativa: hasta 14 versiones retenidas,
copias adicionales y margen para crecimiento; medir tamaños reales posteriormente.

## Ensayo y fallos verificados

`npm run test:backup` ejecuta guards/crypto/retención, fallos previos a conexiones
remotas y recuperación completa PostgreSQL 17. Compara hashes de snapshots completos,
no sólo conteos: cada fila, ID, dinero entero, fecha, estado, JSON, hash de contraseña,
relación, restricción, índice y `_prisma_migrations`. Hay 27 tablas: 26 modelos y el
historial de migraciones. Una secuencia ficticia adicional demuestra que el próximo
valor continúa en 38 tras recuperar el valor 37. La API real se inicia contra la
base restaurada **sin `start-production.cjs`**, y verifica health, login del propietario
ficticio, clientes, reparaciones, caja, rechazo sin JWT y acceso cruzado 404.

Negativos cubiertos:

| Riesgo | Evidencia |
| --- | --- |
| Supabase/Render/remoto, localhost ambiguo, IPv6, pooler, nombre/flags incorrectos | Rechazo antes de conectar o escribir |
| DATABASE_URL/PGSERVICE/NODE_OPTIONS heredados | No se propagan al hijo; configuración explícita |
| Clientes PostgreSQL 16/18/no reconocidos | Rechazados; proceso exige servidor 17 |
| Vacío, truncado, corrupción, checksum, clave equivocada, AAD manipulado | Verify falla; no se restaura |
| Base con datos, enum o schema previo | Restore rechaza sin eliminar objetos |
| pg_dump sin permisos | Error controlado, sin bundle válido |
| pg_restore sin permisos | Transacción revertida; destino comprobado vacío |
| Conexión pg_dump interrumpida | Se termina sólo su backend local mientras espera un lock ficticio; origen intacto |
| Cancelación durante pg_restore | Se espera COPY en PgSleep de una función ficticia; aborta y confirma destino totalmente vacío |
| Cancelación previa, proceso fallido, timeout, exceso de tamaño | Fallo controlado y salida genérica |
| ENOSPC/EACCES | Inyección explícita de fallos de escritura; no publicación y sin tocar otros bundles |
| Catálogo, nombres y duplicados | Checksum autenticado, ID coincidente, reglas 7/4/3 con semanas/meses conocidas |

La falta de espacio/permisos de escritura se simula: no se llena un disco real. El
permiso PostgreSQL sí se ensaya realmente. La verificación de ACL es conservadora;
un ACL complejo puede rechazarse aun si hay denegaciones efectivas adicionales.

Medición Windows del ensayo completo final: backup cifrado
99.519 bytes, generación 281 ms, restore 824 ms, 29 grupos end-to-end aprobados.
Además pasan guards/crypto/retención y los rechazos previos a conexión. El tiempo
total incluye iniciar cluster, migraciones, fixtures y ataques de interrupción;
estas métricas de ~100 KB **no** predicen el tiempo o capacidad de una base real.

Regresiones previstas: Origin Auth, identidad cliente/rate limiting, health y
seguimiento con mocks; aislamiento completo 355 HTTP, roles 289 HTTP, JWT/sesiones
90 HTTP y stored XSS en PostgreSQL desechable; recuperación de contraseña,
suscripciones, caja, reparaciones y comercio; frontend sesiones/recuperación,
CSP Report-Only, PWA y contratos existentes. Typecheck/build de ambos proyectos.
Estas regresiones y ambos typecheck/build pasaron localmente. El navegador local se
ejecutó con `PLAYWRIGHT_BROWSER_CHANNEL=chrome`: el Chromium descargable no estaba
instalado. CI instala su Chromium. Se observaron los warnings preexistentes de tamaño
de chunks y `emitFile` en modo Vite serve, sin fallos de los grupos. El PR registra
también los resultados de ambos jobs CI.

## Supabase Free y primer backup real: requiere otra aprobación

Según [Supabase backups](https://supabase.com/docs/guides/platform/backups), no asumir
backup diario descargable administrado ni PITR en Free: preparar exportación propia
regular y copia externa. No se contrató ningún servicio. Elegir conexión directa o
session pooler compatible con `pg_dump`; no usar transaction pooler 6543. La conexión
directa puede requerir IPv6; consultar
[conexión oficial](https://supabase.com/docs/guides/database/connecting-to-postgres).
El [changelog PostgreSQL 17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
advierte incompatibilidades específicas de operadores/extensions; verificar contra
los objetos reales antes de declarar portátil un dump Supabase.

**Esta versión rechaza remotos también como origen de backup.** Es una barrera
intencional de esta fase, no un comando listo para ejecutar contra Supabase. Para
el primer backup real hará falta aprobación separada que identifique proyecto,
origen de sólo lectura, conexión, tamaño esperado, destino privado, custodia de
clave y segunda copia. Preparar una extensión revisada que autorice sólo ese origen
sin relajar ninguna guarda de restauración, y ensayar esos permisos/configuraciones
con un servidor ficticio antes de usarla. No eliminar las guardas como atajo.

Antes de ese primer ensayo real supervisado:

1. Inventariar schemas/extensions/objetos y archivos externos, con lectura autorizada.
2. Confirmar PG17, conexión, privilegios mínimos y ausencia de contraseña en argv/logs.
3. Medir tamaño y duración. El límite actual 128 MiB/120 s puede necesitar una solución
   streaming revisada; no aumentarlo sin evaluar memoria/cancelación/validación.
4. Generar entonces una clave real fuera de Git, guardarla en almacén privado y
   conservar copia de recuperación separada. No pasarla por chat/terminal/Actions.
5. Autorizar `pg_dump` readonly y almacenamiento/copia externa concreta; sin upload
   implícito. Verificar cifrado/checksums y comparar copia local/externa.
6. Autorizar un destino aislado de acceso exclusivo para el restore real. Que sea
   local no basta para proteger confidencialidad: ACL, disco cifrado y recursos.
7. Restaurar, comparar íntegramente y probar backend compatible sin escrituras reales
   ni migraciones. Sólo después considerar el backup recuperable y medir RTO real.

La Seguridad 9 completa queda pendiente de esos pasos. Esta fase no garantiza
portabilidad total de Supabase, continuidad 24/7 ni recuperación productiva.

## Automatización Windows gratuita: diseño, no activación

Programador de tareas bajo usuario exclusivo, ejecutable y rutas absolutas,
configuración/clave fuera de Git con ACL verificada. Ejecutar al recuperar una
ejecución perdida y, si hardware lo permite, despertar equipo; no prometer ejecución
si está apagado, sin red, sin unidad externa o con batería restringida. Registrar
sólo ID/UTC/resultado/duración y última **verificación** exitosa, no sólo exit 0.
Reintentos acotados (p.ej. tres, con 5/15/60 min), exclusión de ejecuciones simultáneas,
timeout y alarma local cuando se supera la frecuencia acordada. No crear tokens,
emails ni servicio de alertas externo sin aprobación.

Proponer verificación de integridad de cada copia y ensayo periódico de restore
aislado (mensual y después de cambios de schema). Retención primero dry-run y
aprobación manual; nunca borrar el único ejemplar válido. Separar backup y restore
de arranque automático. GitHub Actions prueba fixtures exclusivamente: **nunca**
descarga ni guarda base real. No se creó ninguna tarea ni servicio permanente.

## Recuperación ante desastre: procedimiento futuro autorizado

1. Detectar incidente por errores/health, pérdida de filas, inconsistencia o caída.
   No confundir un error de conexión con corrupción. Registrar UTC, versión desplegada
   y alcance sin copiar datos sensibles a tickets.
2. Bajo autorización, detener escrituras de forma controlada (mantenimiento y
   consumidores de escritura); no borrar ni migrar para investigar. Preservar evidencia
   y snapshot de lo aún recuperable con controles de acceso separados.
3. Elegir última copia anterior al incidente, conservar las posteriores y la clave
   correspondiente. Verificar autenticación/checksum/estructura en ambas copias.
4. Crear destino vacío nuevo aislado, extensiones/PG compatibles y acceso privado.
   Nunca restaurar sobre la base original ni usar migrate reset.
5. Restaurar transaccionalmente. Revisar conteos y snapshots completos, relaciones
   tenant, dinero, fechas, hashes, secuencias y restricciones; tratar anomalías como
   fallo, sin declarar éxito sólo porque pg_restore devuelve 0.
6. Identificar commit/schema del manifiesto y comparar `_prisma_migrations`, archivos
   y checksums con ese commit. Generar Prisma para la versión correspondiente sin
   ejecutar migraciones. **No ejecutar `npm start` / `start-production.cjs`: siempre
   ejecuta migrate deploy antes de server.** Iniciar directamente el backend compilado
   compatible (`node dist/server.js`) con configuración local explícita, cwd vacío,
   DOTENV_CONFIG_PATH inexistente y sin secretos/hosts productivos heredados. El ensayo
   automatizado importa `app` y utiliza sólo login ficticio/lecturas.
7. Probar autenticación autorizada, clientes, reparaciones, caja, suscripciones,
   aislamiento y rutas públicas. No usar cuentas reales sin aprobación de lectura.
8. Preparar plan productivo separado: pausa de escrituras, base nueva, reconciliación
   de datos posteriores al snapshot, versión compatible, cutover, rollback y monitoreo.
   Las migraciones de actualización necesitan revisión explícita antes de ejecutarse.
9. Tras aprobación y recuperación, comprobar health, Origin Auth, CORS/JWT y flujo
   de negocio; registrar incidente y mediciones sin adjuntar datos/clave a GitHub.

Recuperación selectiva (cliente/factura/reparación borrada) es otro procedimiento:
restaurar primero completo en staging privado; revisar IDs, dependencias tenant,
pagos/stock/caja e idempotencia antes de autorizar una transacción selectiva. No
copiar filas sueltas por nombre ni sobrescribir registros actuales automáticamente.

## RPO/RTO propuestos, no garantizados

Backups cada 24/12/6 horas implican hasta aproximadamente 24/12/6 horas de pérdida
desde el último snapshot exitoso, **más** el retraso de ejecuciones fallidas o equipo
apagado. Una notebook apagada durante tres días rompe esos objetivos. RPO inicial
propuesto 24 h, a decidir con el propietario según pérdida tolerable y disponibilidad.
Reducir a 12/6 h requiere medir impacto/tamaño y demostrar frecuencia efectiva.

RTO objetivo inicial 2–8 h para detectar, disponer de clave/copia, preparar destino,
restaurar, reconciliar, validar y volver a operar. No es una garantía; el ensayo
ficticio subsegundo de dump/restore no incluye esos tiempos humanos ni volumen real.
Medir un restore supervisado real antes de comprometer objetivos.

## Revisión independiente y riesgos restantes

Revisión específica sin Critical/Important demostrado en el alcance sintético.
Se reforzaron cancelación real, ACL de salida/clave, claves fuera de Git, ancestros
symlink y guardas del runner de API. Permanecen carreras locales de mismo usuario,
confianza en binarios/dumps, memoria/swap, corte de energía, límites de volumen,
portabilidad de extensions y secretos externos. La conexión Node verificada y la
del cliente PostgreSQL son procesos diferentes; usan el mismo host IPv4/puerto/base
explícitos y entorno filtrado, pero no prueban identidad frente a un proceso hostil
del mismo usuario que sustituya la instancia local. No se autoriza uso productivo.

`.gitignore` excluye claves, bundles, config local, trabajo temporal y herramientas.
No se publican copias del ensayo en Git/CI; sólo resultados agregados. El único PR
de esta tarea debe quedar en borrador.
