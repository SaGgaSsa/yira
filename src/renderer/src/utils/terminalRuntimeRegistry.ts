import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'

export interface TerminalRuntimeHandle {
  readonly target: TerminalSessionTarget
  park: (parkingRoot: HTMLElement | null) => void
  dispose: (destroyPty: boolean) => Promise<void>
}

export type TerminalRuntimeFactory<T extends TerminalRuntimeHandle> = (
  target: TerminalSessionTarget,
) => Promise<T>

export function terminalRuntimeKey(target: TerminalSessionTarget): string {
  return JSON.stringify([target.workspaceId, target.tileId])
}

interface RuntimeCreation<T extends TerminalRuntimeHandle> {
  readonly target: TerminalSessionTarget
  readonly promise: Promise<T>
  cancelled: boolean
  destroyPty: boolean
  parkWhenReady: boolean
}

export class TerminalRuntimeRegistry<T extends TerminalRuntimeHandle = TerminalRuntimeHandle> {
  private readonly runtimes = new Map<string, T>()
  private readonly creations = new Map<string, RuntimeCreation<T>>()
  private parkingRoot: HTMLElement | null = null

  setParkingRoot(root: HTMLElement | null): void {
    this.parkingRoot = root
  }

  acquire(target: TerminalSessionTarget, factory: TerminalRuntimeFactory<T>): Promise<T> {
    const key = terminalRuntimeKey(target)
    const runtime = this.runtimes.get(key)
    if (runtime) return Promise.resolve(runtime)

    const existingCreation = this.creations.get(key)
    if (existingCreation) return existingCreation.promise

    let creation!: RuntimeCreation<T>
    const promise = Promise.resolve()
      .then(() => factory(target))
      .then(
        async (createdRuntime) => {
          if (creation.cancelled || this.creations.get(key) !== creation) {
            await createdRuntime.dispose(creation.destroyPty)
            throw new Error(`Terminal runtime creation was cancelled for ${key}`)
          }

          this.creations.delete(key)
          this.runtimes.set(key, createdRuntime)
          if (creation.parkWhenReady) createdRuntime.park(this.parkingRoot)
          return createdRuntime
        },
        (error: unknown) => {
          if (this.creations.get(key) === creation) this.creations.delete(key)
          throw error
        },
      )

    creation = {
      target,
      promise,
      cancelled: false,
      destroyPty: false,
      parkWhenReady: false,
    }
    this.creations.set(key, creation)
    return promise
  }

  get(target: TerminalSessionTarget): T | undefined {
    return this.runtimes.get(terminalRuntimeKey(target))
  }

  park(target: TerminalSessionTarget): void {
    const key = terminalRuntimeKey(target)
    const runtime = this.runtimes.get(key)
    if (runtime) {
      runtime.park(this.parkingRoot)
      return
    }

    const creation = this.creations.get(key)
    if (creation) creation.parkWhenReady = true
  }

  destroy(target: TerminalSessionTarget, destroyPty = true): Promise<void> {
    return this.destroyKey(terminalRuntimeKey(target), destroyPty)
  }

  async pruneWorkspace(workspaceId: string, retainedTileIds: Iterable<string>): Promise<void> {
    const retained = new Set(retainedTileIds)
    const keys = [
      ...[...this.runtimes.entries()]
        .filter(([, runtime]) => runtime.target.workspaceId === workspaceId
          && !retained.has(runtime.target.tileId))
        .map(([key]) => key),
      ...[...this.creations.entries()]
        .filter(([, creation]) => creation.target.workspaceId === workspaceId
          && !retained.has(creation.target.tileId))
        .map(([key]) => key),
    ]

    await Promise.all(keys.map((key) => this.destroyKey(key, true)))
  }

  async destroyWorkspace(workspaceId: string): Promise<void> {
    const keys = [
      ...[...this.runtimes.entries()]
        .filter(([, runtime]) => runtime.target.workspaceId === workspaceId)
        .map(([key]) => key),
      ...[...this.creations.entries()]
        .filter(([, creation]) => creation.target.workspaceId === workspaceId)
        .map(([key]) => key),
    ]

    await Promise.all(keys.map((key) => this.destroyKey(key, true)))
  }

  async dispose(): Promise<void> {
    const runtimes = [...this.runtimes.values()]
    this.runtimes.clear()

    const creations = [...this.creations.entries()]
    for (const [key, creation] of creations) {
      creation.cancelled = true
      this.creations.delete(key)
    }

    await Promise.all([
      ...runtimes.map((runtime) => runtime.dispose(false)),
      ...creations.map(([, creation]) => creation.promise.then(
        () => undefined,
        () => undefined,
      )),
    ])
  }

  private destroyKey(key: string, destroyPty: boolean): Promise<void> {
    const runtime = this.runtimes.get(key)
    if (runtime) {
      this.runtimes.delete(key)
      return runtime.dispose(destroyPty)
    }

    const creation = this.creations.get(key)
    if (!creation) return Promise.resolve()

    creation.cancelled = true
    creation.destroyPty = creation.destroyPty || destroyPty
    this.creations.delete(key)

    return creation.promise.then(
      () => undefined,
      () => undefined,
    )
  }
}
