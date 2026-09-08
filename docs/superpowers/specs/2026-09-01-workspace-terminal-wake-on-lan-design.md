# Diseño de Wake-on-LAN para terminal SSH del workspace

## Objetivo

Permitir que una terminal SSH de un workspace despierte la computadora remota
antes de iniciar OpenSSH. Evitar una solicitud de contraseña durante el chequeo
de disponibilidad.

## Supuestos confirmados

- La computadora que ejecuta Yira está en la misma red local que la computadora
  remota.
- La computadora remota acepta Wake-on-LAN.
- La computadora remota expone OpenSSH cuando termina de iniciar.
- La autenticación SSH actual debe continuar dentro del PTY.

## Alcance

- Agregar una opción Wake-on-LAN a la configuración de terminal remota.
- Guardar la dirección MAC del adaptador remoto.
- Permitir una dirección broadcast IPv4 y un puerto UDP opcionales.
- Comprobar el puerto SSH sin ejecutar el cliente `ssh`.
- Enviar un paquete mágico cuando el host no es alcanzable.
- Esperar hasta que el puerto SSH esté disponible.
- Iniciar la terminal SSH actual después de la preparación.
- Aplicar el mismo flujo al crear y reconectar un tile remoto.
- Mostrar un estado no interactivo durante la preparación.

## Fuera de alcance

- Wake-on-LAN por Tailscale, internet o redes diferentes.
- Descubrimiento automático de la dirección MAC.
- Configuración del BIOS, firmware, adaptador o sistema operativo remoto.
- Ejecución de un comando Wake-on-LAN externo.
- Almacenamiento de contraseñas SSH.
- Cambio del cliente OpenSSH, sus claves o su verificación de host.
- Apagado o suspensión remota.

## Configuración persistida

Extender `RemoteTerminalConfig` con una configuración opcional:

```ts
export interface WakeOnLanConfig {
  enabled: boolean
  macAddress: string
  broadcastAddress?: string
  port?: number
}

export interface RemoteTerminalConfig {
  host: string
  user: string
  port?: number
  wakeOnLan?: WakeOnLanConfig
}
```

La interfaz debe mostrar estos valores:

- `Wake-on-LAN`: desactivado de forma predeterminada.
- `Dirección MAC`: obligatoria cuando la opción está activada.
- `Dirección broadcast`: valor visual y efectivo
  `255.255.255.255` cuando está vacía.
- `Puerto UDP`: valor visual y efectivo `9` cuando está vacío.

La normalización debe aceptar los formatos MAC con `:` o `-`. Debe guardar
el formato canónico `AA:BB:CC:DD:EE:FF`. Debe rechazar una MAC incompleta. Debe
rechazar una dirección broadcast que no sea un literal IPv4. Debe aceptar
puertos entre `1` y `65535`.

## Chequeo sin autenticación

El proceso principal debe usar `node:net` para abrir un socket TCP al host y
puerto SSH. Debe destruir el socket cuando ocurre `connect`. No debe ejecutar
`ssh`. No debe enviar credenciales ni datos de protocolo.

El resultado debe distinguir estos estados:

- `available`: el puerto SSH aceptó el socket.
- `refused`: el host respondió, pero el puerto SSH rechazó el socket.
- `unreachable`: ocurrió timeout, `EHOSTUNREACH` o `ENETUNREACH`.
- `invalid-host`: el nombre no se pudo resolver o la entrada es inválida.

El estado `refused` indica que la computadora está encendida. Yira no debe
enviar Wake-on-LAN en este estado. Debe continuar con OpenSSH para conservar
su diagnóstico actual.

## Paquete mágico

El proceso principal debe usar `node:dgram`. El paquete debe contener seis
bytes `FF` y dieciséis repeticiones de los seis bytes de la MAC. El tamaño
total debe ser 102 bytes.

Yira debe habilitar broadcast en el socket UDP. Debe enviar tres paquetes. Debe
esperar 250 ms entre envíos. Debe cerrar el socket en éxito y en error.

## Flujo de preparación

1. `TerminalTile` detecta una terminal `remote-ssh` con Wake-on-LAN activado.
2. El renderer muestra `Preparando computadora remota…`.
3. El renderer invoca `terminal:prepareRemote` con el ID del workspace.
4. El proceso principal carga la configuración persistida del workspace.
5. El proceso principal ejecuta un chequeo TCP con timeout de 1500 ms.
6. Si el resultado es `available`, termina la preparación.
7. Si el resultado es `refused`, termina la preparación sin enviar el paquete.
8. Si el resultado es `invalid-host`, devuelve un error.
9. Si el resultado es `unreachable`, envía los tres paquetes mágicos.
10. Después del envío, comprueba SSH cada dos segundos.
11. La espera termina cuando SSH está `available`.
12. Durante la espera posterior al paquete, `refused` significa que el sistema
    inició pero OpenSSH todavía no está listo. La espera debe continuar.
13. La espera falla después de 60 segundos.
14. El renderer verifica que el tile siga montado.
15. El renderer ejecuta `terminal:create` sin cambiar el flujo OpenSSH actual.

El IPC de preparación debe recibir solo `workspaceId`. El proceso principal
debe leer el host, puerto, MAC y broadcast desde la configuración persistida.
Esto evita confiar en una configuración de red enviada por el renderer.

## Concurrencia y ciclo de vida

El proceso principal debe compartir una preparación activa por workspace,
host, puerto SSH y MAC. Dos tiles simultáneos deben esperar la misma promesa.
El mapa debe eliminar la promesa en `finally`.

La espera debe ocurrir antes de `terminal:create`. Si el componente se desmonta,
el renderer no debe crear un PTY cuando la preparación termina. El chequeo de
red puede terminar en segundo plano. No debe crear una sesión huérfana.

Una sesión PTY ya existente conserva el flujo de reattach actual. Wake-on-LAN
no cambia `TerminalSessionIdentity`, `TerminalDelivery` ni el cierre de sesiones.

## Errores visibles

- Configuración inválida: impedir guardar el formulario.
- Host inválido: mostrar `No se pudo resolver el host remoto`.
- Envío UDP fallido: mostrar `No se pudo enviar Wake-on-LAN`.
- Timeout de inicio: mostrar `La computadora remota no habilitó SSH en 60 segundos`.
- Error OpenSSH posterior: conservar la salida actual del cliente dentro de xterm.

El estado de preparación debe usar un overlay. No debe escribir texto sintético
dentro del flujo PTY.

## Pruebas

- Normalización y persistencia de la configuración.
- Validación de MAC, broadcast y puerto.
- Construcción exacta del paquete de 102 bytes.
- Cierre del socket UDP en éxito y error.
- Clasificación del chequeo TCP.
- Host disponible sin Wake-on-LAN.
- Host con puerto rechazado sin Wake-on-LAN.
- Host no alcanzable, envío y espera exitosa.
- Timeout después del envío.
- Deduplicación de preparaciones simultáneas.
- Cancelación del renderer antes de crear el PTY.
- Creación y reconexión remota.
- Verificación manual con una computadora real en la misma LAN.
