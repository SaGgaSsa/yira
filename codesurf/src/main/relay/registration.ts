/** True while Relay Suite (or any code path) has registered relay:* IPC handlers. */
let relayHostActive = false

export function setRelayHostActive(value: boolean): void {
  relayHostActive = value
}

export function isRelayHostActive(): boolean {
  return relayHostActive
}
