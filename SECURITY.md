# Security

## Reporting a vulnerability

Si encontrás una vulnerabilidad, **no abras un issue público**. Enviá un reporte privado a los mantenedores (o creá un issue con label `security` si no hay canal privado configurado).

Incluí:
- Tipo de vulnerabilidad y superficie (auth, API, datos).
- Pasos para reproducir.
- Impacto estimado.

## Guías del proyecto

- **Autenticación**: sesiones JWT firmadas con `AUTH_SECRET` (nunca commitear el secreto real; `.env*` está gitignored).
- **Scoping por usuario**: toda ruta de API valida que el recurso pertenezca a la sesión (`findFirst` por owner → 404, sin leak de existencia).
- **Validación server-side**: las reglas de negocio (mínimo 11 jugadores, guards de liga) se aplican en el servidor, no solo en el frontend.
- **Dependencias**: la imagen corre en `node:22-alpine`; `bcryptjs` (sin binarios nativos).
- **CORS / LAN**: `AUTH_TRUST_HOST` solo para entornos HTTP de confianza; producción detrás de HTTPS preferible.
