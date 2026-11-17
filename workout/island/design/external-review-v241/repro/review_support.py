"""Write reproduction output outside the checkout; no real user profile is used."""
import os
import tempfile
from pathlib import Path


def out_path(name=''):
    root = Path(os.environ.get('V241_REPRO_OUTPUT', str(Path(tempfile.gettempdir()) / 'external-review-v241')))
    root.mkdir(parents=True, exist_ok=True)
    return str(root / name)
