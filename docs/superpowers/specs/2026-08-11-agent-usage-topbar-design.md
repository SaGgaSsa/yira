# Indicador de uso de agentes en el topbar

## Objetivo

Mejorar la lectura del uso de Claude y Codex en el topbar.
Conservar el último uso válido cuando la fuente temporal no tenga una actualización.

## Alcance visual

- Reemplazar el texto visible `Codex` y `Claude` por los símbolos oficiales de OpenAI y Anthropic.
- Guardar los SVG como recursos locales del renderer.
- Usar las variantes oficiales blancas o monocromas aptas para un fondo oscuro.
- Mantener el nombre del proveedor en etiquetas accesibles. No mostrarlo como texto visual.
- Mostrar en blanco la etiqueta de ventana y la fecha de reinicio.
- Mantener los colores existentes de porcentaje y anillo: neutro, ámbar desde 70 % y rojo desde 90 %.

## Formato de reinicio

- Ventana de cinco horas: mostrar solo `↻ HH:mm`.
- Ventana semanal: mostrar `↻ DD mes HH:mm`.
- Usar formato de 24 horas.
- Usar el nombre de mes de la configuración regional de la aplicación.
- Mantener la fecha oculta en anchos menores de 800 px.

## Persistencia de usage

El servicio mantendrá una última instantánea válida para cada proveedor configurado.

- Una lectura con al menos una ventana válida actualiza la instantánea guardada.
- Una lectura vacía, vencida, inválida o con error conserva la instantánea guardada.
- Una actualización válida puede reemplazar una o las dos ventanas.
- Si un proveedor nunca entregó una instantánea válida, el topbar no muestra usage.
- El último usage válido permanece visible aunque pase su hora de reinicio.
- Si el proveedor deja de estar configurado, el servicio elimina su instantánea guardada.
- `updatedAt` indica solo la última lectura válida. No se actualiza en una lectura fallida o vacía.

Claude obtiene datos de un archivo de estado con validez de cinco minutos.
Codex obtiene datos de `app-server` cada 60 segundos.
Los dos proveedores aplicarán la misma regla de retención en el servicio compartido.

## Accesibilidad

- El icono del proveedor será decorativo.
- La etiqueta accesible del contenedor conserva el nombre de proveedor.
- La etiqueta accesible del anillo conserva porcentaje, ventana y reinicio.

## Pruebas

- Verificar los dos formatos de reinicio y la hora de 24 horas.
- Verificar que no aparece texto visual de proveedor.
- Verificar los iconos y las etiquetas accesibles.
- Verificar el texto blanco de etiquetas y fechas.
- Verificar la retención de Claude después de una lectura vencida o vacía.
- Verificar la retención de Codex después de un error temporal.
- Verificar que un proveedor sin lectura válida sigue oculto.
- Verificar que desconfigurar un proveedor elimina el usage retenido.
