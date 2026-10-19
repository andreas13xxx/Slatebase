"""Classify the classes a theme's selectors target and measure Slatebase coverage.

Usage (from the repo root):
  python3 .kiro/specs/obsidian-themes-structure/measure-selectors.py <theme.css> frontend/src <out.json>

Themes used for the 2026-10-19 baseline: Things 2.2.4 (colineckert/obsidian-things) and Minimal 9.1.4 (kepano/obsidian-minimal).
"present in Slatebase" is a source-token check; the baseline was cross-checked against the live DOM (see design.md §1).

Each class is put in exactly one kind:
  native   - part of Obsidian's own DOM (what Stage 2 is about)
  toggle   - a body class the theme or Style Settings switches (`body.minimal-focus-mode`); not DOM, out of scope
  plugin   - belongs to a community plugin (dataview, tasks, kanban, ...)
  syntax   - Prism/CodeMirror token classes (`.token`, `.string`)
Native classes are grouped into UI areas so the spec can be organised by area.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

css_path, src_dir, out_path = sys.argv[1:4]
css = re.sub(r"/\*.*?\*/", "", Path(css_path).read_text(encoding="utf-8"), flags=re.S)

# ---- 1. selectors (same walker as measure_selectors.py) -------------------------------------
selectors, buf, stack, in_str, i = [], [], [], None, 0
while i < len(css):
    ch = css[i]
    if in_str:
        buf.append(ch)
        if ch == "\\":
            buf.append(css[i + 1] if i + 1 < len(css) else "")
            i += 2
            continue
        if ch == in_str:
            in_str = None
    elif ch in "\"'":
        in_str = ch
        buf.append(ch)
    elif ch == "{":
        prelude = "".join(buf).strip()
        buf = []
        if prelude.startswith("@"):
            kind = prelude.split()[0].lower()
            stack.append("skip" if kind in ("@keyframes", "@-webkit-keyframes", "@font-face", "@property", "@page") else "group")
        else:
            if "skip" not in stack:
                selectors.append(prelude)
            stack.append("rule")
    elif ch == "}":
        buf = []
        if stack:
            stack.pop()
    elif ch == ";" and (not stack or stack[-1] == "rule"):
        buf = []
    else:
        buf.append(ch)
    i += 1

# ---- 2. vocabularies ------------------------------------------------------------------------
NATIVE_BODY = {  # classes Obsidian itself puts on <body>
    "theme-light", "theme-dark", "is-mobile", "is-tablet", "is-phone", "is-hidden-frameless", "is-frameless",
    "is-translucent", "is-focused", "is-fullscreen", "is-popout-window", "is-grabbing", "native-scrollbars",
    "show-inline-title", "show-ribbon", "mod-windows", "mod-macos", "mod-linux", "is-ios", "is-android",
}
PLUGIN_PREFIX = ("dataview", "cards", "table-view", "kanban", "checklist-plugin", "tasks", "task-list-item-checkbox-plugin",
                 "excalidraw", "ExcalidrawView", "obsidian-", "cMenu", "calendar", "periodic", "templater", "contextual-typography",
                 "advanced-tables", "cm-hmd-", "block-language-", "mk-", "sync-", "workspaces-", "dv-", "style-settings", "setting-item-heading-plugin")
SYNTAX = {"token", "string", "variable", "function", "keyword", "comment", "operator", "number", "punctuation", "tag", "property",
          "selector", "boolean", "constant", "symbol", "builtin", "char", "attr-name", "attr-value", "class-name", "entity", "regex",
          "important", "url", "atrule", "prolog", "doctype", "cdata", "namespace", "deleted", "inserted", "bold", "italic", "title"}

AREAS = [  # (area, predicate on class name) — first match wins
    ("editor (CM6 / Live Preview)", lambda c: c.startswith(("cm-", "HyperMD", "markdown-source-view", "is-live-preview", "mod-cm6", "cm6", "CodeMirror")) or c in ("is-readable-line-width",)),
    ("reading view (rendered markdown)", lambda c: c.startswith(("markdown-preview", "markdown-rendered", "markdown-reading", "el-", "copy-code", "inline-title", "image-embed", "internal-embed", "frontmatter", "heading", "list-bullet", "list-collapse", "task-list", "callout", "footnote", "math", "table-wrapper", "block-language")) or c in ("internal-link", "external-link", "is-unresolved", "tag", "cm-hashtag", "is-checked", "contains-task-list")),
    ("workspace and tabs", lambda c: c.startswith(("workspace", "mod-top", "mod-primary", "mod-secondary", "mod-root", "mod-sidedock", "mod-left", "mod-right", "mod-stacked", "mod-active", "tab-", "view-header", "view-content", "view-actions", "view-action", "titlebar", "horizontal-main", "app-container", "clickable-icon", "sidebar-toggle", "side-dock", "mod-vertical", "mod-horizontal", "is-active", "is-collapsed", "is-focused", "is-hidden")) or c in ("mod-header",)),
    ("navigation (file explorer, tree)", lambda c: c.startswith(("nav-", "tree-item", "nav", "search-result", "search-input", "file-")) or c in ("is-clickable", "mod-collapsible")),
    ("status bar", lambda c: c.startswith(("status-bar",))),
    ("modals, menus, popovers", lambda c: c.startswith(("modal", "menu", "suggestion", "prompt", "popover", "notice", "tooltip", "hover-popover", "prompt-")) or c in ("mod-settings", "mod-community-plugin")),
    ("settings dialog", lambda c: c.startswith(("setting-", "vertical-tab", "mod-settings", "installed-plugins", "community-")) or c in ("checkbox-container",)),
    ("controls (buttons, inputs, toggles)", lambda c: c.startswith(("checkbox", "mod-cta", "mod-warning", "dropdown", "slider", "mod-muted", "text-icon-button")) or c in ("mod-cta",)),
    ("canvas, graph, bases, properties", lambda c: c.startswith(("canvas", "graph", "bases", "metadata", "property", "multi-select", "mod-bases", "kanban")) ),
]

def classify(cls):
    if cls in NATIVE_BODY:
        return "native", "body state"
    if cls in SYNTAX:
        return "syntax", ""
    if cls.startswith(PLUGIN_PREFIX):
        return "plugin", ""
    for area, pred in AREAS:
        if pred(cls):
            return "native", area
    return "unclassified", ""

# ---- 3. count classes; detect toggles (class in the first compound that starts with `body`) ---
class_re = re.compile(r"\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)")
counts, toggles = Counter(), Counter()
for sel_group in selectors:
    for sel in sel_group.split(","):
        sel = re.sub(r"\[[^\]]*\]", "", sel).strip()
        if not sel:
            continue
        first = re.split(r"[\s>+~]", sel, maxsplit=1)[0]
        first_classes = set(class_re.findall(first)) if first.startswith("body") or first.startswith(".theme-") else set()
        for cls in class_re.findall(sel):
            if cls in first_classes and cls not in NATIVE_BODY:
                toggles[cls] += 1
            else:
                counts[cls] += 1

# ---- 4. Slatebase vocabulary (class names that occur as tokens in app sources, not tests/compat) -----
tok_re = re.compile(r"[_a-zA-Z][_a-zA-Z0-9-]*")
present = Counter()
for path in Path(src_dir).rglob("*"):
    norm = str(path).replace("\\", "/")
    if path.suffix not in (".ts", ".tsx", ".css") or ".test." in path.name or "/plugins/compat/" in norm:
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        continue
    for t in set(tok_re.findall(text)):
        present[t] += 1

rows = []
by_kind = Counter()
by_area = defaultdict(lambda: [0, 0])
for cls, uses in counts.items():
    kind, area = classify(cls)
    if cls in toggles and kind == "unclassified":
        kind = "toggle"
    have = present.get(cls, 0)
    rows.append({"class": cls, "uses": uses, "kind": kind, "area": area, "slatebase_files": have})
    by_kind[kind] += uses
    if kind == "native":
        by_area[area][0] += uses
        if have == 0:
            by_area[area][1] += uses
for cls, uses in toggles.items():
    rows.append({"class": cls, "uses": uses, "kind": "toggle", "area": "", "slatebase_files": present.get(cls, 0)})
    by_kind["toggle"] += uses

rows.sort(key=lambda r: -r["uses"])
native_total = sum(v[0] for v in by_area.values())
native_missing = sum(v[1] for v in by_area.values())
result = {
    "selectors": len(selectors),
    "uses_by_kind": dict(by_kind),
    "native_uses": native_total,
    "native_uses_missing": native_missing,
    "areas": {k: {"uses": v[0], "missing_uses": v[1]} for k, v in sorted(by_area.items(), key=lambda kv: -kv[1][1])},
    "rows": rows,
}
Path(out_path).write_text(json.dumps(result, indent=1), encoding="utf-8")
print(f"{Path(css_path).name}: selectors={len(selectors)} kinds={dict(by_kind)} native={native_total} native_missing={native_missing} ({100*native_missing//max(native_total,1)}%)")
unc = [r for r in rows if r["kind"] == "unclassified"][:25]
print("unclassified top:", ", ".join(f".{r['class']}({r['uses']})" for r in unc))
