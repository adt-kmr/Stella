"""Pytest bootstrap: make ``api`` and ``pipeline`` importable.

Also honored by ``[tool.pytest.ini_options].pythonpath`` in pyproject.toml.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for pkg in ("api", "pipeline"):
    (ROOT / pkg).mkdir(exist_ok=True)
    sys.path.insert(0, str(ROOT))
