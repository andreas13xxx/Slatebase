// Effect probe for the editor markers (Stage 2, Phase 0 spike).
//
// Question it answers: if Slatebase's Live Preview editor carried Obsidian's structural classes, would an
// active theme restyle anything? It adds the classes to the live DOM, waits, and compares the computed style
// of every element below `.markdown-source-view` before and after.
//
// Use:  open a vault with a theme active and a note that contains headings 1-6, inline code, a quote, a code
//       block, tasks and a table; then run this as `playwright-cli eval "$(cat probe-editor-effect.js)"`
//       (or paste it into the browser console). It prints { theme, total, changed, examples }.
//
// Result of 2026-10-19 (see design.md §3): Things 0 / 164 elements changed, Minimal 6 / 164 (editor max-width and
// table padding/borders - caused by the wrapper classes `mod-cm6` / `is-live-preview`).
() => {
  const props = ['color', 'background-color', 'font-size', 'font-weight', 'font-family', 'line-height', 'padding', 'margin',
    'display', 'border-top-width', 'border-bottom-width', 'border-left-width', 'border-radius', 'max-width', 'width',
    'opacity', 'text-decoration-line', 'font-style', 'letter-spacing', 'text-transform', 'text-indent']
  const root = document.querySelector('.markdown-source-view')
  const snap = () => [...root.querySelectorAll('*')].map((e) => {
    const c = getComputedStyle(e)
    return props.map((p) => c.getPropertyValue(p)).join('|')
  })
  const els = [...root.querySelectorAll('*')]
  const before = snap()
  const add = (sel, cls) => root.querySelectorAll(sel).forEach((e) => e.classList.add(...cls.split(' ')))

  root.classList.add('mod-cm6', 'is-live-preview', 'is-readable-line-width')
  add('.cm-editor', 'cm-s-obsidian')
  for (let n = 1; n <= 6; n += 1) add(`.cm-lp-h${n}`, `HyperMD-header HyperMD-header-${n}`)
  add('.cm-lp-heading-marker', 'cm-formatting cm-formatting-header')
  add('.cm-lp-inline-code', 'cm-inline-code')
  add('.cm-lp-highlight', 'cm-highlight')
  add('.cm-lp-tag', 'cm-hashtag')
  add('.cm-lp-blockquote', 'HyperMD-quote')
  add('.cm-lp-code-block-line', 'HyperMD-codeblock HyperMD-codeblock-bg')
  add('.cm-lp-code-block-first', 'HyperMD-codeblock-begin')
  add('.cm-lp-code-block-last', 'HyperMD-codeblock-end')
  add('.cm-lp-checkbox', 'HyperMD-task-line')
  add('.cm-activeLine', 'cm-active')

  return new Promise((resolve) => setTimeout(() => {
    const after = snap()
    const diffs = []
    for (let i = 0; i < before.length; i += 1) {
      if (before[i] === after[i]) continue
      const a = before[i].split('|')
      const b = after[i].split('|')
      const changed = props.filter((p, j) => a[j] !== b[j])
      diffs.push({
        el: `${els[i].tagName.toLowerCase()}.${String(els[i].className).split(' ').filter((x) => !x.startsWith('ͼ')).slice(0, 3).join('.')}`,
        props: changed.join(','),
        from: changed.map((p) => a[props.indexOf(p)]).join(' ; ').slice(0, 45),
        to: changed.map((p) => b[props.indexOf(p)]).join(' ; ').slice(0, 45),
      })
    }
    resolve(JSON.stringify({
      theme: document.documentElement.getAttribute('data-obsidian-theme'),
      total: before.length,
      changed: diffs.length,
      examples: diffs.slice(0, 14),
    }, null, 1))
  }, 1500))
}
