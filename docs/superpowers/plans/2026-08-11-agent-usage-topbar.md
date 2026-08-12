# Agent Usage Topbar Implementation Plan

> **Para agentes:** Usa tareas nativas de Codex con `gpt-5.6-luna` y esfuerzo `max`. Usa un worktree aislado por tarea. No uses un subagente de Superpowers.

**Goal:** Mostrar un usage legible con logos oficiales y conservar el último usage válido de Claude y Codex.

**Architecture:** `AgentUsageService` conserva la última instantánea válida por proveedor. Las lecturas vacías, vencidas o con error no reemplazan una instantánea disponible. `AgentUsageIndicator` formatea cada fecha por tipo de ventana y usa recursos SVG locales para identificar el proveedor.

**Tech Stack:** Electron, TypeScript estricto, React 19, Tailwind CSS, Node test runner, `tsx`.

## Global Constraints

- No añadir dependencias.
- No exponer contenido de archivos de Claude al renderer.
- No modificar `~/.claude` ni crear un caché persistente de Yira.
- Usar SVG originales de las fuentes oficiales. No redibujar, recortar o recolorear los logos.
- Mostrar `↻ HH:mm` para cinco horas y `↻ DD mes HH:mm` para semanal.
- Usar hora local de 24 horas.
- Mantener los reinicios ocultos bajo 800 px.
- Mantener ámbar desde 70 % y rojo desde 90 % para porcentaje y anillo.
- Conservar usage hasta una lectura válida nueva o hasta desconfigurar el proveedor.
- Ejecutar `npx tsc --noEmit` antes de entregar cambios.

---

### Task 1: Retener snapshots válidos de usage

**Files:**
- Modify: `src/main/agentUsage.ts`
- Test: `src/main/agentUsage.test.ts`

**Interfaces:**
- Consumes: `AgentUsageProviderReader`, `AgentUsageProviderSnapshot`, `stateToSnapshot()`.
- Produces: `AgentUsageService.getSnapshot()` conserva el último snapshot disponible para un proveedor configurado después de una lectura inválida, vacía, vencida o fallida.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar estas pruebas en `src/main/agentUsage.test.ts`:

```ts
test('retains the last valid Claude usage when the passive reader returns no snapshot', async () => {
  const reads = [
    { status: 'available', windows: [{ kind: 'fiveHour', usedPercent: 42, resetsAt: '2026-08-11T18:00:00.000Z' }] },
    null,
  ]
  const service = new AgentUsageService({
    getConfiguredProviders: () => ['claude'],
    now: () => Date.parse('2026-08-11T15:00:00.000Z'),
    providerReaders: { claude: () => reads.shift() },
  })

  await service.start()
  const first = service.getSnapshot().claude
  await service.refresh()

  assert.deepEqual(service.getSnapshot().claude, first)
  await service.stop()
})

test('retains the last valid Codex usage after a rate-limit read error', async () => {
  const client = new FakeCodexClient(fullRateLimits(), Promise.reject(new Error('temporary failure')))
  const service = new AgentUsageService({
    getConfiguredProviders: () => ['codex'],
    codexClientFactory: async () => client,
  })

  await service.start()
  const first = service.getSnapshot().codex
  await service.refresh()

  assert.deepEqual(service.getSnapshot().codex, first)
  await service.stop()
})
```

Agregar una tercera prueba con una variable `configured = true`. El lector de Claude debe entregar un snapshot válido. Cambiar `configured` a `false`, llamar `refresh()`, y afirmar `status === 'unavailable'` y `windows` vacío.

- [ ] **Step 2: Ejecutar las pruebas para verificar el fallo**

Run: `npx tsx --test src/main/agentUsage.test.ts`

Expected: FAIL. La prueba de Claude muestra un snapshot `unavailable` después de `null`. La prueba de Codex muestra `unavailable` después del error.

- [ ] **Step 3: Implementar la retención mínima**

En `src/main/agentUsage.ts`, agregar un helper privado que devuelva una copia del snapshot previo solo si su estado es `available`; de otro modo debe devolver `unavailableSnapshot(provider)`.

```ts
function retainedSnapshot(
  provider: AgentProvider,
  previous: AgentUsageProviderSnapshot,
): AgentUsageProviderSnapshot {
  return previous.status === 'available'
    ? cloneProviderSnapshot(previous)
    : unavailableSnapshot(provider)
}
```

Aplicar el helper en estas rutas:

```ts
// refreshInternal(), lector Claude
const candidate = sanitizeProviderSnapshot(provider, await reader())
next[provider] = candidate.status === 'available'
  ? { ...candidate, ...(snapshotTimestamp(this.now) ? { updatedAt: snapshotTimestamp(this.now) } : {}) }
  : retainedSnapshot(provider, this.snapshot[provider])

// readCodex(), cuando no hay cliente o request() falla
return retainedSnapshot('codex', this.snapshot.codex)
```

Para una respuesta normal de Codex, construir `candidateState` y `candidateSnapshot` antes de asignar `this.codexRawState`. Asignar el estado nuevo solo si `candidateSnapshot.status === 'available'`. Si no lo está, devolver `retainedSnapshot('codex', this.snapshot.codex)`.

En `handleCodexNotification()`, combinar el estado, construir el snapshot candidato y actualizar `codexRawState`, `snapshot` y `updatedAt` solo si el candidato tiene estado `available` y el estado combinado cambió. Las notificaciones sin campos válidos no deben modificar `updatedAt`.

No cambiar `emptySnapshot()`. `refreshInternal()` debe seguir empezando con un snapshot vacío. Por eso un proveedor no configurado elimina el dato retenido.

- [ ] **Step 4: Ejecutar las pruebas para verificar el paso**

Run: `npx tsx --test src/main/agentUsage.test.ts`

Expected: PASS. Todas las pruebas de `agentUsage` pasan.

- [ ] **Step 5: Revisar el cambio**

Run: `git diff --check -- src/main/agentUsage.ts src/main/agentUsage.test.ts`

Expected: exit code 0.

### Task 2: Actualizar el indicador del topbar y añadir logos oficiales

**Files:**
- Create: `src/renderer/public/agent-provider-logos/openai.svg`
- Create: `src/renderer/public/agent-provider-logos/anthropic.svg`
- Modify: `src/renderer/src/components/AgentUsageIndicator.tsx`
- Test: `src/renderer/src/components/AgentUsageIndicator.test.tsx`

**Interfaces:**
- Consumes: `AgentProvider`, `AgentUsageWindow`, recursos públicos `/agent-provider-logos/{openai|anthropic}.svg`.
- Produces: `formatUsageResetAt(kind, value, options?)` y el renderizado de `AgentUsageIndicator` sin texto visual del proveedor.

- [ ] **Step 1: Añadir las pruebas que fallan**

Exportar `formatUsageResetAt` para probarlo. Agregar las pruebas:

```ts
test('formats five-hour reset times with a 24-hour clock only', () => {
  assert.equal(formatUsageResetAt('fiveHour', '2026-08-12T15:30:00.000Z', { locale: 'en-GB', timeZone: 'UTC' }), '15:30')
})

test('formats weekly reset times as day, month, and 24-hour time', () => {
  assert.equal(formatUsageResetAt('weekly', '2026-08-12T15:30:00.000Z', { locale: 'en-GB', timeZone: 'UTC' }), '12 Aug 15:30')
})
```

En los tests existentes, cambiar las aserciones del proveedor para comprobar `aria-label="Codex usage"` o `aria-label="Claude usage"`, `src="/agent-provider-logos/openai.svg"` o `src="/agent-provider-logos/anthropic.svg"`, y ausencia de `>Codex</span>` y `>Claude</span>`. Comprobar que `data-usage-window-label` y `data-usage-reset` tienen `text-text-primary`.

- [ ] **Step 2: Ejecutar las pruebas para verificar el fallo**

Run: `npx tsx --test src/renderer/src/components/AgentUsageIndicator.test.tsx`

Expected: FAIL. No existe `formatUsageResetAt`. El markup aún contiene el texto del proveedor y no contiene los recursos SVG.

- [ ] **Step 3: Añadir recursos e implementación mínima**

Descargar el Blossom SVG con el botón **Descargar logotipos** de la guía oficial de OpenAI. Guardar la variante oficial apta para fondo oscuro sin modificarla en `src/renderer/public/agent-provider-logos/openai.svg`.

Obtener el SVG del símbolo de Anthropic desde su sitio oficial. Guardarlo sin modificarlo en `src/renderer/public/agent-provider-logos/anthropic.svg`. Confirmar que ambos archivos son SVG y no contienen scripts, enlaces externos o texto visible de marca.

Eliminar `Code2`, `Sparkles` y el mapa `providerDetails.Icon`. Reemplazarlos por el mapa:

```ts
const providerDetails: Record<AgentProvider, { label: string; logoPath: string }> = {
  codex: { label: 'Codex', logoPath: '/agent-provider-logos/openai.svg' },
  claude: { label: 'Claude', logoPath: '/agent-provider-logos/anthropic.svg' },
}
```

Agregar este formateador. El objeto opcional permite pruebas independientes de idioma y zona horaria. La producción lo invoca sin opciones.

```ts
export function formatUsageResetAt(
  kind: AgentUsageWindowKind,
  value: AgentUsageWindow['resetsAt'],
  options: { locale?: string; timeZone?: string } = {},
): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const format = new Intl.DateTimeFormat(options.locale, {
    day: kind === 'weekly' ? '2-digit' : undefined,
    month: kind === 'weekly' ? 'short' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: options.timeZone,
  })
  const parts = format.formatToParts(date)
  const time = `${parts.find((part) => part.type === 'hour')?.value}:${parts.find((part) => part.type === 'minute')?.value}`
  if (kind === 'fiveHour') return time
  const day = parts.find((part) => part.type === 'day')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return day && month ? `${day} ${month} ${time}` : null
}
```

Actualizar `UsageWindow` para llamar `formatUsageResetAt(window.kind, window.resetsAt)`. Mantener el prefijo visual `↻ `. Aplicar `text-text-primary` a la etiqueta de ventana y al reinicio. Reemplazar la identidad visible por:

```tsx
<img
  className="h-[13px] w-[13px] shrink-0"
  src={details.logoPath}
  alt=""
  aria-hidden="true"
  data-provider-logo="true"
/>
```

Mantener el `aria-label` existente del contenedor y el `aria-label` del anillo. No cambiar el cálculo de porcentaje, umbrales, anillo ni reglas responsive.

- [ ] **Step 4: Ejecutar las pruebas para verificar el paso**

Run: `npx tsx --test src/renderer/src/components/AgentUsageIndicator.test.tsx`

Expected: PASS. Todas las pruebas del indicador pasan.

- [ ] **Step 5: Revisar recursos y cambio**

Run: `git diff --check -- src/renderer/public/agent-provider-logos src/renderer/src/components/AgentUsageIndicator.tsx src/renderer/src/components/AgentUsageIndicator.test.tsx`

Expected: exit code 0.

### Task 3: Integrar y verificar el cambio completo

**Files:**
- Modify: los archivos aceptados de las tareas 1 y 2, solo si la integración muestra un error.
- Test: `src/main/agentUsage.test.ts`, `src/renderer/src/components/AgentUsageIndicator.test.tsx`, suite completa.

**Interfaces:**
- Consumes: snapshots retenidos de `AgentUsageService` y el indicador actualizado.
- Produces: una aplicación con comprobación de tipos y pruebas completas sin regresiones.

- [ ] **Step 1: Ejecutar las pruebas focalizadas**

Run: `npx tsx --test src/main/agentUsage.test.ts src/renderer/src/components/AgentUsageIndicator.test.tsx`

Expected: PASS.

- [ ] **Step 2: Ejecutar la suite completa**

Run: `npm test`

Expected: exit code 0.

- [ ] **Step 3: Ejecutar la comprobación de tipos**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 4: Revisar el alcance final**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no errores de espacios. Solo deben existir cambios de este plan y los archivos no relacionados que ya estaban sin seguimiento deben permanecer sin modificar.

- [ ] **Step 5: Verificar manualmente en desarrollo**

Run: `npm run dev`

Confirmar en el topbar: un icono oficial sin texto de proveedor, `↻ HH:mm` para cinco horas, `↻ DD mes HH:mm` para semanal, fechas blancas y valores retenidos después de una lectura sin actualización.

## Cobertura de especificación

- Logos oficiales locales y sin texto visible: Task 2.
- Formato local de fechas y hora de 24 horas: Task 2.
- Texto blanco y colores de alerta existentes: Task 2.
- Retención para Claude y Codex: Task 1.
- Sin usage inicial y limpieza al desconfigurar: Task 1.
- Pruebas, tipos y verificación manual: Task 3.
