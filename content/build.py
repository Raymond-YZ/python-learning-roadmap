#!/usr/bin/env python3
"""Build curriculum/index.json + curriculum/modules/<id>.json from content/part1.json + part2.json.

Per-module files keep every GitHub push small (the push API corrupts binaries
and rejects very large single files, so one big curriculum.json is avoided).
Run from the repo root:  python3 content/build.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = ROOT / "curriculum"
(OUT / "modules").mkdir(parents=True, exist_ok=True)

modules = []
for part in ("part1.json", "part2.json"):
    data = json.loads((CONTENT / part).read_text(encoding="utf-8"))
    assert data["version"] == 1
    modules.extend(data["modules"])

seen = set()
index_modules = []
for m in modules:
    assert m["id"] not in seen, f"duplicate module id {m['id']}"
    seen.add(m["id"])
    (OUT / "modules" / f"{m['id']}.json").write_text(
        json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    index_modules.append(
        {
            "id": m["id"],
            "title": m["title"],
            "tagline": m.get("tagline", ""),
            "estimatedMinutes": m.get("estimatedMinutes", 0),
            "lessons": [
                {"id": l["id"], "title": l["title"], "minutes": l.get("minutes", 0)}
                for l in m["lessons"]
            ],
            "exercises": [
                {
                    "id": e["id"],
                    "title": e["title"],
                    "difficulty": e.get("difficulty", ""),
                }
                for e in m["exercises"]
            ],
        }
    )

(OUT / "index.json").write_text(
    json.dumps({"version": 1, "modules": index_modules}, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)

n_lessons = sum(len(m["lessons"]) for m in modules)
n_ex = sum(len(m["exercises"]) for m in modules)
print(f"wrote {len(modules)} module files, {n_lessons} lessons, {n_ex} exercises")
for f in sorted((OUT / "modules").glob("*.json")):
    print(f"  {f.name}: {f.stat().st_size / 1024:.1f} KB")
print(f"  index.json: {(OUT / 'index.json').stat().st_size / 1024:.1f} KB")
