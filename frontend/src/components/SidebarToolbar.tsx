import { useState, useRef, useCallback } from 'react'
import {
  Upload, FolderOpen, Download, Settings, Shield,
  Database, FileText, Clock, User, Server, FilePlus, MessageCircle, RefreshCw, Key, ScrollText,
  ClipboardList, Plus, Share2,
} from 'lucide-react'

type AppPage =
  | 'vaults' | 'my-vaults' | 'profile' | 'sessions' | 'chat'
  | 'admin-users' | 'admin-vaults' | 'admin-config' | 'admin-audit' | 'admin-logs'
  | 'vault-sharing' | 'vault-deletion' | 'sync-config' | 'sync-log' | 'mcp-tokens'

interface ToolbarItem {
  id: string
  icon: React.ReactNode
  label: string
  action: () => void
  adminOnly?: boolean
  ownerOnly?: boolean
  requiresVault?: boolean
}

interface SidebarToolbarProps {
  vaultId: string | null
  onCreateVault: () => void
  onCreateFile: () => void
  onImportFile: () => void
  onImportFolder: () => void
  onExportVault: () => void
  onNavigate: (page: AppPage) => void
  onOpenGraph: () => void
  isAdmin: boolean
  isVaultOwner?: boolean
  syncEnabled?: boolean
  globalUnreadCount?: number
}

/**
 * Draggable vertical toolbar to the left of the file explorer.
 * Buttons can be reordered by drag-and-drop.
 * Tooltips show on hover.
 */
export function SidebarToolbar({ vaultId, onCreateVault, onCreateFile, onImportFile, onImportFolder, onExportVault, onNavigate, onOpenGraph, isAdmin, isVaultOwner, syncEnabled, globalUnreadCount }: SidebarToolbarProps) {
  const allItems: ToolbarItem[] = [
    { id: 'create-vault', icon: <Plus size={15} />, label: 'Neuer Vault', action: onCreateVault },
    { id: 'create-file', icon: <FilePlus size={15} />, label: 'Neue Datei', action: onCreateFile, requiresVault: true },
    { id: 'import-file', icon: <Upload size={15} />, label: 'Datei importieren', action: onImportFile, requiresVault: true },
    { id: 'import-folder', icon: <FolderOpen size={15} />, label: 'Ordner importieren', action: onImportFolder, requiresVault: true },
    { id: 'export-vault', icon: <Download size={15} />, label: 'Vault exportieren', action: onExportVault, requiresVault: true },
    { id: 'graph', icon: <Share2 size={15} />, label: 'Graph', action: onOpenGraph, requiresVault: true },
    { id: 'sync-config', icon: <RefreshCw size={15} />, label: 'Vault-Sync', action: () => onNavigate('sync-config'), requiresVault: true, ownerOnly: true },
    { id: 'sync-log', icon: <ClipboardList size={15} />, label: 'Sync-Protokoll', action: () => onNavigate('sync-log'), requiresVault: true, ownerOnly: true },
    { id: 'my-vaults', icon: <Database size={15} />, label: 'Meine Vaults', action: () => onNavigate('my-vaults') },
    { id: 'profile', icon: <User size={15} />, label: 'Profil', action: () => onNavigate('profile') },
    { id: 'sessions', icon: <Clock size={15} />, label: 'Sitzungen', action: () => onNavigate('sessions') },
    { id: 'mcp-tokens', icon: <Key size={15} />, label: 'API-Tokens', action: () => onNavigate('mcp-tokens') },
    { id: 'chat', icon: <MessageCircle size={15} />, label: 'Chat', action: () => onNavigate('chat') },
    { id: 'admin-users', icon: <Shield size={15} />, label: 'Benutzerverwaltung', action: () => onNavigate('admin-users'), adminOnly: true },
    { id: 'admin-vaults', icon: <Server size={15} />, label: 'Vault-Übersicht (Admin)', action: () => onNavigate('admin-vaults'), adminOnly: true },
    { id: 'admin-config', icon: <Settings size={15} />, label: 'Serverkonfiguration', action: () => onNavigate('admin-config'), adminOnly: true },
    { id: 'admin-audit', icon: <FileText size={15} />, label: 'Audit-Log', action: () => onNavigate('admin-audit'), adminOnly: true },
    { id: 'admin-logs', icon: <ScrollText size={15} />, label: 'Server-Logs', action: () => onNavigate('admin-logs'), adminOnly: true },
  ]

  const visibleItems = allItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.ownerOnly && !isVaultOwner) return false
    return true
  })

  const [order, setOrder] = useState<string[]>(visibleItems.map((i) => i.id))
  const dragItem = useRef<string | null>(null)
  const dragOver = useRef<string | null>(null)

  // Keep order in sync when isAdmin changes
  const currentIds = visibleItems.map((i) => i.id)
  const syncedOrder = [
    ...order.filter((id) => currentIds.includes(id)),
    ...currentIds.filter((id) => !order.includes(id)),
  ]

  const handleDragStart = useCallback((id: string) => {
    dragItem.current = id
  }, [])

  const handleDragEnter = useCallback((id: string) => {
    dragOver.current = id
  }, [])

  const handleDragEnd = useCallback(() => {
    if (!dragItem.current || !dragOver.current || dragItem.current === dragOver.current) {
      dragItem.current = null
      dragOver.current = null
      return
    }
    setOrder((prev) => {
      const next = [...prev]
      const fromIdx = next.indexOf(dragItem.current!)
      const toIdx = next.indexOf(dragOver.current!)
      if (fromIdx === -1 || toIdx === -1) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, dragItem.current!)
      return next
    })
    dragItem.current = null
    dragOver.current = null
  }, [])

  const orderedItems = syncedOrder
    .map((id) => visibleItems.find((i) => i.id === id))
    .filter((i): i is ToolbarItem => i !== undefined)

  return (
    <div className="app-toolbar" role="toolbar" aria-label="Werkzeugleiste">
      {orderedItems.map((item) => {
        const disabled = item.requiresVault && !vaultId
        const showBadge = item.id === 'chat' && globalUnreadCount !== undefined && globalUnreadCount > 0
        const showSyncActive = item.id === 'sync-config' && syncEnabled === true
        return (
          <button
            key={item.id}
            className={`toolbar-btn${showSyncActive ? ' toolbar-btn--sync-active' : ''}`}
            title={showSyncActive ? `${item.label} (aktiv)` : item.label}
            aria-label={item.label}
            onClick={disabled ? undefined : item.action}
            disabled={disabled}
            draggable
            onDragStart={() => handleDragStart(item.id)}
            onDragEnter={() => handleDragEnter(item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            style={{ opacity: disabled ? 0.35 : 1 }}
          >
            {item.icon}
            {showBadge && (
              <span className="toolbar-btn-badge" aria-label={`${globalUnreadCount} ungelesene Nachrichten`}>
                {globalUnreadCount}
              </span>
            )}
            {showSyncActive && (
              <span className="toolbar-btn-sync-dot" aria-hidden="true" />
            )}
          </button>
        )
      })}
    </div>
  )
}
