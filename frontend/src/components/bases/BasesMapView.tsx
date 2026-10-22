/**
 * BasesMapView — renders a base's rows as pins on a Leaflet map.
 *
 * The `map` view type plots each note that carries a geo coordinate on a slippy
 * map; clicking a pin opens the note. Leaflet is driven imperatively (no
 * react-leaflet — see `.kiro/specs/obsidian-feature-gaps` R6: BSD-2 only, one
 * fewer dependency), so the map lives in a ref'd container created on mount and
 * destroyed on unmount, with markers rebuilt whenever the rows change.
 *
 * Coordinate convention (read from the view's config, falling back to common
 * Obsidian property names):
 *   - `view.coordinates` (or `location`): one property holding `"lat,lng"`.
 *   - `view.latProperty` + `view.lngProperty` (or `lat`/`lng`/`longitude`):
 *     two numeric properties.
 * A row with no parseable coordinate is simply not plotted; a counter reports
 * how many were skipped.
 *
 * The tile source is operator-configured (`tileUrl` prop, from
 * `GET /api/v1/map-config`). With no tile URL the map cannot render and the
 * component shows an inactive notice instead — the operator opt-in gate.
 */

import { memo, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { readMapConfig, extractPins } from './bases-map-coords'
import './bases-map.css'

export interface BasesMapViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  /** Operator-configured tile URL template (empty = map inactive). */
  tileUrl: string
  /** Operator-configured tile attribution (may be empty). */
  attribution: string
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
}

export const BasesMapView = memo(function BasesMapView({
  doc, view, rows, tileUrl, attribution, onOpenNote,
}: BasesMapViewProps) {
  void doc // doc reserved for future per-column popups; coordinate config comes from the view.
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  // Keep the latest open handler in a ref so marker closures stay current
  // without tearing down the map.
  const onOpenRef = useRef(onOpenNote)
  useEffect(() => { onOpenRef.current = onOpenNote }, [onOpenNote])

  const cfg = useMemo(() => readMapConfig(view), [view])
  const { pins, skipped } = useMemo(() => extractPins(rows, cfg), [rows, cfg])

  // Create the map once (when a tile URL is configured); destroy on unmount.
  useEffect(() => {
    if (!tileUrl || !containerRef.current) return
    const map = L.map(containerRef.current, { worldCopyJump: true }).setView([0, 0], 2)
    L.tileLayer(tileUrl, attribution ? { attribution } : {}).addTo(map)
    const layer = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = layer
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [tileUrl, attribution])

  // Rebuild markers whenever the pins change; fit the view to them.
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    if (pins.length === 0) return
    const latLngs: L.LatLngExpression[] = []
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], { title: pin.label })
      marker.bindTooltip(pin.label)
      marker.on('click', () => onOpenRef.current(pin.path))
      marker.addTo(layer)
      latLngs.push([pin.lat, pin.lng])
    }
    if (latLngs.length === 1) {
      map.setView(latLngs[0]!, 13)
    } else {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 15 })
    }
  }, [pins])

  if (!tileUrl) {
    return (
      <div className="bases-map bases-map--inactive" role="status">
        Die Kartenansicht ist nicht verfügbar: Der Betreiber hat keinen Kachel-Server
        konfiguriert (<code>SLATEBASE_MAP_TILE_URL</code>).
      </div>
    )
  }

  return (
    <div className="bases-map-view">
      {skipped > 0 && (
        <div className="bases-map__notice" role="status" aria-live="polite">
          {skipped === rows.length
            ? 'Keine Notiz hat auswertbare Koordinaten.'
            : `${skipped} von ${rows.length} Notizen ohne auswertbare Koordinaten werden nicht angezeigt.`}
        </div>
      )}
      <div ref={containerRef} className="bases-map__canvas" aria-label="Kartenansicht" />
    </div>
  )
})
