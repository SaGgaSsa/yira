# Sesiones de terminal entre cierres de Yira

## Objetivo

Cerrar Yira desconecta la interfaz y conserva las sesiones de terminal en un proceso auxiliar independiente. Abrir Yira recupera los mismos procesos, sus dimensiones, pantalla e historial visible. Eliminar un tile o workspace termina sus sesiones. Los procesos siguen trabajando mientras la interfaz está cerrada.

El reinicio del equipo o la pérdida del proceso auxiliar termina las sesiones. Esta implementación no promete recuperar procesos después de esos eventos ni guardar variables de shell en disco.

## Arquitectura

- El proceso auxiliar ejecuta `node-pty` con Electron en modo Node. Tiene una entrada de compilación separada.
- En AppImage, el proceso auxiliar inicia el archivo AppImage en un montaje independiente. Un bootstrap fijo resuelve la entrada desde su propio ejecutable. Cerrar la aplicación puede desmontar el montaje original sin perder el servicio.
- Mantiene una terminal headless por sesión. Serializa pantalla e historial al reconectar. No reconstruye la pantalla con una cola ANSI cortada.
- Conserva la identidad `(workspaceId, tileId, generation)`, las dimensiones, el estado de salida y los avisos de agentes. Los comandos iniciales se ejecutan solo en la creación.
- El puente HTTP de avisos pertenece al proceso auxiliar. Su dirección permanece válida cuando se cierra la interfaz.
- El proceso principal usa un cliente TCP limitado a loopback. Un archivo privado dentro de `YIRA_HOME/terminal-runtime` contiene puerto, token, PID y versión del protocolo. No contiene comandos, salida ni variables de entorno.
- El inicio se coordina mediante un bloqueo de archivo con recuperación de propietarios terminados. Un endpoint incompatible o un proceso vivo que no responde produce un error. No se inicia otro conjunto de terminales de forma silenciosa.
- La interfaz usa preload e IPC existentes. No recibe el token del proceso auxiliar ni acceso Node.
- La desconexión no termina PTYs. Las operaciones destructivas comprueban la generación. Las sesiones de workspaces no visitados también se pueden eliminar.
- Los mensajes de salida usan una secuencia. Una instantánea incluye la última secuencia representada. El cliente descarta eventos anteriores para evitar pérdida o duplicación al reconectar.
- El proceso auxiliar termina cuando no quedan sesiones ni clientes, después de un período de espera.

## Contrato

`src/shared/terminalDaemonProtocol.ts` define el protocolo compartido. Los mensajes son JSON delimitado por nueva línea y limitado a 16 MiB. Cada solicitud incluye token e identificador. Las respuestas incluyen ese identificador y un resultado o error. `attach` y `create` suscriben la conexión a los eventos de la sesión. `list` solo consulta. `snapshot` serializa la pantalla actual. Desconectar el socket elimina las suscripciones.

`rendererAttach` obtiene una instantánea y asigna las respuestas a consultas de terminal al renderer. `rendererDetach` devuelve esa responsabilidad al terminal headless cuando ya no hay vistas. Una suscripción del proceso principal no implica que exista una vista. Los eventos posteriores a la instantánea se envían como salida viva, separados del contenido restaurado.

## Tareas delegadas

1. Servidor: PTYs, pantalla headless, comandos iniciales, avisos persistentes, protocolo autenticado y pruebas de comportamiento. Propiedad: `src/main/terminalDaemonServer.ts`, `src/main/terminalDaemonServer.test.ts`, `src/main/terminalDaemonEntry.ts`, `package.json`, `package-lock.json`.
2. Cliente e inicio: transporte, solicitudes, errores, bloqueo de inicio, proceso separado, entrada de compilación y pruebas. Propiedad: `src/main/terminalDaemonClient.ts`, `src/main/terminalDaemonClient.test.ts`, `electron.vite.config.ts`.
3. Integración, después de revisar las tareas 1 y 2: IPC, cierre de la aplicación, recuperación de agentes, eliminación de sesiones no montadas y pruebas afectadas. El paquete de la tarea especificará su propiedad exacta.
4. Verificación independiente: `scripts/check-terminal-persistence.mjs` conecta dos procesos cliente sucesivos al mismo PTY real. Se ejecuta después de compilar.
5. Ciclo de vida del renderer: los errores al montar un terminal solo desconectan la vista. La eliminación o actualización explícita termina también las sesiones que no tienen una vista montada.

Cada tarea usa un worktree aislado con Luna y esfuerzo máximo. No hace push ni modifica PRs. El agente principal revisa cada diff y verifica los resultados antes de integrar.

## Verificación

- Pruebas de servidor con PTY controlado: desconexión, reconexión, salida durante ausencia, identidad, redimensionado, pantalla alternativa, comandos una sola vez, salida del proceso, eliminación y autenticación.
- Pruebas de cliente: respuestas y eventos intercalados, pérdida de conexión, inicio simultáneo, endpoint obsoleto y cierre sin terminar el servidor.
- Prueba de consola con PTY real: crear un shell, guardar su PID y una variable, desconectar el cliente, conectar otro cliente y verificar continuidad. Eliminar el terminal y verificar su salida.
- Ejecutar `npx tsc --noEmit`, `npm test` y `npm run build`.
- No ejecutar interfaz gráfica, desarrollo, preview ni empaquetado Windows local.

## Estado de implementación

Implementación integrada y revisada. Las tareas usaron subagentes Luna con esfuerzo máximo y worktrees aislados.

- Renderer: los errores de montaje desconectan la vista. Borrar o refrescar termina también una sesión sin vista.
- Servidor: conserva PTYs, pantalla, historial, dimensiones, comandos iniciales y avisos.
- Cliente: transporta eventos y coordina el arranque entre procesos. AppImage usa un montaje independiente.
- IPC y cierre: recuperan sesiones existentes antes de preparar un lanzamiento nuevo. Cerrar desconecta sin terminar los procesos.
- Workspaces: eliminar un workspace termina sus sesiones, incluso si no tienen una vista abierta.
- Agentes: se recuperan metadatos, avisos y estado de salida. Una desconexión no se registra como salida del proceso.

## Verificación final

- `npx tsc --noEmit`: pasa.
- `npm test`: pasa; 458 pruebas TypeScript aprobadas, además de las pruebas de scripts.
- `npm run build`: pasa.
- `git diff --check`: pasa.
- Empaquetado Linux de directorio y AppImage: pasa.
- `scripts/check-terminal-persistence.mjs`: pasa con Electron de desarrollo y con la entrada dentro de `app.asar` del paquete Linux. Conserva PID, variables, directorio, salida, identidad y dimensiones entre procesos cliente.
- AppImage final: un lanzador dentro del montaje original inicia el cliente con `appImagePath` y termina. Se comprobó que el montaje original desaparece, el daemon sigue en otro montaje y un cliente externo puede crear, reconectar, redimensionar y destruir un PTY real. La prueba del subagente y la verificación independiente del agente principal pasan.
- No se ejecutaron pruebas gráficas ni empaquetado Windows. La ejecución en Windows queda sin verificar en este entorno.
- No se creó commit, push ni publicación.

## Criterios de integración aplicados

- Buscar la sesión por target antes de validar un nuevo lanzamiento. Una reconexión no repite comandos ni reconstruye argumentos de agentes.
- Usar la generación del daemon. No generar identidades en el proceso principal.
- Al adjuntar una vista, capturar eventos mientras se solicita `rendererAttach`. Devolver el snapshot y entregar los eventos con secuencia mayor como salida viva. No concatenar esos eventos al replay: podrían contener consultas que necesitan respuesta.
- Mantener avisos y salidas de proceso del daemon conectados a los mecanismos existentes del renderer y al registro de agentes.
- Desconectar el cliente después de guardar el workspace al cerrar. No enviar `destroy` ni marcar una desconexión como salida real del PTY.
- Eliminar workspaces desde el proceso principal debe destruir sus sesiones aunque el renderer no las haya visitado.
- Las pruebas deben cubrir eventos que llegan entre solicitud, snapshot y adjunción, así como comandos iniciales que se ejecutan una sola vez.
