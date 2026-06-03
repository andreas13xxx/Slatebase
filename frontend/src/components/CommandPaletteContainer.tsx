import { useState, useEffect, useCallback } from 'react'
import { CommandPalette } from './CommandPalette'
import { usePluginContext } from '../plugins/compat/plugin-context'

/**
 * CommandPaletteContainer — Listens to the `slatebase:open-command-palette` custom event
 * and renders the CommandPalette modal overlay, wired to the CommandRegistry from PluginProvider.
 *
 * This component is rendered at the root level of the authenticated app layout
 * so it overlays everything when opened.
 *
 * Requirements: 6.6, 12.1, 12.5
 */
export function CommandPaletteContainer() {
  const { commandRegistry } = usePluginContext()
  const [isOpen, setIsOpen] = useState(false)

  // Listen to custom event dispatched by PluginProvider's Ctrl+P / Cmd+P handler
  useEffect(() => {
    function handleOpen() {
      setIsOpen(true)
    }

    window.addEventListener('slatebase:open-command-palette', handleOpen)
    return () => {
      window.removeEventListener('slatebase:open-command-palette', handleOpen)
    }
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleExecute = useCallback((commandId: string) => {
    commandRegistry.executeCommand(commandId)
  }, [commandRegistry])

  const commands = commandRegistry.getCommands()

  return (
    <CommandPalette
      commands={commands}
      isOpen={isOpen}
      onClose={handleClose}
      onExecute={handleExecute}
    />
  )
}
