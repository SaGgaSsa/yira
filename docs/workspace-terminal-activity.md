# Actividad de terminales por workspace

La lista izquierda muestra un indicador de actividad en lugar del icono de vista.
Las pestañas de terminal y los encabezados de lienzo y cuadrícula usan el mismo indicador.

## Regla de prioridad

Se aplica la primera condición que se cumple. El orden de los tiles no cambia el resultado.

| Prioridad | Estado | Condición | Icono |
| --- | --- | --- | --- |
| 1 | Requiere intervención | Al menos un agente informa `needs-input`. | Interrogación, color de advertencia. |
| 2 | Trabajando | Al menos un agente informa `working`. | Indicador giratorio, color de acento. |
| 3 | Actividad sin revisar | El contador de salida sin revisar es mayor que cero. | Punto circular. |
| 4 | Actividad finalizada | Al menos un agente informa `done`. | Marca de verificación, color de éxito. |
| 5 | Sin actividad detectada | No se cumple ninguna condición anterior. | Terminal, color atenuado. |

El indicador siempre ocupa el mismo lugar. Al pasar el cursor muestra el estado y los recuentos.
El texto también está disponible para lectores de pantalla.
La animación respeta la preferencia de movimiento reducido del sistema.

## Alcance y actualización

- El workspace combina las sesiones de todos sus terminales. Incluye sesiones de agentes en segundo plano y en ventanas separadas.
- Un tile muestra solo su propia sesión y su contador de salida.
- Un estado `exited` no se interpreta como finalización correcta.
- Un workspace sin sesiones ni salida pendiente muestra el estado atenuado.
- Las notas, archivos, navegadores y temporizadores no aportan estados de terminal.
- Los estados de agentes proceden de los eventos existentes. No se deduce un porcentaje de avance.
- Los terminales sin estado de agente aportan actividad mediante el contador existente de salida sin revisar. La salida no prueba que un comando siga ejecutándose.
- El contador conserva las reglas existentes de foco, lectura y silencio de notificaciones.
- «Actividad finalizada» indica una finalización informada. No afirma que todos los comandos del workspace terminaron correctamente.
- Abrir o cerrar el panel de agentes no interrumpe las actualizaciones. Todos los consumidores comparten una suscripción global por ventana.
