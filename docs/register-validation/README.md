# Registro: validaciones y mensajes

Revisión local del 20 de octubre de 2026.

Rama: `codex/register-validation`.
Base: `origin/main`, `669c20d271c1a935cfabea6b0efafb4a40e6e484`.
Worktree: `C:\Users\marco\.codex\worktrees\register-validation\AdmTecnicoCelulares`.
Publicación de commit y PR autorizada tras la revisión final; sin merge ni despliegue productivo.

## Diagnóstico y corrección

La prueba inicial reprodujo que el botón Crear cuenta no podía activarse sin Turnstile. Además, el puntaje de fortaleza podía aceptar contraseñas sin una de las clases obligatorias y no comprobaba el máximo de 128 caracteres. El frontend tampoco comprobaba los dos caracteres del nombre del negocio. Los campos required podían detener el envío mediante validación nativa sin ejecutar los mensajes de React.

- Reglas y mensajes por campo, visibles al salir del campo o intentar enviar.
- Cinco requisitos de contraseña actualizados en tiempo real, con iconos distintos y estados textuales accesibles. La fortaleza sigue siendo orientativa, independiente de la validez.
- Formulario con noValidate: conserva la semántica required, pero muestra sus propios errores, resumen y foco al primer campo incorrecto.
- Botón disponible para obtener indicaciones sin Turnstile; no se envía una solicitud si falta el token o hay campos inválidos. Durante una solicitud se deshabilita y se protege también contra envíos simultáneos.
- Errores de red y HTTP 400, 403, 409, 429, 500 y 503 con mensajes controlados; no se reproducen detalles privados enviados por el servidor. El error del servidor recibe foco.
- Nombres y apellidos en minúsculas admitidos. No se exige un carácter especial.
- Sin cambios al componente compartido PasswordField, al backend productivo, al widget de Turnstile, a rate limits ni a documentos legales. Versiones de aceptación actuales conservadas en 1.0.

## Archivos de implementación y pruebas

| Archivo | Cambio |
|---|---|
| frontend/src/pages/RegisterPage.tsx | Validación previa, foco, prevención de doble envío y mensajes de API seguros. |
| frontend/src/components/auth/RegisterForm.tsx | Errores por interacción, requisitos, resumen y asociaciones accesibles. |
| frontend/src/components/auth/registerValidation.ts | Reglas y mensajes del registro alineados con auth.routes.ts. |
| frontend/tests/register-validation.cjs | Formulario real en Chromium con API y Turnstile simulados; capturas y detección de desbordes. |
| backend/tests/register-validation.ts | Contrato HTTP real contra PostgreSQL temporal, seguridad y aceptación legal. |
| frontend/package.json | Script test:register-validation. |
| backend/package.json | Script test:register-validation mediante el harness local existente. |
| .github/workflows/ci.yml | Incorpora ambas suites y captura evidencias como artefactos. No despliega. |
| docs/superpowers/plans/2026-10-20-register-validation.md | Plan y comprobaciones de la tarea. |
| docs/register-validation/README.md y screenshots/ | Informe y evidencias locales. |

## Resultados locales

| Comprobación | Resultado |
|---|---|
| Frontend: npm run typecheck | Correcto. |
| Frontend: npm run build | Correcto. Advertencia existente por chunks superiores a 500 kB. |
| Frontend: test:register-validation | 32 escenarios correctos; revisión adicional con Chrome visible: 10 escenarios correctos. |
| Frontend: test:browser-hardening | 9 grupos correctos, incluidos recuperación de contraseña y escape de HTML. |
| Frontend: test:pwa | 47/47 correctas. |
| Frontend: test:encoding | Correcto. |
| Backend: npm run typecheck y npm run build | Correctos, tras generar el cliente SQLite local que genera normalmente postinstall. |
| Backend: register-validation.ts, harness PostgreSQL | 24 comprobaciones correctas; comparación directa de contraseñas con las reglas del frontend. |
| Backend: password-reset.ts, mismo harness aislado | 17 comprobaciones correctas. |
| Backend: password-change.ts, mismo harness aislado | 13 comprobaciones correctas. |
| Backend: npm test | Correcto: registro de rutas, Origin Auth, IP de clientes, límites y protección de previews. |
| Diff y alcance | Sin cambios en backend/src, esquemas, migraciones, configuración productiva o versiones legales. |

La suite del frontend cubre falta de mayúscula, minúscula o número; menos de 8 y más de 128 caracteres; confirmación distinta; vacíos; teléfonos y correo inválidos; negocio de un carácter; términos sin aceptar; Turnstile pendiente, fallido y vencido; errores HTTP y red; registro válido sin carácter especial y con nombres en minúsculas. Verifica cero solicitudes ante datos inválidos, foco, asociación de los requisitos, protección de mensajes privados y ausencia de desborde a 360, 390, 430 y 1440 px en ambos temas.

El backend también verifica aceptación y versiones legales, cero cuentas tras intentos inválidos o Turnstile fallido, persistencia de aceptaciones, máximo de 128 caracteres, rechazo de duplicados con mensaje genérico y rate limiting activo. Se aplicaron las migraciones existentes exclusivamente a un clúster PostgreSQL desechable de localhost, eliminado por el harness al terminar. No se creó una migración nueva.

## Capturas

20 PNG del formulario real, con datos ficticios y verificación de seguridad explícitamente simulada. Los archivos corregido-* muestran la desaparición de errores tras corregir la contraseña y completar Turnstile simulado. Los archivos registro-* muestran el encuadre posterior al envío inválido; password-* muestran la lista de requisitos. Escritorio: 1440 × 1000 para password-* y 1440 × 1102 para la página completa registro-*. Móvil: 360/390/430 × 932. Todos los PNG se abrieron y se verificaron sus dimensiones.

| Vista | Claro | Oscuro |
|---|---|---|
| Escritorio: mensaje y requisitos | [Ver](screenshots/password-1440-light.png) | [Ver](screenshots/password-1440-dark.png) |
| Móvil 390 px: mensaje y requisitos | [Ver](screenshots/password-390-light.png) | [Ver](screenshots/password-390-dark.png) |
| Móvil 360 px | [Ver](screenshots/password-360-light.png) | [Ver](screenshots/password-360-dark.png) |
| Móvil 430 px | [Ver](screenshots/password-430-light.png) | [Ver](screenshots/password-430-dark.png) |

## Límites de la verificación

- No se consultó Cloudflare real: callbacks y respuestas de Turnstile se simularon, sin cambiar su validación productiva. La comprobación real del proveedor queda para una revisión autorizada del entorno publicado.
- No se modificó el ciclo de recuperación del widget compartido. Si el propio widget informa un fallo de carga, puede ser necesario recargar la página; los mensajes de validación del formulario siguen disponibles.
- La semilla y las solicitudes fueron ficticias. No se accedió a datos, cuentas ni bases de producción.
- Se autorizaron commit, push y PR para revisión después de las pruebas. No se autorizaron merge ni despliegue productivo. Los resultados locales preceden a la publicación; el estado de GitHub Actions se informa en el PR.

## Última verificación antes del PR

Se detectó y corrigió que el mensaje específico de contraseña esperaba al blur. Ahora aparece al escribir una contraseña sin mayúsculas, sin perder el foco, y desaparece al corregirla. La lista y el mensaje cambian inmediatamente. La prueba comprueba además que se eliminan todos los errores al corregir cada campo, sin solicitudes mientras Turnstile permanece pendiente.

La comparación HTTP del backend verifica contraseñas válidas sin carácter especial, exactamente 8 y 128 caracteres, y rechaza los mismos ejemplos inválidos que el frontend. La revisión visible empleó Chrome real con ventanas de escritorio y emulación responsive móvil, sin un dispositivo físico ni servicios productivos.

Capturas después de corregir: [escritorio claro](screenshots/corregido-1440-light.png), [escritorio oscuro](screenshots/corregido-1440-dark.png), [móvil claro](screenshots/corregido-390-light.png), [móvil oscuro](screenshots/corregido-390-dark.png).

Se agregó exclusivamente la exclusión git.deploymentEnabled para codex/register-validation en frontend/vercel.json, siguiendo el patrón existente. No se cambian main, reglas de routing, headers ni configuración mediante la API de Vercel. Esta regla temporal se debe revisar al preparar la integración. Referencia: [Vercel Git Configuration](https://vercel.com/docs/project-configuration/git-configuration).
