/**
 * Hosts a property widget that is not one of the built-in controls — one a
 * plugin registered in `metadataTypeManager.registeredTypeWidgets` or wrapped
 * around a built-in type. The widget draws itself with Obsidian's
 * `render(el, value, ctx)` contract into a plain element; edits arrive through
 * `ctx.onChange`.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from '../../i18n'
import { errorOnce } from '../../plugins/compat/log'
import type { PropertyWidget } from '../../plugins/compat/property-widgets'

interface PluginPropertyWidgetProps {
  widget: PropertyWidget
  propertyKey: string
  value: unknown
  sourcePath: string
  onChange: (value: unknown) => void
}

/** A stable identity for a value, so a re-render only happens when the data really changed. */
function valueSignature(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}

export function PluginPropertyWidget({ widget, propertyKey, value, sourcePath, onChange }: PluginPropertyWidgetProps) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)
  const signature = useMemo(() => valueSignature(value), [value])

  useEffect(() => {
    onChangeRef.current = onChange
    valueRef.current = value
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    host.replaceChildren()
    const row = host.closest<HTMLElement>('.metadata-property')
    try {
      const handle = widget.render(host, valueRef.current, {
        app: (window as unknown as { app?: unknown }).app,
        blur: () => { row?.focus() },
        key: propertyKey,
        onChange: (next) => { onChangeRef.current(next) },
        sourcePath,
      })
      void handle
    } catch (err) {
      errorOnce(`property-widget:${widget.type}`, `[PluginCompat] The "${widget.type}" property widget failed to render "${propertyKey}":`, err)
      host.replaceChildren()
      const message = document.createElement('span')
      message.className = 'property-control__error'
      message.setAttribute('role', 'alert')
      message.textContent = t('contextPanel.properties.widgetError')
      host.appendChild(message)
    }
    return () => { host.replaceChildren() }
    // The value enters through its signature: a new object with the same content must not rebuild the widget.
  }, [widget, propertyKey, signature, sourcePath, t])

  return <div ref={hostRef} className="metadata-property-widget" data-property-type={widget.type} />
}
