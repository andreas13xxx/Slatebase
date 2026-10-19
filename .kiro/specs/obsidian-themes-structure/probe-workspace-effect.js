// Effect probe for the workspace / tab / ribbon markers (Stage 2, Phase 0 spike, strategy A).
//
// Adds Obsidian's workspace classes to the existing Slatebase elements (tab bar, sidebars, toolbar, panes, view
// content) plus the `is-focused` / `is-hidden-frameless` body states, then compares the computed style of every
// element on the page before and after.
//
// Use:  open a vault with Minimal active and a note open; run as `playwright-cli eval "$(cat probe-workspace-effect.js)"`.
//
// Result of 2026-10-19 (see design.md §3): 1 of 945 elements changed one property
// (`position: static -> relative` on `.side-panel__view-content`, from `.workspace-leaf-content`).
() => {
  const props = ['color', 'background-color', 'font-size', 'font-weight', 'padding', 'margin', 'display', 'border-top-width',
    'border-bottom-width', 'border-radius', 'height', 'width', 'opacity', 'gap', 'flex-direction', 'position']
  const els = [...document.querySelectorAll('body *')]
  const snap = () => els.map((e) => {
    const c = getComputedStyle(e)
    return props.map((p) => c.getPropertyValue(p)).join('|')
  })
  const before = snap()
  const add = (sel, cls) => document.querySelectorAll(sel).forEach((e) => e.classList.add(...cls.split(' ')))

  add('.app-content', 'workspace-tabs mod-top')
  add('.tab-bar-row', 'workspace-tab-header-container')
  add('.tab-bar', 'workspace-tab-header-container-inner')
  add('.tab-bar-tab', 'workspace-tab-header')
  add('.tab-bar-tab--active', 'is-active mod-active')
  add('.tab-bar-tab-icon', 'workspace-tab-header-inner-icon')
  add('.tab-bar-tab-label', 'workspace-tab-header-inner-title')
  add('.tab-bar-close-btn', 'workspace-tab-header-inner-close-button')
  add('.app-sidebar', 'mod-left-split workspace-split')
  add('.app-right-panel', 'mod-right-split workspace-split')
  add('.app-toolbar', 'workspace-ribbon mod-left')
  add('.pane-leaf', 'workspace-leaf mod-active')
  add('.tab-content', 'workspace-leaf-content')
  add('.breadcrumb', 'view-header')
  add('.side-panel__view-content', 'workspace-leaf-content view-content')
  document.body.classList.add('is-focused', 'is-hidden-frameless')

  return new Promise((resolve) => setTimeout(() => {
    const after = snap()
    const diffs = []
    for (let i = 0; i < before.length; i += 1) {
      if (before[i] === after[i]) continue
      const a = before[i].split('|')
      const b = after[i].split('|')
      const changed = props.filter((p, j) => a[j] !== b[j])
      diffs.push({
        el: `${els[i].tagName.toLowerCase()}.${String(els[i].className).split(' ').slice(0, 3).join('.')}`,
        props: changed.join(','),
        from: changed.map((p) => a[props.indexOf(p)]).join(' ; ').slice(0, 60),
        to: changed.map((p) => b[props.indexOf(p)]).join(' ; ').slice(0, 60),
      })
    }
    resolve(JSON.stringify({ total: before.length, changed: diffs.length, examples: diffs.slice(0, 14) }, null, 1))
  }, 1500))
}
