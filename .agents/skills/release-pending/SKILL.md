---
name: release-pending
description: Prepara release con tag patch desde cambios pendientes. Solo para solicitudes que piden release o tag junto con registro de pendientes.
---

# Release Pending

Prepara un release con los cambios pendientes. Crea commit de pendientes. Crea tag patch. Usa el último tag SemVer. Sube el patch en 1. No preguntes la versión.

## Entrada

Activa esta skill solo cuando el usuario pide commit de pendientes junto con release o tag. Ejemplos válidos:

- Registra cambios pendientes y prepara release.
- Crea commit de pendientes con release y tag.
- Prepara release con tag patch.

No actives esta skill para cualquier commit aislado. No actives esta skill si la solicitud no menciona release o tag. Respeta `AGENTS.md`.

## Paso 1: Detectar convenciones

Detecta las convenciones del repositorio. No asumas el sistema de build.

1. Lee `AGENTS.md`.
2. Identifica el manifiesto de versión (`package.json`, `Cargo.toml`, `pyproject.toml` u otro).
3. Identifica la convención de commits (Conventional Commits u otra).
4. Identifica el sistema de notas de release (`CHANGELOG.md`, releases de GitHub u otro).
5. Identifica los comandos de validación obligatorios en `AGENTS.md`.

Usa solo los comandos pertinentes al cambio. No ejecutes validación gráfica.

## Paso 2: Revisar alcance

1. Revisa el estado Git.
2. Lista los archivos cambiados.
3. Lista los commits ya existentes entre el último tag y `HEAD`.
4. Muestra el alcance al usuario.
5. Revisa el alcance sin pedir confirmación cuando la solicitud ya lo autoriza.
6. Pide confirmación solo si el alcance es ambiguo.

No incluyas archivos generados. No incluyas datos locales. No incluyas secretos.

## Paso 3: Calcular versión

1. Obtén tags locales y remotos cuando corresponda.
2. Si existen tags SemVer, selecciona el último por versión numérica.
3. Compara números mayor, menor y patch.
4. Conserva el prefijo del tag (`v` si existe).
5. Sube el número patch en 1.
6. Si no hay tags SemVer, usa la versión del manifiesto como base para patch+1.
7. Usa esa versión sin preguntar.
8. Usa el mismo número en cada manifiesto necesario.
9. Si no existe base verificable, informa bloqueo en vez de inventar versión.

Ejemplo: si el último tag es `v0.1.77`, usa `v0.1.78`.

## Paso 4: Actualizar manifiestos

1. Actualiza cada manifiesto necesario con la nueva versión.
2. Mantén el formato del archivo.
3. No cambies otros campos.
4. No cambies configuración global.

## Paso 5: Validar localmente

Sigue `AGENTS.md` y las convenciones detectadas. No presupongas TypeScript ni build en todos los repositorios. Aplica esta regla aun si solo cambia la versión.

1. Identifica las verificaciones obligatorias en `AGENTS.md`.
2. En este repo, ejecuta `npx tsc --noEmit` antes de push o release.
3. Ejecuta las pruebas si el cambio tiene cobertura.
4. Ejecuta solo el build o empaquetado pertinente al cambio.
5. Registra cada resultado.
6. Detén el proceso si una validación falla.

No ejecutes validación gráfica. No ejecutes publicación local.

## Paso 6: Generar notas

1. Incluye los archivos cambiados desde el último tag.
2. Incluye los commits ya existentes entre el último tag y `HEAD`.
3. Incluye los commits nuevos de esta skill.
4. Genera notas solo si el repositorio usa notas.
5. Inspecciona las notas generadas.
6. Muestra las notas al usuario.

Mantén los subjects de commit claros para las notas públicas. No incluyas rutas privadas en las notas. No incluyas SHAs privados en las notas. No incluyas enlaces privados en las notas.

## Paso 7: Crear commit y tag

1. Stagea solo los archivos revisados en el paso 2.
2. No stagees archivos no revisados.
3. Crea uno o más commits con los cambios pendientes.
4. Usa mensajes Conventional Commits claros.
5. Crea el tag SemVer nuevo.
6. Verifica el tag localmente.
7. No publiques sin autorización.

## Paso 8: Publicar

Pide autorización solo para un push o PR no autorizado. Considera explícita una solicitud de publicar o activar CI. Ejemplos de autorización explícita: publica, haz push, activa CI.

1. Ejecuta el push del commit y del tag.
2. Confirma que el push terminó.
3. Si el push activa CI, detente después de confirmar el push.
4. No consultes el build de GitHub después del push.
5. No esperes el build de GitHub después del push.

Informa la limitación de verificación. Entrega resumen, archivos cambiados y comprobaciones.
