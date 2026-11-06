#!/usr/bin/env python3
"""Build the small Windows source/launcher download served by GitHub Pages."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ('README.md', '시작.bat', 'app.py', 'core.py', 'windows_backend.py', 'requirements.txt', 'GUI_README.md', 'player_core.py', 'player_gui.py', 'player_ocr.py', 'windows_ocr.ps1', 'reroll_core.py', 'reroll_gui.py', 'ocr_session.py', 'skill_names.json')


def main():
    source = ROOT / 'tools/skill-capture'
    tables = json.loads((ROOT / 'src/data/skillProbabilities.json').read_text(encoding='utf-8'))['tables']
    names = {'batter': set(), 'pitcher': set()}
    for positions in tables.values():
        for position, rows in positions.items():
            names['pitcher' if position in ('SP', 'RP', 'CP') else 'batter'].update(row['name'] for row in rows)
    (source / 'skill_names.json').write_text(json.dumps({k: sorted(v) for k, v in names.items()}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    target = ROOT / 'public/downloads/steam-skill-capture-windows.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w') as bundle:
        for name in FILES:
            info = zipfile.ZipInfo('RivalsSkillCapture/' + name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            data = (source / name).read_bytes().replace(b'\r\n', b'\n')
            if name.endswith('.bat'):
                data = data.replace(b'\n', b'\r\n')
            bundle.writestr(info, data)
    alias=target.with_name('rivals-guide-capture-windows.zip')
    alias.write_bytes(target.read_bytes())
    print(target)
    print(alias)


if __name__ == '__main__':
    main()
