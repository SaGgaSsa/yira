# Source Control: commit y sincronización

## Alcance

Extender el panel Source Control existente de cada workspace Git con un mensaje de commit, una acción Commit y una acción Sync. No se agregan historial, creación/cambio de ramas, stash, resolución de conflictos ni autenticación interactiva.

## Interfaz

- Debajo de las secciones de cambios se muestra un campo de texto para el mensaje de commit y un botón Commit.
- Commit sólo está disponible cuando hay archivos staged y el mensaje, tras quitar espacios, no está vacío.
- El encabezado incorpora un botón Sync junto a Refresh. Sync sólo está disponible cuando la rama tiene upstream configurado.
- Durante Commit o Sync se deshabilitan las acciones Git para evitar operaciones simultáneas. Los errores reutilizan el área de error y la acción de reintento existente.

## Contratos y flujo

El bridge recibe únicamente `workspaceId`; el proceso principal resuelve el `rootFolderPath` persistido del workspace. Se agregan operaciones Git acotadas:

- `git:commit(workspaceId, message)` ejecuta `git -C <root> commit -m <message>`.
- `git:sync(workspaceId)` ejecuta `git -C <root> pull --ff-only` y, si termina correctamente, `git -C <root> push`.

El runner valida que el mensaje sea texto no vacío y limitado a 10.000 caracteres. Todas las invocaciones siguen usando `execFile`; el entorno es no interactivo para que una credencial, una confirmación SSH o un conflicto nunca bloquee la interfaz.

El estado Git incluye el upstream de la rama actual y sus conteos ahead/behind, obtenidos de `git status --porcelain=v1 -z --branch`. La interfaz usa el upstream para habilitar Sync y los conteos para explicar el estado cuando corresponda.

## Errores y resultados

- Si no hay upstream, Sync falla con un mensaje explícito y no intenta push.
- Si el pull fast-forward no puede continuar por divergencia, Sync se detiene: no crea merge ni rebase automático y no ejecuta push.
- Tras Commit o Sync exitoso se refresca el estado. Commit borra el mensaje sólo después del éxito.
- Errores de Git, repositorio no disponible o Git ausente permanecen visibles y se pueden reintentar.

## Pruebas

- Runner: argumentos exactos de commit, validación de mensaje, Sync con upstream, falta de upstream y que un pull fallido no llegue a push.
- Parser: upstream y ahead/behind de la cabecera porcelain.
- IPC/preload: contratos commit y sync restringidos por workspace.
- UI: campo y botón Commit, Sync, estados deshabilitados, recarga después de cada mutación y ausencia de acciones no incluidas.
