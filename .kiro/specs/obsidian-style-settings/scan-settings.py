#!/usr/bin/env python3
"""Spike scan: which Style Settings (`/* @settings ... */`) blocks do Obsidian community themes declare, and of what kind?

Usage: python3 scan-settings.py <out-dir> [all|sel.json] [concurrency]
  all        every catalog theme (raw.githubusercontent.com only, polite: 3 parallel requests by default)
  sel.json   a list of catalog entries (same shape as community-css-themes.json)

Downloads each theme.css once into <out-dir>/css/ (reused on re-run), parses every @settings block as YAML and writes
<out-dir>/settings.json with, per theme: the setting ids and types, and which body classes / CSS variables they control.
Style Settings setting types: heading, class-toggle, class-select, variable-text, variable-number,
variable-number-slider, variable-select, variable-color, variable-themed-color.
"""
import json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
import yaml

UA = {'User-Agent': 'Slatebase-StyleSettings-Spike/1.0'}
CATALOG = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-css-themes.json'
RAW = 'https://raw.githubusercontent.com/{repo}/HEAD/theme.css'
LIMIT = 3 * 1024 * 1024
BLOCK = re.compile(r'/\*\s*@settings\s*\r?\n(.*?)\*/', re.S)


def get(url, attempts=4):
    for i in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.status, r.read(LIMIT + 1)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504):
                return e.code, b''
        except Exception:
            pass
        time.sleep(2 ** i)
    return 0, b''


def load_css(out, entry):
    path = os.path.join(out, 'css', entry['repo'].replace('/', '__') + '.css')
    if os.path.exists(path):
        return open(path, 'rb').read()
    status, body = get(RAW.format(repo=entry['repo']))
    if status == 200 and len(body) <= LIMIT:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'wb').write(body)
        return body
    return None


def parse_blocks(css_text):
    """Returns (settings, errors): a flat list of setting dicts over all @settings blocks and the YAML errors seen."""
    settings, errors, name = [], [], None
    for m in BLOCK.finditer(css_text):
        try:
            # Several themes (Minimal, Things, Primary) indent with tabs, which strict YAML rejects; the plugin's own
            # loader copes, so leading tabs are read as two spaces each.
            doc = yaml.safe_load(re.sub(r'^\t+', lambda t: '  ' * len(t.group()), m.group(1), flags=re.M))
        except Exception as e:
            errors.append(str(e)[:120])
            continue
        if not isinstance(doc, dict):
            continue
        name = name or doc.get('name')
        for s in doc.get('settings') or []:
            if isinstance(s, dict):
                settings.append(s)
    return settings, errors, name


def summarize(entry, css):
    text = css.decode('utf-8', 'replace')
    settings, errors, plugin_name = parse_blocks(text)
    types = {}
    classes, variables = [], []
    for s in settings:
        t = str(s.get('type'))
        types[t] = types.get(t, 0) + 1
        if t == 'class-toggle' and s.get('id'):
            classes.append(str(s['id']))
        elif t == 'class-select':
            for o in s.get('options') or []:
                v = o.get('value') if isinstance(o, dict) else o
                if v:
                    classes.append(str(v))
        elif t.startswith('variable') and s.get('id'):
            variables.append(str(s['id']))
    return {'name': entry['name'], 'repo': entry['repo'], 'blocks': len(BLOCK.findall(text)), 'yaml_errors': errors,
            'settings': len(settings), 'types': types, 'classes': classes, 'variables': variables,
            'bytes': len(css), 'settings_name': plugin_name}


def main():
    out = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else 'all'
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    if src == 'all':
        status, body = get(CATALOG)
        entries = json.loads(body)
    else:
        entries = json.load(open(src))

    def one(entry):
        css = load_css(out, entry)
        return None if css is None else summarize(entry, css)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        rows = list(ex.map(one, entries))
    ok = [r for r in rows if r is not None]
    json.dump({'themes': ok, 'unavailable': [e['name'] for e, r in zip(entries, rows) if r is None]}, open(os.path.join(out, 'settings.json'), 'w'), indent=1)

    with_settings = [r for r in ok if r['settings'] > 0]
    totals = {}
    for r in ok:
        for t, n in r['types'].items():
            totals[t] = totals.get(t, 0) + n
    print('themes scanned:', len(ok), '| unavailable:', len(rows) - len(ok))
    print('with @settings:', len(with_settings), f'({100 * len(with_settings) // max(len(ok), 1)} %)', '| YAML errors in', sum(1 for r in ok if r['yaml_errors']), 'themes')
    print('setting types (all themes):', dict(sorted(totals.items(), key=lambda kv: -kv[1])))
    print('top by setting count:', [(r['name'], r['settings']) for r in sorted(with_settings, key=lambda r: -r['settings'])[:12]])


main()
