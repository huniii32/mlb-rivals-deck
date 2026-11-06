#!/usr/bin/env python3
"""Build the small Windows source/launcher download served by GitHub Pages."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ('README.md', '시작.bat', 'app.py', 'core.py', 'windows_backend.py', 'requirements.txt')


def main():
    source = ROOT / 'tools/skill-capture'
    target = ROOT / 'public/downloads/steam-skill-capture-windows.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w') as bundle:
        for name in FILES:
            info = zipfile.ZipInfo('RivalsSkillCapture/' + name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            data = (source / name).read_bytes()
            if name.endswith('.bat'):
                data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            bundle.writestr(info, data)
    print(target)


if __name__ == '__main__':
    main()
