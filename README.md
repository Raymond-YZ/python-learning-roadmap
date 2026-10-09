# Python Learning Roadmap

A local web app that teaches Python as a guided curriculum: a roadmap of 12 modules
from first steps through a FastAPI capstone, with lessons, "coming from Java /
JavaScript" notes, and hands-on practice exercises with solutions.

Built for a programmer who can read Python but wants to write it fluently.

## Run it

```bash
python3 run.py
```

That serves the app at http://127.0.0.1:8765/ and opens it in your browser.
Press Ctrl+C to stop.

> Open it via `run.py`, not by double-clicking `index.html` — browsers block the
> curriculum file from loading over `file://`.

## Progress

Progress (completed lessons and exercises) is saved in your browser's
localStorage. Close the app, reopen it later — everything is still there.
The port is fixed (8765) so the browser always finds your saved data.

To start over, use **Progress → Reset all progress** in the app.

## What's inside

- `index.html`, `styles.css`, `app.js` — the app (no dependencies, no build step)
- `curriculum/index.json` — module list, titles, and lesson/exercise ids (loaded first)
- `curriculum/modules/<id>.json` — full lesson and exercise content, one file per module
  (kept small so each file stays well under hosting push limits)
- `content/part1.json`, `content/part2.json` — curriculum source; rebuilt into
  `curriculum/` with `python3 content/build.py`
- `run.py` — the launcher
- `design/` — UI mockup used during design (not published)

## Curriculum

1. Setup & First Steps
2. Variables & Data Types
3. Control Flow
4. Lists, Tuples, Dicts & Sets
5. Functions
6. Error Handling
7. File I/O
8. Modules, Packages & Environments
9. Object-Oriented Python
10. Intermediate Python
11. Testing & Debugging
12. Capstone: Build a Tiny API
