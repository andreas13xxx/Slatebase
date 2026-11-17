/**
 * BasePanelView — pins a `.base` file to a side panel (Obsidian: a Base moved
 * into the sidebar). `this` in the pinned base's filters/formulas refers to
 * the active file in the MAIN content area, not the base file itself — the
 * documented Obsidian semantics for a Base in a sidebar — so browsing notes
 * while the panel stays on screen lets a filter like `this.tags` or
 * `file.hasLink(this.file)` follow whichever note is open.
 *
 * Which `.base` file is pinned is this panel instance's own choice, not vault
 * content or document-derived data: it is persisted alongside the panel's
 * layout (see `side-panel/utils/persistence.ts`'s `saveBasePanelPath`), one
 * choice per side and vault.
 */

import { useContext, useMemo, useState } from 'react'
import { useTranslation } from '../../i18n'
import { useFeatureContext } from '../../state/featureContext'
import { AppContext } from '../../state'
import { collectFilesSorted } from '../../plugins/link-resolver'
import { BasesEmbed } from '../bases/BasesEmbed'
import { FeatureDisabledHint } from '../settings/ui'
import { loadBasePanelPath, saveBasePanelPath } from '../side-panel/utils/persistence'
import type { PanelSide } from '../side-panel/utils/persistence'
import './BasePanelView.css'

export interface BasePanelViewProps {
  /** Which panel this instance belongs to — selects the persisted pinned-path slot. */
  panel: PanelSide
  vaultId: string | null
  /** Vault-relative path of the file open in the main content area; resolves `this` in the pinned base. */
  activeFilePath: string | null
  onOpenNote: (path: string) => void
}

export function BasePanelView(props: BasePanelViewProps) {
  // The pinned path lives in the vault's settings blob, so a vault switch must re-read it: keying on the
  // vault remounts the view instead of keeping the previous vault's choice in state.
  return <BasePanelViewInner key={props.vaultId ?? ''} {...props} />
}

function BasePanelViewInner({ panel, vaultId, activeFilePath, onOpenNote }: BasePanelViewProps) {
  const { t } = useTranslation()
  const { isEnabled } = useFeatureContext()
  const tree = useContext(AppContext)?.state.directoryTree ?? null

  // One pinned path per panel side and vault — read once per mount (the wrapper remounts on a vault switch).
  const [path, setPath] = useState<string | null>(() => loadBasePanelPath(panel))

  const choosePath = (next: string): void => {
    const value = next.trim() === '' ? null : next
    setPath(value)
    saveBasePanelPath(panel, value)
  }

  const baseFiles = useMemo(
    () => (tree ? collectFilesSorted(tree).filter((f) => f.path.toLowerCase().endsWith('.base')) : []),
    [tree],
  )

  if (!isEnabled('bases')) {
    return (
      <div className="base-panel-view">
        <FeatureDisabledHint featureName="Bases" />
      </div>
    )
  }

  if (!vaultId) {
    return (
      <div className="base-panel-view base-panel-view--empty">
        <p className="base-panel-view__placeholder">{t('contextPanel.base.noVault')}</p>
      </div>
    )
  }

  return (
    <div className="base-panel-view">
      <label className="base-panel-view__picker">
        <span className="base-panel-view__picker-label">{t('contextPanel.base.selectLabel')}</span>
        <select
          className="base-panel-view__select"
          value={path ?? ''}
          onChange={(e) => choosePath(e.target.value)}
          aria-label={t('contextPanel.base.selectLabel')}
        >
          <option value="">{t('contextPanel.base.selectPlaceholder')}</option>
          {baseFiles.map((f) => <option key={f.path} value={f.path}>{f.path}</option>)}
        </select>
      </label>
      {path ? (
        <div className="base-panel-view__content">
          <BasesEmbed
            vaultId={vaultId}
            filePath={path}
            {...(activeFilePath !== null ? { hostPath: activeFilePath } : {})}
            onOpenNote={onOpenNote}
          />
        </div>
      ) : (
        <p className="base-panel-view__placeholder">
          {baseFiles.length === 0 ? t('contextPanel.base.none') : t('contextPanel.base.noneSelected')}
        </p>
      )}
    </div>
  )
}
