/**
 * SearchOperatorHelp — popover showing supported search operators with examples.
 * Triggered by a help icon button next to the search input.
 */

import { useTranslation } from '../i18n'
import type { TranslationKey } from '../i18n'

interface SearchOperatorHelpProps {
  open: boolean
  onClose: () => void
}

const OPERATORS: { syntax: string; example: string; descriptionKey: TranslationKey }[] = [
  { syntax: 'path:<glob>', example: 'path:Projekte/**', descriptionKey: 'search.operatorHelp.operators.path' },
  { syntax: 'file:<muster>', example: 'file:notizen', descriptionKey: 'search.operatorHelp.operators.file' },
  { syntax: 'tag:<tag>', example: 'tag:projekt', descriptionKey: 'search.operatorHelp.operators.tag' },
  { syntax: 'property:<key>', example: 'property:status', descriptionKey: 'search.operatorHelp.operators.property' },
  { syntax: 'property:<key>=<wert>', example: 'property:status=aktiv', descriptionKey: 'search.operatorHelp.operators.propertyValue' },
  { syntax: '-path:<glob>', example: '-path:Archiv/**', descriptionKey: 'search.operatorHelp.operators.excludePath' },
  { syntax: '-tag:<tag>', example: '-tag:erledigt', descriptionKey: 'search.operatorHelp.operators.excludeTag' },
  { syntax: '-property:<key>', example: '-property:draft', descriptionKey: 'search.operatorHelp.operators.excludeProperty' },
]

export function SearchOperatorHelp({ open, onClose }: SearchOperatorHelpProps) {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <div className="search-operator-help__overlay" onClick={onClose} role="presentation">
      <div
        className="search-operator-help"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('search.operatorHelp.ariaLabel')}
      >
        <h3 className="search-operator-help__title">{t('search.operatorHelp.title')}</h3>
        <table className="search-operator-help__table">
          <thead>
            <tr>
              <th>{t('search.operatorHelp.columnOperator')}</th>
              <th>{t('search.operatorHelp.columnExample')}</th>
              <th>{t('search.operatorHelp.columnDescription')}</th>
            </tr>
          </thead>
          <tbody>
            {OPERATORS.map((op) => (
              <tr key={op.syntax}>
                <td className="search-operator-help__syntax"><code>{op.syntax}</code></td>
                <td className="search-operator-help__example"><code>{op.example}</code></td>
                <td>{t(op.descriptionKey)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="search-operator-help__note">
          {t('search.operatorHelp.note')} <code>path:&quot;Mein Ordner/**&quot;</code>
        </p>
      </div>
    </div>
  )
}
