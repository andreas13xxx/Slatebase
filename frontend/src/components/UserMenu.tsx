import { useState, useEffect, useRef } from 'react'
import { useAuthContext } from '../state/authContext'
import { useTranslation } from '../i18n'
import {
  User, LogOut, Settings, Shield, FileText, Clock,
  Database, Share2, Trash2, Download, Upload, FolderOpen, ScrollText,
} from 'lucide-react'
import type { AppPage } from '../App'

/**
 * Props for the UserMenu component.
 */
export interface UserMenuProps {
  onNavigate: (page: AppPage) => void
  onLogout: () => void
  hasVaultSelected: boolean
  onImportFile: () => void
  onImportFolder: () => void
  onExportVault: () => void
}

/**
 * User avatar and dropdown menu component.
 * Shows the current user's initials/avatar and provides navigation
 * to profile, sessions, admin pages, and vault operations.
 */
export function UserMenu({ onNavigate, onLogout, hasVaultSelected, onImportFile, onImportFolder, onExportVault }: UserMenuProps) {
  const { authState } = useAuthContext()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  const user = authState.user

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Calculate dropdown position when opened
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const dropdownWidth = 210
      // Position below the trigger, aligned to the right edge
      let left = rect.right - dropdownWidth
      // Ensure it doesn't go off-screen to the left
      if (left < 8) left = 8
      setDropdownStyle({
        top: rect.bottom + 8,
        left,
      })
    }
  }, [open])

  if (!user) return null

  const initials = (user.displayName || user.username).slice(0, 2).toUpperCase()
  const displayName = user.displayName || user.username

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        ref={triggerRef}
        className="user-menu-trigger"
        onClick={() => setOpen(!open)}
        type="button"
        aria-label={t('userMenu.ariaLabel')}
        aria-expanded={open}
      >
        {user.avatarUrl ? (
          <img className="user-menu-avatar" src={user.avatarUrl} alt={displayName} />
        ) : (
          <span className="user-menu-avatar user-menu-avatar--initials">{initials}</span>
        )}
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu" style={dropdownStyle}>
          <div className="user-menu-info">
            <span className="user-menu-name">{displayName}</span>
            <span className="user-menu-role">{user.role === 'admin' ? t('userMenu.roleAdmin') : t('userMenu.roleUser')}</span>
          </div>
          {hasVaultSelected && (
            <>
              <div className="user-menu-divider" />
              <span className="user-menu-section-label">{t('vault.label')}</span>
              <button className="user-menu-item" role="menuitem" onClick={() => { onImportFile(); setOpen(false) }}>
                <Upload size={14} /> {t('files.importFile')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onImportFolder(); setOpen(false) }}>
                <FolderOpen size={14} /> {t('files.importFolder')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onExportVault(); setOpen(false) }}>
                <Download size={14} /> {t('files.exportVault')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('vault-sharing'); setOpen(false) }}>
                <Share2 size={14} /> {t('userMenu.sharing')}
              </button>
              <button className="user-menu-item user-menu-item--danger" role="menuitem" onClick={() => { onNavigate('vault-deletion'); setOpen(false) }}>
                <Trash2 size={14} /> {t('vault.deleteVault')}
              </button>
            </>
          )}
          <div className="user-menu-divider" />
          <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('profile'); setOpen(false) }}>
            <User size={14} /> {t('userMenu.profile')}
          </button>
          <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('sessions'); setOpen(false) }}>
            <Clock size={14} /> {t('userMenu.sessions')}
          </button>
          {user.role === 'admin' && (
            <>
              <div className="user-menu-divider" />
              <span className="user-menu-section-label">{t('userMenu.administration')}</span>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-users'); setOpen(false) }}>
                <Shield size={14} /> {t('userMenu.userManagement')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-vaults'); setOpen(false) }}>
                <Database size={14} /> {t('userMenu.vaultOverview')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-config'); setOpen(false) }}>
                <Settings size={14} /> {t('userMenu.serverConfig')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-audit'); setOpen(false) }}>
                <FileText size={14} /> {t('userMenu.auditLog')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-logs'); setOpen(false) }}>
                <ScrollText size={14} /> {t('userMenu.serverLogs')}
              </button>
            </>
          )}
          <div className="user-menu-divider" />
          <button className="user-menu-item user-menu-item--danger" role="menuitem" onClick={() => { onLogout(); setOpen(false) }}>
            <LogOut size={14} /> {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
