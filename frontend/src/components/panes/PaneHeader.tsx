import type { PaneNode } from '../../state/paneTreeState'
import type { VaultInfo } from '../../types'
import { EditorHeaderRow } from '../EditorHeaderRow'
import { Breadcrumb } from '../Breadcrumb'
import { isBreadcrumbPath } from './breadcrumbPath'

export interface PaneHeaderProps {
  pane: PaneNode
  vaults: VaultInfo[]
  /** Called with the folder path ('' = vault root) and the vault of the pane's active tab. */
  onSegmentClick: (folderPath: string, vaultId: string) => void
}

/**
 * Header row of one pane once the editor is split: navigation, the breadcrumb of
 * the pane's own active tab (its vault, not the selected one) and the pane menu.
 */
export function PaneHeader({ pane, vaults, onSegmentClick }: PaneHeaderProps) {
  const tab = pane.tabState.tabs.find((tb) => tb.id === pane.tabState.activeTabId)
  const vault = tab ? vaults.find((v) => v.id === tab.vaultId) : undefined
  return (
    <EditorHeaderRow>
      {tab && vault && isBreadcrumbPath(tab.filePath) && (
        <Breadcrumb
          vaultName={vault.name}
          filePath={tab.filePath}
          onSegmentClick={(folderPath) => onSegmentClick(folderPath, vault.id)}
        />
      )}
    </EditorHeaderRow>
  )
}
