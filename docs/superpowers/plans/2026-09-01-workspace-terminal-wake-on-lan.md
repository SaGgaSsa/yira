# Plan de implementación de Wake-on-LAN para terminal SSH

> **Para agentes de implementación:** ejecutar cada tarea mediante controles
> nativos `spawn_agent`. Usar el modelo `gpt-5.6-luna` con esfuerzo `max`.
> Usar un worktree Git aislado por tarea. Ejecutar las tareas en orden. No usar
> un skill nativo de subagentes de Superpowers. Cada paso usa `- [ ]`.

**Objetivo:** Despertar una computadora de la red local antes de abrir la
terminal OpenSSH del workspace, sin solicitar contraseña durante el chequeo.

**Arquitectura:** Guardar una configuración Wake-on-LAN dentro de la terminal
remota. El renderer solicita una preparación por workspace. El proceso principal
comprueba el puerto SSH, envía el paquete mágico cuando corresponde y espera la
disponibilidad. El renderer crea el PTY OpenSSH solo después de la preparación.

**Stack:** Electron 33, React 19, TypeScript 5.7, Node `net`, Node `dgram`,
node-pty, xterm.js 6, Node test runner, i18next.

**Especificación:**
`docs/superpowers/specs/2026-09-01-workspace-terminal-wake-on-lan-design.md`

## Restricciones globales

- La computadora local y la computadora remota están en la misma LAN.
- Wake-on-LAN está desactivado de forma predeterminada.
- No ejecutar un comando Wake-on-LAN externo.
- No agregar dependencias npm.
- No ejecutar `ssh` durante el chequeo de disponibilidad.
- No almacenar ni enviar contraseñas SSH.
- Mantener el PTY OpenSSH actual para la autenticación real.
- No escribir mensajes de preparación dentro de xterm.
- Usar timeout TCP de 1500 ms.
- Enviar tres paquetes mágicos con 250 ms entre envíos.
- Comprobar SSH cada dos segundos durante un máximo de 60 segundos.
- Mantener TypeScript estricto, indentación de dos espacios, comillas simples
  y ausencia de punto y coma.
- Agregar cada archivo de prueba nuevo al script `npm test`.
- El agente de cada tarea no debe hacer push ni crear o actualizar un PR.
- El agente principal debe revisar el diff completo y la verificación antes de
  aceptar cada tarea.
- El agente principal debe integrar la tarea aceptada antes de crear el
  worktree de la tarea siguiente.

## Estructura de archivos

- `src/shared/types.ts`: contratos Wake-on-LAN y resultados del IPC.
- `src/shared/workspaceConfig.ts`: normalización segura de configuración.
- `src/shared/workspaceConfig.test.ts`: migración y validación.
- `src/shared/workspaceManagement.ts`: persistencia desde el administrador.
- `src/shared/workspaceManagement.test.ts`: preservación en cambios masivos.
- `src/main/wake-on-lan.ts`: MAC canónica, paquete mágico y UDP.
- `src/main/wake-on-lan.test.ts`: pruebas del paquete y del emisor.
- `src/main/remote-host-readiness.ts`: chequeo TCP y espera posterior.
- `src/main/remote-host-readiness.test.ts`: pruebas deterministas del flujo.
- `src/main/ipc/workspace.ts`: lectura acotada de configuración remota.
- `src/main/ipc/terminal.ts`: IPC y deduplicación de preparaciones.
- `src/main/ipc/terminal.test.ts`: contrato estructural del IPC.
- `src/preload/index.ts`: bridge `prepareRemote`.
- `src/renderer/src/electron.d.ts`: tipo del bridge.
- `src/renderer/src/components/WorkspaceDialog.tsx`: campos y validación.
- `src/renderer/src/components/WorkspaceManagementDialog.tsx`: borradores.
- `src/renderer/src/components/TerminalTile.tsx`: preparación y overlay.
- `src/renderer/src/components/TerminalTile.test.ts`: ciclo de vida del tile.
- `src/renderer/src/i18n/resources.ts`: textos en inglés y español.
- `src/renderer/src/App.tsx`: valores iniciales y guardado.
- `package.json`: registro de pruebas nuevas.

---

### Tarea 1: Contratos y persistencia de Wake-on-LAN

**Archivos:**

- Modificar: `src/shared/types.ts`
- Modificar: `src/shared/workspaceConfig.ts`
- Modificar: `src/shared/workspaceConfig.test.ts`
- Modificar: `src/shared/workspaceManagement.ts`
- Modificar: `src/shared/workspaceManagement.test.ts`
- Modificar: `src/main/ipc/workspace.ts`
- Modificar: `src/main/ipc/workspace.test.ts`

**Interfaces:**

- Produce: `WakeOnLanConfig`.
- Produce: `RemotePreparationResult`.
- Produce: `normalizeWakeOnLanConfig(value)`.
- Produce: `getWorkspaceRemoteTerminalById(workspaceId)`.
- Conserva: `RemoteTerminalConfig.host`, `user` y `port`.

- [ ] **Paso 1: Escribir pruebas fallidas de normalización**

Agregar casos equivalentes a estos en `src/shared/workspaceConfig.test.ts`:

```ts
const wakeOnLan = normalizeWorkspaceConfig({
  remoteTerminal: {
    host: '192.168.1.40',
    user: 'dev',
    wakeOnLan: {
      enabled: true,
      macAddress: 'aa-bb-cc-dd-ee-ff',
      broadcastAddress: '192.168.1.255',
      port: 9,
    },
  },
})
if (wakeOnLan.remoteTerminal?.wakeOnLan?.macAddress !== 'AA:BB:CC:DD:EE:FF') {
  throw new Error('Wake-on-LAN MAC must use canonical form')
}

const invalidWakeOnLan = normalizeWorkspaceConfig({
  remoteTerminal: {
    host: '192.168.1.40',
    user: 'dev',
    wakeOnLan: {
      enabled: true,
      macAddress: 'invalid',
    },
  },
})
if (invalidWakeOnLan.remoteTerminal?.wakeOnLan?.enabled !== false) {
  throw new Error('invalid Wake-on-LAN config must be disabled')
}
```

Agregar casos para broadcast inválido, puerto fuera de rango, valor ausente y
configuración desactivada.

- [ ] **Paso 2: Ejecutar la prueba y confirmar el fallo**

Ejecutar:

```bash
npx tsx --test src/shared/workspaceConfig.test.ts
```

Resultado esperado: FAIL porque `WakeOnLanConfig` y su normalización no existen.

- [ ] **Paso 3: Definir los contratos compartidos**

Agregar en `src/shared/types.ts`:

```ts
export interface WakeOnLanConfig {
  enabled: boolean
  macAddress: string
  broadcastAddress?: string
  port?: number
}

export interface RemotePreparationResult {
  status: 'disabled' | 'available' | 'host-online' | 'woken'
  wakeSent: boolean
}
```

Agregar `wakeOnLan?: WakeOnLanConfig` a `RemoteTerminalConfig`.

- [ ] **Paso 4: Implementar la normalización mínima**

Exportar desde `src/shared/workspaceConfig.ts`:

```ts
export function normalizeWakeOnLanConfig(value: unknown): WakeOnLanConfig | undefined
```

Aplicar estas reglas:

- Convertir `AA-BB-CC-DD-EE-FF` a `AA:BB:CC:DD:EE:FF`.
- Usar `255.255.255.255` cuando falta broadcast y la opción está activa.
- Usar `9` cuando falta puerto y la opción está activa.
- Mantener `enabled: false` cuando el objeto existe pero está desactivado.
- Cambiar a `enabled: false` cuando MAC, broadcast o puerto son inválidos.
- No modificar el host, usuario y puerto SSH existentes.

- [ ] **Paso 5: Probar persistencia en administración y workspace IPC**

Agregar a `src/shared/workspaceManagement.test.ts` una entrada con Wake-on-LAN.
Verificar el valor canónico después de `applyWorkspaceManagementChanges`.

Agregar en `src/main/ipc/workspace.test.ts`:

```ts
test('preserves Wake-on-LAN through workspace update', () => {
  const existing = workspace('wake-on-lan')
  const updated = updateWorkspace(existing, {
    config: {
      remoteTerminal: {
        host: '192.168.1.40',
        user: 'dev',
        wakeOnLan: {
          enabled: true,
          macAddress: 'AA:BB:CC:DD:EE:FF',
        },
      },
    },
  })

  assert.equal(updated.config.remoteTerminal?.wakeOnLan?.enabled, true)
  assert.equal(updated.config.remoteTerminal?.wakeOnLan?.port, 9)
})
```

- [ ] **Paso 6: Agregar la lectura acotada para el proceso principal**

Exportar desde `src/main/ipc/workspace.ts`:

```ts
export async function getWorkspaceRemoteTerminalById(
  workspaceId: string,
): Promise<RemoteTerminalConfig | null>
```

Leer la configuración normalizada. Devolver `null` si el workspace o la
terminal remota no existen.

- [ ] **Paso 7: Ejecutar las pruebas de la tarea**

Ejecutar:

```bash
npx tsx --test src/shared/workspaceConfig.test.ts src/shared/workspaceManagement.test.ts src/main/ipc/workspace.test.ts
npx tsc --noEmit
```

Resultado esperado: PASS.

- [ ] **Paso 8: Crear commit local de la tarea**

```bash
git add src/shared/types.ts src/shared/workspaceConfig.ts src/shared/workspaceConfig.test.ts src/shared/workspaceManagement.ts src/shared/workspaceManagement.test.ts src/main/ipc/workspace.ts src/main/ipc/workspace.test.ts
git commit -m "feat: persist terminal Wake-on-LAN settings"
```

No hacer push. Entregar SHA, diff completo y salida de verificación al agente
principal.

---

### Tarea 2: Paquete mágico y emisor UDP

**Archivos:**

- Crear: `src/main/wake-on-lan.ts`
- Crear: `src/main/wake-on-lan.test.ts`
- Modificar: `package.json`

**Interfaces:**

- Consume: `WakeOnLanConfig`.
- Produce: `parseMacAddress(macAddress): Uint8Array`.
- Produce: `buildMagicPacket(macAddress): Buffer`.
- Produce: `sendWakeOnLan(config, dependencies?): Promise<void>`.

- [ ] **Paso 1: Registrar la prueba nueva**

Agregar `src/main/wake-on-lan.test.ts` al script `npm test`. No cambiar otro
comando del script.

- [ ] **Paso 2: Escribir la prueba fallida del paquete**

Crear `src/main/wake-on-lan.test.ts` con Node test runner. Incluir:

```ts
test('builds the 102-byte Wake-on-LAN magic packet', () => {
  const packet = buildMagicPacket('AA:BB:CC:DD:EE:FF')
  const mac = Buffer.from('AABBCCDDEEFF', 'hex')

  assert.equal(packet.length, 102)
  assert.deepEqual(packet.subarray(0, 6), Buffer.alloc(6, 0xff))
  for (let offset = 6; offset < packet.length; offset += 6) {
    assert.deepEqual(packet.subarray(offset, offset + 6), mac)
  }
})
```

Agregar una prueba que rechace `AA:BB:CC:DD:EE`.

- [ ] **Paso 3: Ejecutar la prueba y confirmar el fallo**

```bash
npx tsx --test src/main/wake-on-lan.test.ts
```

Resultado esperado: FAIL porque el módulo no existe.

- [ ] **Paso 4: Implementar la construcción del paquete**

Implementar las firmas indicadas. Crear seis bytes `FF`. Copiar la MAC dieciséis
veces. Lanzar `Invalid Wake-on-LAN MAC address` para entradas inválidas.

- [ ] **Paso 5: Escribir pruebas fallidas del emisor UDP**

Definir una dependencia inyectable con estas operaciones:

```ts
export interface WakeOnLanSocket {
  bind: (callback: () => void) => void
  setBroadcast: (enabled: boolean) => void
  send: (
    message: Uint8Array,
    port: number,
    address: string,
    callback: (error: Error | null) => void,
  ) => void
  close: () => void
}
```

Probar que `sendWakeOnLan`:

- activa broadcast;
- envía tres paquetes al broadcast y puerto normalizados;
- espera 250 ms entre envíos mediante una función `delay` inyectada;
- cierra el socket una sola vez;
- cierra el socket cuando `send` devuelve un error.

- [ ] **Paso 6: Implementar el emisor UDP**

Usar `createSocket('udp4')` como dependencia predeterminada. Hacer `bind(0)`
antes de `setBroadcast(true)`. Enviar en serie. Usar `try/finally` para cerrar.

- [ ] **Paso 7: Ejecutar las pruebas de la tarea**

```bash
npx tsx --test src/main/wake-on-lan.test.ts
npx tsc --noEmit
```

Resultado esperado: PASS.

- [ ] **Paso 8: Crear commit local de la tarea**

```bash
git add src/main/wake-on-lan.ts src/main/wake-on-lan.test.ts package.json
git commit -m "feat: send Wake-on-LAN magic packets"
```

No hacer push. Entregar SHA, diff completo y salida de verificación.

---

### Tarea 3: Chequeo TCP y espera de OpenSSH

**Archivos:**

- Crear: `src/main/remote-host-readiness.ts`
- Crear: `src/main/remote-host-readiness.test.ts`
- Modificar: `package.json`

**Interfaces:**

- Consume: `RemoteTerminalConfig` y `sendWakeOnLan`.
- Produce: `RemoteSshProbeResult`.
- Produce: `probeRemoteSsh(target, dependencies?): Promise<RemoteSshProbeResult>`.
- Produce: `ensureRemoteSshReady(target, dependencies?): Promise<RemotePreparationResult>`.

- [ ] **Paso 1: Registrar la prueba nueva**

Agregar `src/main/remote-host-readiness.test.ts` al script `npm test`.

- [ ] **Paso 2: Escribir pruebas fallidas del chequeo TCP**

Usar un creador de socket inyectable. Probar:

```ts
test('classifies a successful TCP connection as available', async () => {
  const result = await probeRemoteSsh(
    { host: '192.168.1.40', port: 22 },
    { createConnection: fakeConnectionThatEmitsConnect },
  )

  assert.equal(result, 'available')
  assert.equal(socketDestroyed, true)
})
```

Agregar casos para `ECONNREFUSED`, `EHOSTUNREACH`, `ENETUNREACH`, `ENOTFOUND`
y timeout. Verificar que cada caso destruye el socket y completa una sola vez.

- [ ] **Paso 3: Implementar el chequeo TCP**

Definir:

```ts
export type RemoteSshProbeResult =
  | 'available'
  | 'refused'
  | 'unreachable'
  | 'invalid-host'
```

Usar el puerto SSH configurado o `22`. Usar 1500 ms como timeout predeterminado.
No escribir datos en el socket.

- [ ] **Paso 4: Escribir pruebas fallidas de orquestación**

Probar estas secuencias con dependencias inyectadas:

```ts
test('wakes an unreachable host and waits until SSH is available', async () => {
  const probes: RemoteSshProbeResult[] = ['unreachable', 'refused', 'available']
  const result = await ensureRemoteSshReady(config, {
    probe: async () => probes.shift() ?? 'available',
    wake: async () => { wakeCalls += 1 },
    delay: async () => undefined,
    now: () => clock,
  })

  assert.deepEqual(result, { status: 'woken', wakeSent: true })
  assert.equal(wakeCalls, 1)
})
```

Agregar casos para:

- Wake-on-LAN desactivado;
- `available` inicial;
- `refused` inicial sin envío;
- `invalid-host` inicial;
- error de envío UDP;
- timeout después de 60 segundos.

- [ ] **Paso 5: Implementar la orquestación mínima**

Aplicar el flujo de la especificación. Usar una dependencia `now` y una
dependencia `delay` para que las pruebas no esperen tiempo real. Devolver:

```ts
{ status: 'disabled', wakeSent: false }
{ status: 'available', wakeSent: false }
{ status: 'host-online', wakeSent: false }
{ status: 'woken', wakeSent: true }
```

Usar mensajes de error estables para host inválido, error UDP y timeout.

- [ ] **Paso 6: Ejecutar las pruebas de la tarea**

```bash
npx tsx --test src/main/remote-host-readiness.test.ts src/main/wake-on-lan.test.ts
npx tsc --noEmit
```

Resultado esperado: PASS.

- [ ] **Paso 7: Crear commit local de la tarea**

```bash
git add src/main/remote-host-readiness.ts src/main/remote-host-readiness.test.ts package.json
git commit -m "feat: prepare remote SSH hosts"
```

No hacer push. Entregar SHA, diff completo y salida de verificación.

---

### Tarea 4: IPC de preparación y deduplicación

**Archivos:**

- Modificar: `src/main/ipc/terminal.ts`
- Modificar: `src/main/ipc/terminal.test.ts`
- Modificar: `src/preload/index.ts`
- Modificar: `src/renderer/src/electron.d.ts`

**Interfaces:**

- Consume: `getWorkspaceRemoteTerminalById` y `ensureRemoteSshReady`.
- Produce: canal `terminal:prepareRemote`.
- Produce: `window.electron.terminal.prepareRemote(workspaceId)`.

- [ ] **Paso 1: Escribir pruebas fallidas del IPC**

Agregar a `src/main/ipc/terminal.test.ts` verificaciones estructurales:

```ts
test('prepares a remote host from persisted workspace config', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /ipcMain\.handle\('terminal:prepareRemote'/)
  assert.match(text, /getWorkspaceRemoteTerminalById/)
  assert.match(text, /ensureRemoteSshReady/)
  assert.match(text, /remotePreparations/)
  assert.match(text, /\.finally\(/)
})
```

Agregar verificaciones del bridge y del tipo renderer. El handler no debe
aceptar host, MAC, broadcast ni puerto desde el renderer.

- [ ] **Paso 2: Ejecutar la prueba y confirmar el fallo**

```bash
npx tsx --test src/main/ipc/terminal.test.ts
```

Resultado esperado: FAIL porque el canal no existe.

- [ ] **Paso 3: Implementar el handler del proceso principal**

Agregar un mapa:

```ts
const remotePreparations = new Map<string, Promise<RemotePreparationResult>>()
```

El handler debe:

1. Normalizar `workspaceId` con la validación de terminal existente.
2. Cargar `RemoteTerminalConfig` desde el workspace.
3. Devolver `disabled` si Wake-on-LAN no está activo.
4. Crear una clave con workspace, host, puerto SSH y MAC.
5. Reutilizar una promesa activa para la misma clave.
6. Eliminar la promesa en `finally` solo si sigue siendo la promesa registrada.
7. Propagar errores estables al renderer.

- [ ] **Paso 4: Exponer el bridge tipado**

Agregar en preload:

```ts
prepareRemote: (workspaceId: string) =>
  ipcRenderer.invoke('terminal:prepareRemote', workspaceId) as Promise<RemotePreparationResult>,
```

Agregar la misma firma a `src/renderer/src/electron.d.ts`.

- [ ] **Paso 5: Ejecutar las pruebas de la tarea**

```bash
npx tsx --test src/main/ipc/terminal.test.ts
npx tsc --noEmit
```

Resultado esperado: PASS.

- [ ] **Paso 6: Crear commit local de la tarea**

```bash
git add src/main/ipc/terminal.ts src/main/ipc/terminal.test.ts src/preload/index.ts src/renderer/src/electron.d.ts
git commit -m "feat: expose remote host preparation"
```

No hacer push. Entregar SHA, diff completo y salida de verificación.

---

### Tarea 5: Formulario, estado visual y ciclo del tile

**Archivos:**

- Modificar: `src/renderer/src/components/WorkspaceDialog.tsx`
- Modificar: `src/renderer/src/components/WorkspaceManagementDialog.tsx`
- Modificar: `src/renderer/src/components/TerminalTile.tsx`
- Modificar: `src/renderer/src/components/TerminalTile.test.ts`
- Modificar: `src/renderer/src/i18n/resources.ts`
- Modificar: `src/renderer/src/App.tsx`

**Interfaces:**

- Consume: `WakeOnLanConfig`, `RemotePreparationResult` y bridge `prepareRemote`.
- Produce: formulario persistente.
- Produce: overlay de preparación.
- Conserva: `terminal:create`, reattach y reconexión actuales.

- [ ] **Paso 1: Escribir pruebas fallidas del ciclo del tile**

Exportar desde `TerminalTile.tsx` un helper puro con esta interfaz:

```ts
export interface RemoteTerminalPreparationOptions {
  isCancelled: () => boolean
  prepare: () => Promise<RemotePreparationResult>
  create: () => Promise<void>
}

export async function prepareRemoteTerminal(
  options: RemoteTerminalPreparationOptions,
): Promise<void>
```

Agregar el helper al import existente de `TerminalTile.test.ts`. Probar que:

```ts
test('does not create SSH after remote preparation when the tile was cancelled', async () => {
  let cancelled = false
  let createCalls = 0
  let resolvePreparation!: (result: RemotePreparationResult) => void
  const preparation = new Promise<RemotePreparationResult>((resolve) => {
    resolvePreparation = resolve
  })

  const start = prepareRemoteTerminal({
    isCancelled: () => cancelled,
    prepare: () => preparation,
    create: async () => { createCalls += 1 },
  })

  cancelled = true
  resolvePreparation({ status: 'woken', wakeSent: true })
  await start
  assert.equal(createCalls, 0)
})
```

Agregar un caso que crea exactamente una terminal después de una preparación
exitosa. Agregar un caso que propaga el error sin crear el PTY. Implementar el
helper después del fallo con este comportamiento mínimo:

```ts
export async function prepareRemoteTerminal(
  options: RemoteTerminalPreparationOptions,
): Promise<void> {
  await options.prepare()
  if (options.isCancelled()) return
  await options.create()
}
```

- [ ] **Paso 2: Ejecutar la prueba y confirmar el fallo**

```bash
npx tsx --test src/renderer/src/components/TerminalTile.test.ts
```

Resultado esperado: FAIL porque el flujo de preparación no existe.

- [ ] **Paso 3: Agregar los campos del formulario**

Dentro de la sección `remoteTerminal` agregar:

- checkbox `Wake-on-LAN`;
- MAC obligatoria cuando está activo;
- broadcast opcional con placeholder `255.255.255.255`;
- puerto UDP opcional con placeholder `9`.

Desactivar la confirmación cuando la opción está activa y la MAC o el
broadcast son inválidos. Mantener los valores al editar un workspace. Pasar
los valores en `normalizeValue`, `workspaceToDraft`, `draftToDialogValue`,
`dialogValueToDraftValue`, creación, actualización y administración masiva.

- [ ] **Paso 4: Agregar textos en inglés y español**

Agregar claves tipadas para:

```text
wakeOnLan
wakeOnLanMacAddress
wakeOnLanBroadcastAddress
wakeOnLanUdpPort
wakeOnLanPreparing
wakeOnLanInvalidMac
wakeOnLanInvalidBroadcast
```

Usar textos literales. No mencionar Tailscale en esta función.

- [ ] **Paso 5: Preparar el host antes de crear el PTY**

En el efecto de `TerminalTile`:

1. Crear xterm como en el flujo actual.
2. Marcar el estado `preparing` solo para SSH con Wake-on-LAN activo.
3. Invocar `prepareRemote(activeWorkspaceId)`.
4. Comprobar `cancelled` después del `await`.
5. Ejecutar `terminal.create` solo si el tile sigue montado.
6. Limpiar `preparing` cuando inicia la creación o cuando hay error.
7. Usar el catch actual para mostrar el error de inicio.

No escribir el estado de preparación con `term.write`.

- [ ] **Paso 6: Mostrar el overlay de preparación**

Reutilizar el estilo de `RemoteTerminalReconnectNotice`. Mostrar un spinner y
`Preparando computadora remota…`. No mostrar un botón durante la espera. El
overlay debe tener `role="status"` y `aria-live="polite"`.

El botón `Reconectar` debe mantener su flujo actual de destruir y remontar el
tile. El nuevo efecto debe ejecutar la preparación otra vez.

- [ ] **Paso 7: Ejecutar las pruebas de la tarea**

```bash
npx tsx --test src/renderer/src/components/TerminalTile.test.ts src/shared/workspaceConfig.test.ts src/shared/workspaceManagement.test.ts
npx tsc --noEmit
```

Resultado esperado: PASS.

- [ ] **Paso 8: Crear commit local de la tarea**

```bash
git add src/renderer/src/components/WorkspaceDialog.tsx src/renderer/src/components/WorkspaceManagementDialog.tsx src/renderer/src/components/TerminalTile.tsx src/renderer/src/components/TerminalTile.test.ts src/renderer/src/i18n/resources.ts src/renderer/src/App.tsx
git commit -m "feat: prepare SSH terminals with Wake-on-LAN"
```

No hacer push. Entregar SHA, diff completo y salida de verificación.

---

### Tarea 6: Verificación integrada y prueba en LAN

**Archivos:**

- Modificar solo si una prueba detecta un defecto dentro del alcance.

**Interfaces:**

- Consume: implementación integrada de las tareas 1 a 5.
- Produce: evidencia automatizada y manual.

- [ ] **Paso 1: Revisar el diff integrado**

Ejecutar:

```bash
git status --short
git diff --check
git diff --stat
```

Confirmar que no existen cambios en `dist-electron/` ni `release/`. Confirmar
que no existen dependencias npm nuevas.

- [ ] **Paso 2: Ejecutar las pruebas específicas**

```bash
npx tsx --test src/main/wake-on-lan.test.ts src/main/remote-host-readiness.test.ts src/main/ipc/terminal.test.ts src/main/ipc/workspace.test.ts src/shared/workspaceConfig.test.ts src/shared/workspaceManagement.test.ts src/renderer/src/components/TerminalTile.test.ts
```

Resultado esperado: todas las pruebas muestran PASS.

- [ ] **Paso 3: Ejecutar la verificación requerida del repositorio**

```bash
npx tsc --noEmit
npm test
npm run build
```

Resultado esperado: los tres comandos terminan con código `0`.

- [ ] **Paso 4: Verificar el host encendido**

Ejecutar `npm run dev`. Configurar MAC, broadcast y puerto UDP. Mantener la
computadora remota encendida. Crear un tile SSH.

Resultado esperado:

- el overlay aparece durante un intervalo corto;
- no se envía Wake-on-LAN;
- OpenSSH inicia;
- la contraseña se solicita una sola vez dentro de xterm.

- [ ] **Paso 5: Verificar el host apagado o suspendido**

Apagar o suspender la computadora remota con Wake-on-LAN habilitado. Crear un
tile SSH.

Resultado esperado:

- el overlay muestra la preparación;
- la computadora se enciende;
- Yira espera a OpenSSH;
- la terminal aparece sin acción adicional;
- la contraseña se solicita solo cuando inicia OpenSSH.

- [ ] **Paso 6: Verificar timeout y reconexión**

Probar una MAC incorrecta o desactivar Wake-on-LAN en la computadora remota.
Confirmar el error después de 60 segundos. Restaurar la MAC. Pulsar
`Reconectar`.

Resultado esperado: el reintento ejecuta la preparación completa y crea una
sola sesión PTY.

- [ ] **Paso 7: Registrar la evidencia**

Guardar en el handoff:

- comandos ejecutados;
- códigos de salida;
- sistema operativo local y remoto;
- tipo de conexión remota, Ethernet o Wi-Fi;
- broadcast y puerto UDP usados;
- resultado de host encendido, host apagado, timeout y reconexión.

No crear un commit adicional si no hubo cambios. No hacer push. No crear un PR.
