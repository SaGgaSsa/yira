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
    "edit": { "*": "ask", "<ruta-tarea>": "allow" }
  }
}
```

Reemplaza `<ruta-tarea>` por cada ruta autorizada. Observación del coordinador: con comodín `deny` y solo `read`/`edit` visibles recibió HTTP 403 `FreeTierError`; cambiar solo `deny` por `ask` permitió esta tarea. No se confirma causa interna. No cambies headers. No evadas restricciones.

## Advertencia

Contributor Free es temporal. Prompts/completions pueden entrenar a Meta. Fuente: https://opencode.ai/docs/zen/.

## Fuentes oficiales

- https://opencode.ai/docs/zen/
- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/config/
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
