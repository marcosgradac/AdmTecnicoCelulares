import { LEGAL_CONFIG, CURRENT_PRIVACY_VERSION, PRIVACY_EFFECTIVE_LABEL } from '../../config/legal'

const optionalLocation = LEGAL_CONFIG.cityProvince ? `\n**Ciudad y provincia:** ${LEGAL_CONFIG.cityProvince}` : ''
const optionalEmail = LEGAL_CONFIG.privacyEmail ? `\n**Canal de privacidad:** ${LEGAL_CONFIG.privacyEmail}` : ''

export const privacyContent = `# POLÍTICA DE PRIVACIDAD DE TECNODESK

**Última actualización:** ${PRIVACY_EFFECTIVE_LABEL}

La presente Política de Privacidad explica cómo TecnoDesk recopila, utiliza, almacena y protege información personal relacionada con la utilización de la Plataforma.

TecnoDesk está diseñado principalmente para técnicos y servicios técnicos dedicados a la reparación de dispositivos móviles. Esta Política debe interpretarse conjuntamente con los Términos y Condiciones de TecnoDesk.

## 1. Responsable

TecnoDesk es operado por:

**Titular:** ${LEGAL_CONFIG.ownerName}
**CUIT:** ${LEGAL_CONFIG.cuit}
**Domicilio:** ${LEGAL_CONFIG.address}${optionalLocation}
**País:** ${LEGAL_CONFIG.country}${optionalEmail}

La ciudad, provincia y el canal público de privacidad se incorporarán cuando sean definidos.

## 2. Alcance

Esta Política se aplica a la información tratada mediante:
* el sitio web y la aplicación de TecnoDesk;
* el registro de usuarios;
* el panel de administración de cada técnico;
* los enlaces de seguimiento de reparaciones;
* los servicios y funcionalidades relacionados con TecnoDesk.

## 3. Usuarios de TecnoDesk

### Usuarios de la Plataforma
Son los técnicos, profesionales, responsables de servicios técnicos o integrantes de negocios que crean una cuenta en TecnoDesk.

### Clientes finales
Son las personas cuyos datos son incorporados por un Usuario para administrar una reparación o servicio. No necesitan necesariamente crear una cuenta en TecnoDesk.

## 4. Información del Usuario de TecnoDesk

TecnoDesk puede recopilar nombre, apellido, teléfono, nombre y teléfono del negocio, correo electrónico, credenciales necesarias para autenticación, plan contratado, estado de suscripción e información administrativa relacionada con la cuenta.

TecnoDesk no almacena contraseñas en texto plano. La autenticación utiliza los mecanismos seguros existentes en la arquitectura del proyecto.

## 5. Información de clientes finales

Los técnicos pueden ingresar nombre, teléfono, información de contacto necesaria, dispositivo, marca, modelo, IMEI, falla informada, diagnóstico, reparación, presupuesto, estado, importes, pagos, garantía e historial de trabajos.

TecnoDesk no almacena fotografías como parte de este producto.

## 6. Datos que no deben almacenarse

TecnoDesk no está diseñado para almacenar contraseñas personales del cliente, claves bancarias o de home banking, datos completos o códigos de seguridad de tarjetas, credenciales financieras, conversaciones privadas, archivos personales extraídos del celular, información privada ajena a la reparación ni datos sensibles innecesarios.

## 7. Finalidades

TecnoDesk trata información para crear y administrar cuentas, autenticar Usuarios, prestar funcionalidades, gestionar clientes, reparaciones, dispositivos, diagnósticos, presupuestos, pagos, caja, garantías e historial; generar seguimiento, prestar soporte, prevenir fraude, proteger cuentas, mantener la seguridad, corregir errores, mejorar técnicamente la Plataforma y cumplir obligaciones legales.

No se utilizan datos de clientes finales para campañas comerciales propias sin una base jurídica válida.

## 8. Rol del técnico respecto de sus clientes

Cada Usuario decide qué información incorpora y deberá obtenerla legítimamente, usarla para finalidades relacionadas con su actividad, evitar datos innecesarios, informar cuando corresponda y mantenerla razonablemente actualizada.

## 9. Enlace de seguimiento

El técnico puede compartir un enlace individual que muestre equipo, modelo, reparación, estado, progreso, presupuesto, importe, saldo e información de entrega.

El enlace no debe mostrar costos internos, márgenes, ganancias, información de otros clientes, credenciales, datos internos ni datos personales innecesarios. Utiliza identificadores difíciles de adivinar y la arquitectura permite evolucionar hacia su revocación, regeneración, desactivación o caducidad.

## 10. Información técnica y de seguridad

TecnoDesk puede procesar sesiones, identificadores técnicos, registros de errores, eventos de seguridad, información de autenticación y fecha y hora de determinadas operaciones. Esta Política no declara recopilación de IP ni geolocalización.

## 11. Cookies y almacenamiento local

El frontend utiliza almacenamiento local técnicamente necesario para conservar la sesión autenticada y almacenamiento de sesión para estados temporales de la experiencia. Actualmente no se utilizan Google Analytics, Meta Pixel, publicidad, cookies de marketing ni herramientas externas de seguimiento comercial.

## 12. Proveedores tecnológicos

TecnoDesk utiliza **Vercel** para publicar el frontend, **Railway** para operar el backend y **PostgreSQL**, accedido mediante Prisma, como base de datos. Estos proveedores pueden procesar información únicamente en la medida necesaria para proporcionar infraestructura a TecnoDesk.

No se declara el uso de proveedores de email, pagos, analítica o publicidad que no estén implementados.

## 13. Transferencias internacionales

La infraestructura de proveedores puede encontrarse fuera de Argentina. TecnoDesk procura utilizar proveedores y mecanismos compatibles con las exigencias legales aplicables y no garantiza que todos los datos permanezcan en Argentina.

## 14. Seguridad

TecnoDesk adopta medidas razonables frente al acceso no autorizado, pérdida, modificación, destrucción o divulgación indebida, incluyendo autenticación, control de acceso, aislamiento entre cuentas, comunicaciones cifradas, protección de credenciales, permisos de base de datos, respaldos y registros de seguridad según corresponda. Ningún sistema conectado a Internet garantiza seguridad absoluta.

## 15. Separación entre técnicos

La arquitectura relaciona los datos con la cuenta o negocio correspondiente y aplica controles de acceso basados en esa relación. Ningún Usuario está autorizado a consultar información perteneciente a otro negocio.

## 16. Conservación

La información se conserva mientras sea necesaria para prestar el servicio, mantener la cuenta, cumplir obligaciones legales, resolver disputas, proteger la seguridad y mantener registros legítimos. Luego deberá eliminarse o anonimizarse conforme a las políticas internas y legislación aplicable. No se establece actualmente un plazo único.

## 17. Eliminación de cuenta

El Usuario puede solicitar la eliminación mediante los canales oficiales habilitados por TecnoDesk. No se afirma que exista actualmente un botón automático específico.

## 18. Derechos de las personas

Conforme a la normativa aplicable, una persona puede solicitar acceso, actualización, rectificación, corrección o supresión. Las solicitudes se recibirán mediante el canal público de privacidad cuando sea definido.${optionalEmail}

## 19. Clientes finales

Cuando una solicitud se refiera a información incorporada por un técnico, TecnoDesk podrá coordinarla con ese Usuario y colaborará cuando corresponda para permitir el ejercicio de los derechos aplicables.

## 20. Información de menores

TecnoDesk está diseñado para ser contratado y administrado por mayores de 18 años. No está dirigido deliberadamente a menores para crear cuentas comerciales.

## 21. Finalidades comerciales

TecnoDesk puede enviar comunicaciones sobre seguridad, cuenta, funcionamiento, suscripción, soporte, cambios legales y funcionalidades importantes. Las comunicaciones comerciales deberán diferenciarse de las necesarias para prestar el servicio.

## 22. Venta de información

TecnoDesk no vende bases de datos personales de Usuarios ni de clientes finales a anunciantes.

## 23. Cambios de la Política

Esta Política puede actualizarse por cambios legales, técnicos, funcionales, de proveedores o del tratamiento de datos. Los cambios relevantes se comunicarán razonablemente y cada versión tendrá número y fecha de vigencia.

## 24. Legislación aplicable

La presente Política se interpreta conforme a las leyes de la República Argentina y las normas aplicables sobre protección de datos personales.

## 25. Contacto y ejercicio de derechos

Las consultas podrán realizarse mediante el canal oficial que TecnoDesk habilite para esa finalidad.${optionalEmail}

---
**Versión:** ${CURRENT_PRIVACY_VERSION}
**Fecha de vigencia:** ${PRIVACY_EFFECTIVE_LABEL}`
