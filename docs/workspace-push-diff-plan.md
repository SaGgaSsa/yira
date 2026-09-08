# Diff del workspace desde el push

## Objetivo

Mostrar el nombre del workspace a la izquierda. Mostrar `+líneas −líneas` a la derecha, junto al botón Configurar.

## Cálculo

- Sumar los resultados de los repositorios configurados del workspace.
- Resolver la referencia local de push. Usar upstream si Git no permite resolver push.
- Usar el ancestro común entre HEAD y esa referencia como base. Esto excluye cambios remotos pendientes de pull.
- Comparar esa base con el árbol de trabajo. Incluir todos los commits pendientes, el índice y los cambios sin stage como un diff neto.
- Incluir archivos nuevos no ignorados. No contar líneas de archivos binarios.
- No sumar estadísticas individuales de commits. Una línea puede cambiar varias veces o volver a su estado original.
- No ejecutar fetch ni push. La referencia representa el estado remoto conocido localmente.
- Si falta una referencia o falla un repositorio, indicar diff no disponible. No mostrar un total parcial como completo.
- Sin repositorios configurados, ocultar el indicador.
- Si un archivo borrado en el índice se recrea como archivo sin seguimiento, mostrar no disponible. Esto evita contar su contenido dos veces.

## Contrato

`WorkspaceGitDiffResult`: `{ additions: number; deletions: number; available: boolean }`.

IPC `git:workspaceDiff(workspaceId)` y bridge `window.electron.git.workspaceDiff(workspaceId)`.

## Tareas delegadas

1. Backend: módulo Git, pruebas con repositorios temporales, contrato, IPC, preload y declaración del renderer.
2. Renderer: indicador, actualización periódica sin solicitudes superpuestas, descarte de respuestas antiguas, distribución de la fila y textos traducidos. Pruebas de consola.

Los controles nativos permiten crear tareas con `gpt-5.6-luna` y esfuerzo `max`. También permiten monitorear, recibir resultados y enviar correcciones. Cada tarea usa un worktree aislado y archivos propios.

## Integración y validación

Revisar cada diff completo y sus pruebas antes de integrar. Ejecutar las pruebas afectadas, `npm test` y `npx tsc --noEmit`. No usar sesiones gráficas. No crear commits, push ni PR.

## Estado

Las dos tareas están implementadas e integradas. Se revisaron todos los archivos modificados. La verificación independiente de las tareas pasó: 14 pruebas de Git e IPC y 9 pruebas del indicador y su actualización.

La validación integrada pasó: `npm test`, `npx tsc --noEmit` y `git diff --check`. La revisión fue de código y consola. No se ejecutó verificación gráfica.
