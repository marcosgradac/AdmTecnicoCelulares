# Registro: validaciones y mensajes — plan local

Objetivo: alinear la validez del formulario con auth.routes.ts sin cambiar reglas del servidor, Turnstile ni aceptación legal.

- [x] Reproducir con una prueba de navegador local: envío vacío con Turnstile pendiente, contraseñas que pasan por puntaje y fallan por requisitos.
- [x] Centralizar las reglas y mensajes del frontend; conservar fortaleza como indicador independiente.
- [x] Mostrar errores al salir de cada campo y al enviar; usar noValidate, resumen accesible y foco al primer error. Mantener el envío bloqueado en la lógica si falta Turnstile.
- [x] Probar solicitudes válidas simuladas, errores HTTP y red, expiración/fallo de Turnstile, accesibilidad y ambos temas a 360/390/430/1440 px.
- [x] Probar el contrato real del backend en PostgreSQL temporal aislado, junto con regresiones de seguridad y legalidad. Ejecutar typecheck y builds.
- [x] Entregar informe y capturas. Sin commit, push, merge, despliegue ni datos reales.
