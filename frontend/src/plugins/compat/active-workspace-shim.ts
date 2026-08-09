/**
 * Module-level accessor for the current vault's WorkspaceShim.
 *
 * Mirrors the getActiveEditorView()/getActiveEditorContainerEl() pattern in
 * editor/plugin-extensions.ts: native UI outside the plugin React tree (the
 * file explorer's right-click menu) needs to fire 'file-menu'/'files-menu' so
 * plugins can add context menu items, but isn't a PluginProvider consumer,
 * and pulling it in just for this would be a much larger change than the
 * event itself.
 *
 * Kept in its own plain module (not exported from plugin-context.tsx, which
 * is a component file) because reassigning a module-level variable from
 * inside a component/hook is flagged by the React Compiler lint rules — the
 * setter below is called from PluginProvider's effects, but the mutation
 * itself happens here, outside any component.
 *
 * @module active-workspace-shim
 */

import type { WorkspaceShim } from './shims/workspace-shim'

let activeWorkspaceShim: WorkspaceShim | null = null

/** Set by PluginProvider when the vault's WorkspaceShim is created/torn down. */
export function setActiveWorkspaceShim(shim: WorkspaceShim | null): void {
  activeWorkspaceShim = shim
}

/** The current vault's WorkspaceShim, or null outside a vault / before plugins have initialized. */
export function getActiveWorkspaceShim(): WorkspaceShim | null {
  return activeWorkspaceShim
}
