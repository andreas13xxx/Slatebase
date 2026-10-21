// Effect probe for Style Settings toggles (spike, 2026-10-21).
//
// Question: with a theme active and the Style Settings plugin running, how many of the theme's class toggles and
// class-select options change anything on the page in Slatebase? For each class it adds the class to <body>, compares
// the computed style of every element (same properties as probe-editor-effect.js) and removes it again.
//
// Use: open a vault with the theme active and Style Settings enabled and a note open; run via
//      playwright-cli eval "$(cat probe-toggle-effect.js)"
() => {
  const plugin = window.app.plugins.plugins['obsidian-style-settings']
  const config = plugin.settingsManager.config
  const props = ['color', 'background-color', 'font-size', 'font-weight', 'font-family', 'line-height', 'padding', 'margin',
    'display', 'border-top-width', 'border-bottom-width', 'border-left-width', 'border-radius', 'max-width', 'width',
    'opacity', 'text-decoration-line', 'font-style', 'letter-spacing', 'text-transform', 'text-indent', 'visibility', 'position']
  const snap = () => [...document.body.querySelectorAll('*')].map((e) => {
    const c = getComputedStyle(e)
    return props.map((p) => c.getPropertyValue(p)).join('|')
  })
  const classes = []
  for (const section of Object.values(config)) {
    for (const s of Object.values(section)) {
      if (s.type === 'class-toggle') classes.push({ cls: s.id, kind: 'toggle' })
      else if (s.type === 'class-select') for (const o of s.options || []) classes.push({ cls: typeof o === 'string' ? o : o.value, kind: 'select' })
    }
  }
  const before = snap()
  const total = before.length
  const results = []
  for (const { cls, kind } of classes) {
    if (!cls || document.body.classList.contains(cls)) { results.push({ cls, kind, skipped: true }); continue }
    document.body.classList.add(cls)
    const after = snap()
    document.body.classList.remove(cls)
    let changed = 0
    for (let i = 0; i < total; i += 1) if (after[i] !== before[i]) changed += 1
    results.push({ cls, kind, changed })
  }
  const measured = results.filter((r) => !r.skipped)
  const effective = measured.filter((r) => r.changed > 0)
  return JSON.stringify({
    elements: total,
    classes: classes.length,
    measured: measured.length,
    withEffect: effective.length,
    top: effective.sort((a, b) => b.changed - a.changed).slice(0, 12).map((r) => `${r.cls}:${r.changed}`),
    noEffect: measured.filter((r) => r.changed === 0).slice(0, 12).map((r) => r.cls),
  })
}
