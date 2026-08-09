/**
 * Vault, MetadataCache and Workspace all extend Obsidian's `Events` base class,
 * so all three owe plugins the same four methods — including `offref`.
 *
 * That one was the gap: Workspace's was a no-op and the other two didn't have it
 * at all (so `vault.offref(ref)` was a TypeError). The assumption was that plugin
 * unload cleans everything up, which misses what `offref` is actually for —
 * unsubscribing while still loaded, when a view closes or a setting is toggled
 * off. The listener kept firing for the rest of the session.
 */
import { describe, it, expect } from 'vitest'
import { VaultShim } from './vault-shim'
import { MetadataCacheShim } from './metadata-cache-shim'
import { WorkspaceShim } from './workspace-shim'

interface Emitter {
  on(event: string, cb: (...args: unknown[]) => void): { id: string; event: string; callback: (...args: unknown[]) => void }
  off(event: string, cb: (...args: unknown[]) => void): void
  offref(ref: { id: string; event: string; callback: (...args: unknown[]) => void }): void
  trigger(event: string, ...args: unknown[]): void
}

const emitters: Array<[string, () => Emitter]> = [
  ['VaultShim', () => new VaultShim() as unknown as Emitter],
  ['MetadataCacheShim', () => new MetadataCacheShim() as unknown as Emitter],
  ['WorkspaceShim', () => new WorkspaceShim() as unknown as Emitter],
]

describe.each(emitters)('%s Events contract', (_name, create) => {
  it('stops delivering to a listener removed by offref', () => {
    const emitter = create()
    let fired = 0
    const ref = emitter.on('custom-event', () => { fired++ })

    emitter.trigger('custom-event')
    expect(fired).toBe(1)

    emitter.offref(ref)
    emitter.trigger('custom-event')
    expect(fired).toBe(1)
  })

  it('leaves other listeners on the same event subscribed', () => {
    const emitter = create()
    let removed = 0
    let kept = 0
    const ref = emitter.on('custom-event', () => { removed++ })
    emitter.on('custom-event', () => { kept++ })

    emitter.offref(ref)
    emitter.trigger('custom-event')

    expect(removed).toBe(0)
    expect(kept).toBe(1)
  })

  it('is idempotent', () => {
    const emitter = create()
    const ref = emitter.on('custom-event', () => {})
    emitter.offref(ref)
    expect(() => emitter.offref(ref)).not.toThrow()
  })
})
