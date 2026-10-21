#!/usr/bin/env python3
"""Phase 0 probe: checks the Obsidian community theme catalog against reality.

For every catalog entry: does manifest.json / theme.css exist at the repo root (HEAD of the default branch), are they
within the planned limits, is the manifest valid JSON whose name matches the catalog name, and does the (normalized)
screenshot path resolve to an image?

Usage: python3 probe-catalog.py <out.json> [concurrency]  (re-running with an existing out.json only redoes entries without an HTTP answer)
Only talks to raw.githubusercontent.com (the same host the planned ThemeStoreClient uses). Reads are capped at limit+1.
"""
import json, re, sys, time, urllib.request, urllib.parse, urllib.error
from concurrent.futures import ThreadPoolExecutor

CATALOG = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-css-themes.json'
RAW = 'https://raw.githubusercontent.com/{repo}/HEAD/{path}'
CSS_LIMIT, MANIFEST_LIMIT, IMG_LIMIT = 2 * 1024 * 1024, 64 * 1024, 2 * 1024 * 1024
UA = {'User-Agent': 'Slatebase-Theme-Store-Probe/1.0'}


def get(url, limit, method='GET', attempts=4):
    """Status 0 means no HTTP answer at all (network error or throttling); it is retried with backoff and never counted as 404."""
    for attempt in range(attempts):
        req = urllib.request.Request(url, headers=UA, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read(limit + 1) if method == 'GET' else b''
                return r.status, body, r.headers.get('Content-Type', ''), r.headers.get('Content-Length')
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504):
                return e.code, b'', '', None
        except Exception:
            pass
        time.sleep(2 ** attempt)
    return 0, b'', '', None


def normalize_shot(p):
    p = (p or '').strip()
    if not p:
        return None
    p = re.sub(r'^(\./)+', '', p).lstrip('/')
    if not p or '..' in p.split('/'):
        return None
    return '/'.join(urllib.parse.quote(s) for s in p.split('/'))


def probe(entry):
    repo = entry['repo']
    out = {'name': entry['name'], 'repo': repo, 'legacy': bool(entry.get('legacy'))}
    s, body, _, _ = get(RAW.format(repo=repo, path='manifest.json'), MANIFEST_LIMIT)
    out['manifest'] = s
    out['manifest_big'] = len(body) > MANIFEST_LIMIT
    if s == 200 and not out['manifest_big']:
        try:
            m = json.loads(body.decode('utf-8-sig'))
            out['manifest_json'] = isinstance(m, dict)
            out['manifest_name'] = m.get('name') if isinstance(m, dict) else None
            out['manifest_version'] = m.get('version') if isinstance(m, dict) else None
        except Exception:
            out['manifest_json'] = False
    s, body, _, _ = get(RAW.format(repo=repo, path='theme.css'), CSS_LIMIT)
    out['css'] = s
    out['css_big'] = len(body) > CSS_LIMIT
    out['css_bytes'] = min(len(body), CSS_LIMIT + 1) if s == 200 else 0
    shot = normalize_shot(entry.get('screenshot'))
    out['shot_path'] = shot
    if shot:
        s, _, ct, cl = get(RAW.format(repo=repo, path=shot), 0, method='HEAD')
        out['shot'] = s
        out['shot_type'] = ct.split(';')[0]
        out['shot_big'] = bool(cl and cl.isdigit() and int(cl) > IMG_LIMIT)
    return out


def main():
    dst = sys.argv[1]
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    s, body, _, _ = get(CATALOG, 5 * 1024 * 1024)
    catalog = json.loads(body)
    # Resume: keep rows from a previous run that got real answers for everything, redo the rest.
    previous = {}
    try:
        for r in json.load(open(dst)):
            if r['manifest'] != 0 and r['css'] != 0 and r.get('shot', 200) != 0:
                previous[r['repo']] = r
    except (OSError, ValueError):
        pass
    todo = [e for e in catalog if e['repo'] not in previous]
    print('reusing', len(previous), '| probing', len(todo), flush=True)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        fresh = {r['repo']: r for r in ex.map(probe, todo)}
    rows = [previous.get(e['repo']) or fresh[e['repo']] for e in catalog]
    json.dump(rows, open(dst, 'w'), indent=1)

    def n(f):
        return sum(1 for r in rows if f(r))
    ok = lambda r: r['manifest'] == 200 and r.get('manifest_json') and r['css'] == 200 and not r['css_big']
    name_ok = lambda r: str(r.get('manifest_name', '')).lower() == r['name'].lower()
    print('entries', len(rows), '| no HTTP answer (status 0):', n(lambda r: r['manifest'] == 0 or r['css'] == 0 or r.get('shot') == 0))
    print('both files, valid manifest, css within limit:', n(ok))
    print('  of which manifest name == catalog name:', n(lambda r: ok(r) and name_ok(r)))
    print('manifest missing (non-200):', n(lambda r: r['manifest'] != 200), '| css missing:', n(lambda r: r['css'] != 200))
    print('manifest not valid JSON object:', n(lambda r: r['manifest'] == 200 and not r.get('manifest_json')))
    print('css over limit:', n(lambda r: r['css_big']), '| manifest over limit:', n(lambda r: r['manifest_big']))
    print('manifest name != catalog name (valid manifests):', n(lambda r: r.get('manifest_json') and not name_ok(r)))
    print('legacy:', n(lambda r: r['legacy']), '| legacy with both files:', n(lambda r: r['legacy'] and ok(r)))
    print('no screenshot path:', n(lambda r: not r['shot_path']), '| screenshot 200:', n(lambda r: r.get('shot') == 200),
          '| non-200:', n(lambda r: r.get('shot') not in (None, 200)))
    types = {}
    for r in rows:
        if r.get('shot') == 200:
            types[r['shot_type']] = types.get(r['shot_type'], 0) + 1
    print('screenshot content types:', types, '| over 2 MB:', n(lambda r: r.get('shot_big')))


main()
