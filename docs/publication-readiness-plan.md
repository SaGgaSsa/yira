# Plan de preparación para publicación pública

**Fecha:** 2026-09-16

**Producto:** Yira 0.1.73 en `package.json`

**Titular indicado por el proyecto:** SaGgaSsa

**Contacto público:** [issues de `SaGgaSsa/yira`](https://github.com/SaGgaSsa/yira/issues)

## Resultado y decisiones

La política de privacidad y los términos son documentos separados. Yira es freeware propietario. Permite uso personal y comercial sin cobro. No es software open source. Se permiten enlaces a las páginas oficiales. La redistribución de instaladores o copias requiere permiso previo del titular. Las licencias independientes de terceros siguen vigentes.

No hay checkbox de aceptación en el instalador NSIS actual. Los documentos se publican como enlaces separados. Esta tarea no publica releases ni crea un dominio.

## Hallazgos auditados

La revisión cubrió `src/main`, `src/preload`, `src/renderer`, `src/shared`, `resources`, `build`, `package.json` y workflows. Se revisó el comportamiento implementado. No se hizo captura de paquetes.

| Superficie | Comportamiento observado | Retención o destino |
| --- | --- | --- |
| Perfil local | `YIRA_HOME` usa `~/.yira` por defecto. Guarda `config.json`, `settings.json`, `window-state.json`, workspaces, canvas/grid, board y notas. | Permanece hasta una acción de borrado o limpieza del sistema. No hay cuenta ni servicio de workspace de Yira. |
| Archivos | Un file tile lee y escribe el root elegido. Guarda borradores no guardados en el estado del tile cuando existen. Hooks, transcripts y configuración de proveedores pueden estar fuera de ese root. | Elimina el directorio interno al borrar un workspace. No borra el root externo ni los archivos de usuario. |
| Notas, board y terminal | Notas JSON y board JSON se guardan localmente. Salida, scrollback y sesión PTY viven en el daemon local. | Borrar una nota usa `note:delete`. Borrar tile terminal destruye la sesión. El daemon puede sobrevivir al cierre de la ventana y termina sin sesiones/clientes. |
| Historial de shell | Bash, zsh o PowerShell pueden guardar historial en `.yira/terminal-history`. La configuración de workspace lo habilita por defecto. | No hay purga automática propia. Borrar el workspace interno elimina ese subdirectorio. |
| Agentes | Claude/Codex se detectan por ejecutables locales. Yira lee transcript JSONL local para metadatos y preview limitado. El registro de sesión y alertas está en memoria. | El proveedor conserva sus propios transcripts según su configuración. El hook opcional cambia `~/.codex/hooks.json` o `~/.claude/settings.json`. |
| Hook de agentes | Un cliente Node lee la entrada del hook y envía solo `provider`, `event`, `tileId` a `127.0.0.1` con token efímero. | No se envía el transcript por el relay de Yira. |
| Actualizaciones | Builds instaladas consultan al inicio. `electron-updater` usa GitHub Releases `SaGgaSsa/yira-releases`, descarga automáticamente y puede instalar al salir. | GitHub procesa solicitudes y descargas bajo su política. Yira no sube diagnósticos. |
| Diagnósticos | Registra localmente evento, timestamp, versión y categorías sanitizadas. La opción está activada por defecto en ajustes nuevos o no migrados. | `logs/updater.log` y `logs/updater.previous.log`; rotación configurada en 512 KiB por archivo. Se puede desactivar en Settings. |
| Codex usage | Si algún workspace selecciona Codex, Yira inicia `codex app-server --stdio` y consulta límites aproximadamente cada 60 s. Claude se lee desde estado local. | El proceso/proveedor define su red y retención. Esto no es telemetría propia de Yira. |
| Browser y Markdown | El webview usa la sesión por defecto de Electron. Navega la URL introducida o guardada. Markdown permite imágenes HTTP(S) remotas explícitas y puede cargarlas al abrir o renderizar el documento. HTML crudo y esquemas no permitidos se bloquean. | Cookies, cache, local storage y otros datos de navegador quedan bajo el perfil de Electron. Yira no ofrece un borrado general de ese perfil. El sitio remoto controla sus logs y retención. |
| Git, SSH y Wake-on-LAN | Git ejecuta operaciones locales. `sync` hace `pull --ff-only` y `push` por acción del usuario. SSH usa OpenSSH del sistema. Wake-on-LAN envía paquetes a la red configurada. | Remotos, proveedores y hosts reciben los datos de la operación solicitada. |
| CDN, analytics y crash upload | No se encontraron CDN, analytics, Sentry, crash uploader ni endpoint propio en el código revisado. Monaco se empaqueta localmente. | No se afirma ausencia de tráfico de terceros generado por webviews, imágenes, proveedores o comandos. |

La política usa una afirmación positiva y verificable: el código revisado no muestra un envío automático de información personal ni analytics de uso a SaGgaSsa. La aplicación sí guarda datos locales que pueden contener información personal.

## Documentos y arquitectura implementada

Los documentos legales son la fuente única:

- `docs/legal/PRIVACY.md` es la política de privacidad.
- `docs/legal/TERMS.md` es Terms/EULA.
- `LegalDocuments` importa ambos Markdown como `?raw`.
- About ofrece controles ES/EN para Privacy Policy y Terms/EULA.
- Los documentos se leen offline desde el paquete de la aplicación.
- Los enlaces externos `http`/`https` usan el bridge existente.
- Al volver del documento a About, el control que lo abrió recupera el foco.
- El instalador no añade un checkbox de aceptación.

## Propuesta web futura

El build de la web debe consumir los mismos Markdown desde un tag o revisión acordada. La web debe publicar las versiones actuales en `/privacy` y `/terms`, y conservar archivos históricos con su fecha. No debe exponer un repositorio privado por obligación ni usar enlaces GitHub internos como destinos públicos. La web, sus enlaces de footer y la revisión de privacidad del hosting son trabajo futuro. No se confirma dominio ni se publica ahora.

## Plataformas registradas

La confirmación del mantenedor del 2026-09-16 registra Windows 11 Pro, Ubuntu 24.04.4 LTS con kernel 6.8.0-124 y Ubuntu 22.04. No se registra build exacto de Windows, parche o kernel de Ubuntu 22.04, versión de Yira ni funciones probadas. La arquitectura x64 se infiere de los targets actuales de distribución. No se trata como arquitectura de host auditada. CI, kernel y host de build no son pruebas funcionales por sí mismos.

## Acciones

Completadas:

- Auditar conexiones, almacenamiento local, retención y terceros.
- Crear Privacy Policy y Terms/EULA separados en inglés.
- Crear la tabla de plataformas sin filas inventadas.
- Añadir enlaces legales y de soporte a `README.md`.
- Registrar decisiones sobre uso gratuito, enlaces oficiales y permiso de redistribución.
- Integrar los documentos en `LegalDocuments`, sus controles ES/EN y los enlaces desde About.

Pendientes:

- Implementar la web futura con los mismos Markdown en `/privacy` y `/terms`.
- Revisar por separado la política de privacidad del hosting antes de publicar esa web.
- Verificar que cada release oficial enlaza los documentos y el repositorio correcto.

## Verificación y límites

No se agregan tests para documentación. La verificación integrada completada es:

- `npx tsc --noEmit`: correcto.
- `npm test`: correcto; 16 pruebas Node y 471 pruebas TypeScript, 487 aprobadas.
- `npm run build`: correcto, sin warnings; renderer compilado en 37.19 s.
- `git diff --check`: correcto.
- La inspección de `dist-electron/renderer/assets/*.js` confirma que los títulos y textos legales están incorporados al bundle offline.

No se ejecutaron pruebas GUI, `npm run dev`, `preview` ni `dist:win`, según `AGENTS.md`.

La revisión de código no sustituye una auditoría de tráfico, cookies, servicios de agentes, GitHub, hosts SSH o proveedores externos. Los datos de plataformas son confirmación del mantenedor y no una prueba funcional repetida en esta sesión.
