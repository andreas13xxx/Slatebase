/**
 * SearchOperatorHelp — popover showing supported search operators with examples.
 * Triggered by a help icon button next to the search input.
 */

interface SearchOperatorHelpProps {
  open: boolean
  onClose: () => void
}

const OPERATORS = [
  { syntax: 'path:<glob>', example: 'path:Projekte/**', description: 'Dateien im Pfad einschließen' },
  { syntax: 'file:<muster>', example: 'file:notizen', description: 'Dateien mit passendem Namen' },
  { syntax: 'tag:<tag>', example: 'tag:projekt', description: 'Dateien mit dem Tag' },
  { syntax: 'property:<key>', example: 'property:status', description: 'Dateien mit der Eigenschaft' },
  { syntax: 'property:<key>=<wert>', example: 'property:status=aktiv', description: 'Eigenschaft mit Wert' },
  { syntax: '-path:<glob>', example: '-path:Archiv/**', description: 'Pfad ausschließen' },
  { syntax: '-tag:<tag>', example: '-tag:erledigt', description: 'Tag ausschließen' },
  { syntax: '-property:<key>', example: '-property:draft', description: 'Eigenschaft ausschließen' },
] as const

export function SearchOperatorHelp({ open, onClose }: SearchOperatorHelpProps) {
  if (!open) return null

  return (
    <div className="search-operator-help__overlay" onClick={onClose} role="presentation">
      <div
        className="search-operator-help"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Suchoperatoren"
      >
        <h3 className="search-operator-help__title">Suchoperatoren</h3>
        <table className="search-operator-help__table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Beispiel</th>
              <th>Beschreibung</th>
            </tr>
          </thead>
          <tbody>
            {OPERATORS.map((op) => (
              <tr key={op.syntax}>
                <td className="search-operator-help__syntax"><code>{op.syntax}</code></td>
                <td className="search-operator-help__example"><code>{op.example}</code></td>
                <td>{op.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="search-operator-help__note">
          Werte mit Leerzeichen in Anführungszeichen setzen: <code>path:&quot;Mein Ordner/**&quot;</code>
        </p>
      </div>
    </div>
  )
}
