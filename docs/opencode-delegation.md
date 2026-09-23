# Delegación a OpenCode

Esta configuración es de proyecto. Aplica solo a este repositorio. No modifica configuración global. Un worktree creado antes del commit debe recibir una copia del `opencode.json` revisado.

## Verificar instalación y catálogo

```sh
opencode --version
opencode models opencode --refresh
```

Usa el modelo exacto `opencode/muse-spark-1.3-contributor-free`. No uses la variante de pago. No uses otro modelo.

## Investigación en un worktree existente

La investigación es solo lectura. El paquete prohíbe editar.

```sh
opencode run "Ejecuta el paquete adjunto. Solo lectura. Devuelve resumen y comprobaciones." --pure --model opencode/muse-spark-1.3-contributor-free --agent build --format json --title investigacion --dir C:/ruta/al/worktree --file C:/ruta/al/paquete.md
```

## Implementación en un worktree existente

```sh
opencode run "Ejecuta el paquete adjunto. Modifica solo los archivos autorizados." --pure --model opencode/muse-spark-1.3-contributor-free --agent build --format json --title implementacion --dir C:/ruta/al/worktree --file C:/ruta/al/paquete.md
```

El paquete incluye objetivo y criterios. Incluye archivos propios e interfaces. Incluye restricciones y base/estado Git. Incluye comandos de verificación. Incluye límites de Git/PR.

## Continuar sesión

```sh
opencode run --pure --model opencode/muse-spark-1.3-contributor-free --agent build --format json --title correccion --dir C:/ruta/al/worktree --session ID "Aplica la corrección indicada. Revisa el diff completo."
```

Mantén correcciones en la misma sesión. No uses `--auto`. No uses `--share`.

## Prueba mínima

```sh
opencode run --pure --model opencode/muse-spark-1.3-contributor-free --agent build --format json --title prueba "Responde exactamente OPENCODE_MUSE_OK sin usar herramientas."
```

La respuesta válida es exactamente `OPENCODE_MUSE_OK`.

Resultado real del coordinador: OpenCode 1.18.31, modelo exacto, respuesta `OPENCODE_MUSE_OK`, salida 0 y coste reportado 0. Delegación de estos tres archivos completada. El coordinador valido JSON y git diff --check. La segunda inferencia con opencode.json final tambien devolvio OPENCODE_MUSE_OK, salida 0, coste reportado 0. Fecha 2026-09-20. Estos datos fueron comprobados por el coordinador.

## Evidencia de release v0.1.77

El coordinador registró tres hechos en Windows. Usa estos hechos como referencia. No cambies el procedimiento base por estos hechos.

1. OpenCode no fue invocable en el shell sandbox. La misma CLI funcionó mediante ejecución escalada. No pruebes como hecho que el sandbox bloqueó el acceso. Podría ser PATH o entorno. La causa exacta no se confirmó.
2. Un permiso `edit` con rutas absolutas de Windows rechazó `package.json`. El coordinador agregó la ruta relativa `package.json`. El coordinador continuó la misma sesión con `--session ID`. La edición funcionó luego del cambio.
3. OpenCode devolvió exit code 0 aunque rechazó `edit` y `bash`. El coordinador revisó los eventos JSON. El coordinador revisó el diff real. La salida 0 no indicó éxito.

## Procedimiento de detección y resolución

Aplica este procedimiento en cada tarea. No cambies el modelo. No uses `--auto`. No amplíes permisos sin límite. No confíes solo en `$LASTEXITCODE`.

1. Revisa los eventos JSON de `--format json`. Revisa eventos de error. Revisa el estado de cada herramienta. Identifica la herramienta rechazada. Identifica la ruta rechazada. Distingue errores esperados al leer archivos nuevos de rechazos de permisos. Un error de archivo no encontrado en un archivo nuevo no es un rechazo de permiso.
2. Advierte que exit 0 puede coexistir con rechazo. Declara fallo si un evento de error muestra rechazo aunque el exit code sea 0. Informa el rechazo al usuario. No presentes salida 0 como éxito suficiente.
3. Valida el diff esperado solo para tareas de edición. Revisa el diff real con `git status` y `git diff`. Compara el diff con el resultado esperado. Declara fallo si OpenCode reporta éxito pero el diff no contiene los cambios.
4. Para investigación de solo lectura valida la entrega sin exigir diff. Revisa el resumen. Revisa las comprobaciones. No declares fallo por diff vacío.
5. Si Windows no encuentra el ejecutable dentro del sandbox, detén la invocación. Ejecuta la misma CLI mediante ejecución escalada. Usa el mismo modelo. Usa los mismos argumentos. Registra el cambio de entorno.
6. Si `edit` rechaza una ruta absoluta de Windows, detén la tarea. Agrega la ruta relativa equivalente al JSON de `OPENCODE_CONFIG`. Mantén el resto de permisos sin cambios. Continúa la misma sesión con `--session ID`. No inicies una sesión nueva.
7. Repite la verificación de eventos y de diff después de cada corrección. Entrega resumen, archivos cambiados y comprobaciones. Incluye los rechazos detectados en la entrega.

## Credenciales

Administra credenciales con `opencode auth login` solo si el proveedor las exige. No imprimas secretos. No guardes secretos en `opencode.json`.

## Permisos por tarea

Usa `OPENCODE_CONFIG` con un JSON local excluido de Git. Concede solo permisos necesarios para archivos y comandos de la tarea. En `run` no interactivo `ask` no concede permiso automáticamente. No uses `--auto`.

```powershell
$env:OPENCODE_CONFIG = "C:/ruta/local/permisos-tarea.json"
opencode run "Ejecuta el paquete adjunto." --pure --model opencode/muse-spark-1.3-contributor-free --agent build --format json --title tarea --dir C:/ruta/al/worktree --file C:/ruta/al/paquete.md
Remove-Item Env:OPENCODE_CONFIG
```

Contenido mínimo del JSON local:

```json
{
  "permission": {
    "*": "ask",
    "read": "allow",
    "edit": { "*": "ask", "<ruta-tarea>": "allow" },
    "todowrite": "allow"
  }
}
```

Reemplaza `<ruta-tarea>` por cada ruta autorizada. Usa rutas relativas al `--dir` de la tarea. Incluye `package.json` como ruta relativa cuando la tarea edita el manifiesto. No uses solo rutas absolutas de Windows. Observación del coordinador: con comodín `deny` y solo `read`/`edit` visibles recibió HTTP 403 `FreeTierError`; cambiar solo `deny` por `ask` permitió esta tarea. No se confirma causa interna. No cambies headers. No evadas restricciones.

Permite `todowrite` desde el inicio si el agente lo utiliza. El rechazo de `todowrite` ocurrió en esta tarea aunque el paquete no exigía lista. No supedites este permiso a exigencia del paquete. Restringe `bash` a los comandos de la tarea solo si delegas verificaciones a OpenCode. Si no delegas verificaciones, no concedas `bash`. El coordinador ejecuta las comprobaciones en ese caso.

## Advertencia

Contributor Free es temporal. Prompts/completions pueden entrenar a Meta. Fuente: https://opencode.ai/docs/zen/.

## Fuentes oficiales

- https://opencode.ai/docs/zen/
- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/config/
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
