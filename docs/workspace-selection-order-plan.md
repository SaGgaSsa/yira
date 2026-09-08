# Orden de workspaces por selección y fijados

## Comportamiento

- Quitar el orden manual del manager.
- Mostrar los workspaces fijados antes de los no fijados.
- Ordenar cada grupo por última selección explícita, de más reciente a más antigua.
- Contar el clic en la fila y el botón de foco como selección, incluso en el workspace actual.
- No actualizar la selección por actividad de tiles, restauración al iniciar, configuración o fijado.
- Persistir la última selección y el estado fijado en los metadatos del workspace.
- Conservar el orden previo como desempate para datos antiguos sin selecciones.
- Permitir fijar y desfijar varios workspaces desde la lista.

## Implementación delegada

1. Luna: contratos, normalización, persistencia IPC, puente preload y pruebas de datos.
2. Revisar el diff completo y las pruebas del primer worktree. Integrar los cambios aceptados.
3. Luna: orden de lista, registro de selección explícita, botón de fijado, retiro de controles del manager, traducciones y pruebas.
4. Revisar el diff completo y las pruebas del segundo worktree. Integrar los cambios aceptados.

Cada tarea usa un worktree aislado. No crear commits, pushes ni PRs.

## Verificación

- Pruebas de orden por selección, múltiples fijados, desempates y ausencia de mutación de entrada.
- Pruebas de persistencia, normalización de datos antiguos y conservación al editar en el manager.
- Pruebas de interacción mediante consola cuando las herramientas existentes lo permitan.
- Ejecutar `npx tsc --noEmit`, las pruebas específicas y `npm test`.
- No ejecutar sesiones gráficas ni solicitar verificación visual.

## Avance

- Tarea de datos integrada tras revisión del diff completo y del alcance del worktree.
- TypeScript y 11 pruebas específicas de datos pasaron en la revisión independiente.
- La persistencia usa una cola de escritura y reemplazo atómico de `config.json`.
- Tarea de interfaz integrada tras revisión del diff completo y del alcance del segundo worktree.
- Se verificó que la tarea de interfaz no modificó los nueve archivos aceptados de datos.
- Verificación final integrada: `npx --no-install tsc --noEmit` correcto.
- Verificación final integrada: `npm test` correcto; 18 pruebas de scripts y 281 pruebas de TypeScript.
- `git diff --check` correcto.
- Verificación limitada a revisión de código y consola, según `AGENTS.md`.
- Plan completado. Cambios locales sin commit, push ni PR.
