import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useTranslation } from '../i18n'
import type { GraphConfig } from './graph-config'
import type { GraphMeta } from '../types'
import './GraphSettingsPanel.css'

/**
 * Props for the GraphSettingsPanel component.
 */
interface GraphSettingsPanelProps {
  /** Current graph configuration. */
  config: GraphConfig
  /** Graph metadata (tag counts, property key counts) for the property selector. */
  meta: GraphMeta | null
  /** Called when any config value changes. */
  onConfigChange: (config: GraphConfig) => void
  /** Called when the user clicks "Reset". */
  onReset: () => void
}

/**
 * GraphSettingsPanel — Collapsible settings panel for the knowledge graph.
 *
 * Sections:
 * - Colors: 6 color pickers (file, unresolved, tag, property, edges, highlight)
 * - Layout: 4 sliders (repulsion, link strength, link distance, center gravity)
 * - Node types: Toggle tags, toggle properties + key multi-select
 * - Reset button
 */
export function GraphSettingsPanel({ config, meta, onConfigChange, onReset }: GraphSettingsPanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const updateColor = (key: keyof GraphConfig['colors'], value: string) => {
    onConfigChange({
      ...config,
      colors: { ...config.colors, [key]: value },
    })
  }

  const updateLayout = (key: keyof GraphConfig['layout'], value: number) => {
    onConfigChange({
      ...config,
      layout: { ...config.layout, [key]: value },
    })
  }

  const updateNodes = (patch: Partial<GraphConfig['nodes']>) => {
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, ...patch },
    })
  }

  const togglePropertyKey = (key: string) => {
    const selected = config.nodes.selectedPropertyKeys
    const next = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key]
    updateNodes({ selectedPropertyKeys: next })
  }

  return (
    <>
      <button
        className="graph-settings-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t('graph.settings') ?? 'Einstellungen'}
        title={t('graph.settings') ?? 'Einstellungen'}
      >
        <Settings size={16} />
      </button>

      {open && (
        <div className="graph-settings-panel" role="region" aria-label={t('graph.settings') ?? 'Graph-Einstellungen'}>
          {/* Colors Section */}
          <div className="graph-settings-section">
            <div className="graph-settings-section-title">{t('graph.colors') ?? 'Farben'}</div>
            <ColorRow label={t('graph.colorFile') ?? 'Datei'} value={config.colors.fileNode} onChange={(v) => updateColor('fileNode', v)} />
            <ColorRow label={t('graph.colorUnresolved') ?? 'Unaufgelöst'} value={config.colors.unresolvedNode} onChange={(v) => updateColor('unresolvedNode', v)} />
            <ColorRow label={t('graph.colorTag') ?? 'Tag'} value={config.colors.tagNode} onChange={(v) => updateColor('tagNode', v)} />
            <ColorRow label={t('graph.colorProperty') ?? 'Property'} value={config.colors.propertyNode} onChange={(v) => updateColor('propertyNode', v)} />
            <ColorRow label={t('graph.colorEdge') ?? 'Kanten'} value={config.colors.edge} onChange={(v) => updateColor('edge', v)} />
            <ColorRow label={t('graph.colorHighlight') ?? 'Hervorhebung'} value={config.colors.highlight} onChange={(v) => updateColor('highlight', v)} />
          </div>

          {/* Layout Section */}
          <div className="graph-settings-section">
            <div className="graph-settings-section-title">{t('graph.layout') ?? 'Layout'}</div>
            <SliderRow
              label={t('graph.repulsion') ?? 'Abstoßung'}
              value={config.layout.repulsion}
              min={10} max={500} step={10}
              onChange={(v) => updateLayout('repulsion', v)}
            />
            <SliderRow
              label={t('graph.linkStrength') ?? 'Anziehung'}
              value={config.layout.linkStrength}
              min={0.01} max={1} step={0.01}
              onChange={(v) => updateLayout('linkStrength', v)}
            />
            <SliderRow
              label={t('graph.linkDistance') ?? 'Distanz'}
              value={config.layout.linkDistance}
              min={10} max={200} step={5}
              onChange={(v) => updateLayout('linkDistance', v)}
            />
            <SliderRow
              label={t('graph.centerGravity') ?? 'Schwerkraft'}
              value={config.layout.centerGravity}
              min={0.01} max={1} step={0.01}
              onChange={(v) => updateLayout('centerGravity', v)}
            />
          </div>

          {/* Node Types Section */}
          <div className="graph-settings-section">
            <div className="graph-settings-section-title">{t('graph.nodeTypes') ?? 'Knotentypen'}</div>
            <div className="graph-settings-toggle-row">
              <label className="graph-settings-label" htmlFor="graph-show-tags">
                {t('graph.showTags') ?? 'Tags anzeigen'}
              </label>
              <input
                id="graph-show-tags"
                type="checkbox"
                className="graph-settings-checkbox"
                checked={config.nodes.showTags}
                onChange={(e) => updateNodes({ showTags: e.target.checked })}
              />
            </div>
            <div className="graph-settings-toggle-row">
              <label className="graph-settings-label" htmlFor="graph-show-properties">
                {t('graph.showProperties') ?? 'Properties anzeigen'}
              </label>
              <input
                id="graph-show-properties"
                type="checkbox"
                className="graph-settings-checkbox"
                checked={config.nodes.showProperties}
                onChange={(e) => updateNodes({ showProperties: e.target.checked })}
              />
            </div>

            {/* Property Key Multi-Select (only shown when showProperties is on) */}
            {config.nodes.showProperties && meta && meta.propertyKeys.length > 0 && (
              <div className="graph-settings-property-list">
                {meta.propertyKeys.map((pk) => (
                  <label key={pk.key} className="graph-settings-property-item">
                    <input
                      type="checkbox"
                      className="graph-settings-checkbox"
                      checked={config.nodes.selectedPropertyKeys.includes(pk.key)}
                      onChange={() => togglePropertyKey(pk.key)}
                    />
                    <span>{pk.key}</span>
                    <span className="graph-settings-property-count">({pk.count})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Reset Button */}
          <button className="graph-settings-reset" onClick={onReset}>
            {t('graph.reset') ?? 'Zurücksetzen'}
          </button>
        </div>
      )}
    </>
  )
}

// ─── Sub-Components ────────────────────────────────────────────────────────────

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="graph-settings-row">
      <span className="graph-settings-label">{label}</span>
      <input
        type="color"
        className="graph-settings-color-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  )
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="graph-settings-slider-row">
      <div className="graph-settings-slider-header">
        <span className="graph-settings-slider-label">{label}</span>
        <span className="graph-settings-slider-value">{value}</span>
      </div>
      <input
        type="range"
        className="graph-settings-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
    </div>
  )
}
