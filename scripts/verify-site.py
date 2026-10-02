"""Validate the complete country data and local assets before publishing."""
import json
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def verify(source=ROOT / 'dist'):
    source = Path(source)
    required = ['index.html', 'app.js', 'style.css', 'countries.json', 'countries-manifest.json', 'COUNTRIES-LICENSE.txt', 'favicon.ico', 'favicon.svg', 'site.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
    if any(not (source / name).is_file() for name in required):
        raise ValueError('A required site, license or shortcut icon file is missing.')
    data = json.loads((source / 'countries.json').read_text(encoding='utf-8'))
    manifest = json.loads((source / 'countries-manifest.json').read_text(encoding='utf-8'))
    if len(data) != 195 or manifest['countryCount'] != 195 or len({p['id'] for p in data}) != 195:
        raise ValueError('All 195 unique countries are required.')
    if sum(bool(p['familiar']) for p in data) != 30 or len({p['continent'] for p in data}) != 6:
        raise ValueError('Difficulty or continent coverage is incomplete.')
    if manifest['unMemberCount'] != 193 or manifest['observerCount'] != 2:
        raise ValueError('Country coverage does not match the source manifest.')
    for p in data:
        name = p['image']
        if not name.startswith('assets/') or '..' in Path(name).parts:
            raise ValueError('Every flag must use a safe local asset path.')
        asset = source / name
        if not asset.is_file() or asset.is_symlink() or asset.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError(f'Missing or invalid flag: {name}')
        if not p['name'] or not p['englishName'] or p['name'] not in p['aliases']:
            raise ValueError('Country names and aliases are incomplete.')
    normalize = lambda name: ''.join(c for c in unicodedata.normalize('NFKC', name).lower() if c.isalnum())
    owners = defaultdict(set)
    for p in data:
        for name in p['aliases']:
            owners[normalize(name)].add(p['id'])
    if any(len(owners[normalize(p['name'])]) != 1 for p in data):
        raise ValueError('Canonical country names must not become ambiguous quiz answers.')
    html = (source / 'index.html').read_text(encoding='utf-8')
    if 'app.js' not in html or 'style.css' not in html:
        raise ValueError('The entry page must load the app and stylesheet.')
    if 'Open Database' not in (source / 'COUNTRIES-LICENSE.txt').read_text(encoding='utf-8'):
        raise ValueError('The country database license must be included.')
    for path in source.rglob('*'):
        if path.is_symlink() or any(part.startswith('.') for part in path.relative_to(source).parts):
            raise ValueError(f'Private files or symlinks cannot be published: {path}')
    return {'countries': len(data), 'flags': len(list((source / 'assets').rglob('*.png')))}


if __name__ == '__main__':
    print('Verified site:', verify())
