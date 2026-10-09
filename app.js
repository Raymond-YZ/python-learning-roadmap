'use strict';
/*
 * Python Learning Roadmap — app logic. No dependencies.
 * Progress is stored in localStorage under a fixed key, so closing and
 * reopening the app (served from the same origin by run.py) keeps it.
 */

const INDEX_URL = 'curriculum/index.json';
const STORAGE_KEY = 'pyroadmap.progress.v1';

const moduleUrl = (id) => 'curriculum/modules/' + id + '.json';

const state = {
  curriculum: null, // { version, modules: [...] } — light index entries until a module is opened
  moduleCache: {}, // id -> full module object
  progress: { lessons: {}, exercises: {}, updatedAt: null },
  loadError: null,
};

// Full module objects replace their light index entries once loaded,
// so moduleStats() and friends work on either form.
async function ensureModule(id) {
  if (state.moduleCache[id]) return state.moduleCache[id];
  const r = await fetch(moduleUrl(id));
  if (!r.ok) throw new Error('HTTP ' + r.status + ' loading ' + moduleUrl(id));
  const mod = await r.json();
  state.moduleCache[id] = mod;
  const i = state.curriculum.modules.findIndex((m) => m.id === id);
  if (i >= 0) state.curriculum.modules[i] = mod;
  return mod;
}

function moduleOfLesson(lessonId) {
  for (const m of state.curriculum.modules)
    if (m.lessons.some((l) => l.id === lessonId)) return m.id;
  return null;
}

function moduleOfExercise(exerciseId) {
  for (const m of state.curriculum.modules)
    if (m.exercises.some((e) => e.id === exerciseId)) return m.id;
  return null;
}

/* ---------------- progress store ---------------- */

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state.progress = {
        lessons: p && p.lessons ? p.lessons : {},
        exercises: p && p.exercises ? p.exercises : {},
        updatedAt: (p && p.updatedAt) || null,
      };
    }
  } catch (e) {
    state.progress = { lessons: {}, exercises: {}, updatedAt: null };
  }
}

function saveProgress() {
  state.progress.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  } catch (e) {
    /* storage unavailable — progress just won't persist */
  }
}

function resetProgress() {
  state.progress = { lessons: {}, exercises: {}, updatedAt: null };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

const lessonDone = (id) => !!state.progress.lessons[id];
const exerciseDone = (id) => !!state.progress.exercises[id];

/* ---------------- curriculum helpers ---------------- */

function allLessons() {
  const out = [];
  for (const mod of state.curriculum.modules)
    for (const l of mod.lessons) out.push({ module: mod, lesson: l });
  return out;
}

function allExercises() {
  const out = [];
  for (const mod of state.curriculum.modules)
    for (const ex of mod.exercises) out.push({ module: mod, exercise: ex });
  return out;
}

function findModule(id) {
  return state.curriculum.modules.find((m) => m.id === id) || null;
}

function moduleStats(mod) {
  const lt = mod.lessons.length, et = mod.exercises.length;
  const ld = mod.lessons.filter((l) => lessonDone(l.id)).length;
  const ed = mod.exercises.filter((e) => exerciseDone(e.id)).length;
  return { total: lt + et, done: ld + ed, lessonsTotal: lt, lessonsDone: ld, exTotal: et, exDone: ed };
}

function overallStats() {
  let total = 0, done = 0, lt = 0, ld = 0, et = 0, ed = 0;
  for (const mod of state.curriculum.modules) {
    const s = moduleStats(mod);
    total += s.total; done += s.done;
    lt += s.lessonsTotal; ld += s.lessonsDone; et += s.exTotal; ed += s.exDone;
  }
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct, lessonsTotal: lt, lessonsDone: ld, exTotal: et, exDone: ed };
}

function firstIncomplete() {
  for (const { module, lesson } of allLessons())
    if (!lessonDone(lesson.id)) return { kind: 'lesson', module, id: lesson.id };
  for (const { module, exercise } of allExercises())
    if (!exerciseDone(exercise.id)) return { kind: 'exercise', module, id: exercise.id };
  return null;
}

/* ---------------- markdown (supported subset) ---------------- */

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(src) {
  if (!src) return '';
  // 1. extract fenced code blocks
  const codeBlocks = [];
  let text = String(src).replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => {
    codeBlocks.push({ lang: (lang || 'python').toLowerCase(), code: code.replace(/\n$/, '') });
    return '\uE000CODE' + (codeBlocks.length - 1) + '\uE000';
  });
  // 2. escape everything else
  text = escapeHtml(text);
  // 3. extract inline code spans
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (m, c) => {
    inlineCodes.push(c);
    return '\uE000INLINE' + (inlineCodes.length - 1) + '\uE000';
  });
  // 4. block parse
  const inline = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const lines = text.split('\n');
  let html = '';
  let i = 0;
  const isCode = (l) => /^\uE000CODE\d+\uE000$/.test(l);
  const isList = (l) => /^(- |\d+\. )/.test(l);
  const isHead = (l) => /^#{1,3} /.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (isCode(line)) {
      const b = codeBlocks[+line.match(/\d+/)[0]];
      html += codeHtml(b.code, b.lang);
      i++;
    } else if (isHead(line)) {
      const level = line.match(/^#+/)[0].length;
      html += '<h' + (level + 1) + '>' + inline(line.replace(/^#{1,3} /, '')) + '</h' + (level + 1) + '>';
      i++;
    } else if (isList(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (i < lines.length && isList(lines[i])) {
        items.push(inline(lines[i].replace(/^(- |\d+\. )/, '')));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      html += '<' + tag + '><li>' + items.join('</li><li>') + '</li></' + tag + '>';
    } else if (line.trim() === '') {
      i++;
    } else {
      const parts = [];
      while (i < lines.length && lines[i].trim() !== '' && !isHead(lines[i]) && !isList(lines[i]) && !isCode(lines[i])) {
        parts.push(lines[i]);
        i++;
      }
      html += '<p>' + inline(parts.join(' ')) + '</p>';
    }
  }
  // 5. restore inline code
  html = html.replace(/\uE000INLINE(\d+)\uE000/g, (m, n) => '<code>' + inlineCodes[+n] + '</code>');
  return html;
}

/* ---------------- python syntax highlighting ---------------- */

const PY_TOKEN = new RegExp(
  '(#[^\\n]*)' +
  '|(f?(?:"""[\\s\\S]*?"""|' + "'''[\\s\\S]*?'''" + '|"(?:[^"\\\\\\n]|\\\\.)*"|' + "'(?:[^'\\\\\\n]|\\\\.)*'))" +
  '|\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|lambda|pass|break|continue|in|is|not|and|or|None|True|False|yield|assert|del|global|nonlocal|match|case)\\b' +
  '|(\\b\\d[\\d_]*(?:\\.\\d+)?\\b)' +
  '|(@[A-Za-z_]\\w*)' +
  '|\\b(print|len|range|str|int|float|bool|list|dict|set|tuple|type|isinstance|issubclass|open|enumerate|zip|map|filter|sorted|reversed|sum|min|max|abs|input|repr|super|Exception|ValueError|TypeError|KeyError|IndexError|AttributeError|RuntimeError|StopIteration|NotImplementedError|property|staticmethod|classmethod)\\b' +
  '|([A-Za-z_]\\w*)',
  'g'
);

function highlightPython(code) {
  let out = '';
  let last = 0;
  let expectDefName = false;
  PY_TOKEN.lastIndex = 0;
  let m;
  while ((m = PY_TOKEN.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    if (m[1]) out += '<span class="tok-com">' + escapeHtml(tok) + '</span>';
    else if (m[2]) out += '<span class="tok-str">' + escapeHtml(tok) + '</span>';
    else if (m[3]) {
      out += '<span class="tok-kw">' + escapeHtml(tok) + '</span>';
      if (tok === 'def' || tok === 'class') expectDefName = true;
    }
    else if (m[4]) out += '<span class="tok-num">' + escapeHtml(tok) + '</span>';
    else if (m[5]) out += '<span class="tok-deco">' + escapeHtml(tok) + '</span>';
    else if (m[6]) out += '<span class="tok-bi">' + escapeHtml(tok) + '</span>';
    else if (m[7]) {
      if (expectDefName) {
        out += '<span class="tok-fn">' + escapeHtml(tok) + '</span>';
        expectDefName = false;
      } else {
        out += escapeHtml(tok);
      }
    }
    last = m.index + tok.length;
    if (tok.length === 0) PY_TOKEN.lastIndex++;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

let codeCounter = 0;
function codeHtml(code, lang) {
  const id = 'code-' + (++codeCounter);
  const body = lang === 'python' ? highlightPython(code) : escapeHtml(code);
  return (
    '<div class="codeblock"><div class="codeblock-bar"><span>' + escapeHtml(lang) +
    '</span><button type="button" data-action="copy" data-target="' + id + '">Copy</button></div>' +
    '<pre><code id="' + id + '">' + body + '</code></pre></div>'
  );
}

/* ---------------- shared chrome ---------------- */

function renderChrome() {
  const s = overallStats();
  document.getElementById('side-pct').textContent = s.pct + '%';
  document.getElementById('side-bar').style.width = s.pct + '%';
  document.getElementById('ring-pct').textContent = s.pct + '%';
  const C = 119.4;
  document.getElementById('ring-fg').style.strokeDashoffset = String(C - (C * s.pct) / 100);

  // sidebar module nav
  const mods = state.curriculum.modules;
  let firstOpen = -1;
  const doneFlags = mods.map((m) => {
    const st = moduleStats(m);
    return st.total > 0 && st.done === st.total;
  });
  for (let i = 0; i < mods.length; i++) {
    if (!doneFlags[i]) { firstOpen = i; break; }
  }
  document.getElementById('module-nav').innerHTML = mods.map((m, i) => {
    const cls = doneFlags[i] ? 'done' : (i === firstOpen ? 'current' : '');
    const mark = doneFlags[i] ? '<span class="st">✓</span>' : (i === firstOpen ? '<span class="st">▸</span>' : '<span class="st"></span>');
    return (
      '<a class="mod-link ' + cls + '" href="#/module/' + m.id + '">' +
      '<span class="num">' + (i + 1) + '</span>' +
      '<span class="ttl">' + escapeHtml(m.title) + '</span>' + mark + '</a>'
    );
  }).join('');

  // active tab
  const h = location.hash || '#/';
  document.querySelectorAll('.tabs a').forEach((a) => {
    const tab = a.getAttribute('data-tab');
    const active =
      (tab === 'roadmap' && (h === '#/' || h === '' || h.startsWith('#/module') || h.startsWith('#/lesson'))) ||
      (tab === 'practice' && (h.startsWith('#/practice') || h.startsWith('#/exercise'))) ||
      (tab === 'progress' && h.startsWith('#/progress'));
    a.classList.toggle('active', !!active);
  });
}

function statusChipFor(mod) {
  const st = moduleStats(mod);
  if (st.total > 0 && st.done === st.total) return '<span class="chip status-done">Completed</span>';
  if (st.done > 0) return '<span class="chip status-current">In progress</span>';
  return '<span class="chip">Not started</span>';
}

function toggleBtn(kind, id, done) {
  const label = kind === 'lesson' ? 'lesson' : 'exercise';
  return '<button type="button" class="btn ' + (done ? 'done-state' : '') + '" data-action="toggle-' +
    kind + '" data-id="' + id + '">' + (done ? '✓ ' + label + ' complete' : 'Mark ' + label + ' complete') + '</button>';
}

/* ---------------- views ---------------- */

function viewRoadmap() {
  const s = overallStats();
  const next = firstIncomplete();
  const continueHtml = next
    ? '<a class="btn" href="#/' + next.kind + '/' + next.id + '">Continue: ' + escapeHtml(nextTitle(next)) + ' →</a>'
    : '<a class="btn" href="#/progress">Review your progress →</a>';
  const cards = state.curriculum.modules.map((m, i) => {
    const st = moduleStats(m);
    const pct = st.total === 0 ? 0 : Math.round((st.done / st.total) * 100);
    const cls = st.total > 0 && st.done === st.total ? 'done' : '';
    return (
      '<a class="card mod-card ' + cls + '" href="#/module/' + m.id + '">' +
      '<div class="mod-card-top"><span class="mod-num">' + (i + 1) + '</span>' +
      '<div><h3>' + escapeHtml(m.title) + '</h3><p class="tagline">' + escapeHtml(m.tagline || '') + '</p></div></div>' +
      '<div class="mod-card-meta"><div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="counts">' + st.done + '/' + st.total + ' complete · ~' + m.estimatedMinutes + ' min</span>' +
      statusChipFor(m) + '</div></a>'
    );
  }).join('');
  return (
    '<div class="card hero"><h2>Your Python roadmap</h2>' +
    '<p>Twelve modules, basics to a working API. Lessons teach, exercises make it stick — ' +
    'with Java and JavaScript comparisons throughout since that\'s where you\'re coming from.</p>' +
    '<div class="stats-row">' +
    '<span class="stat"><b>' + s.lessonsDone + '/' + s.lessonsTotal + '</b>lessons</span>' +
    '<span class="stat"><b>' + s.exDone + '/' + s.exTotal + '</b>exercises</span>' +
    '<span class="stat"><b>' + s.pct + '%</b>complete</span>' +
    '</div>' + continueHtml + '</div>' + cards
  );
}

function nextTitle(next) {
  for (const m of state.curriculum.modules) {
    if (next.kind === 'lesson') {
      const l = m.lessons.find((x) => x.id === next.id);
      if (l) return l.title;
    } else {
      const e = m.exercises.find((x) => x.id === next.id);
      if (e) return e.title;
    }
  }
  return '';
}

function viewModule(mod) {
  if (!mod) return notFound('Module not found.');
  const idx = state.curriculum.modules.findIndex((m) => m.id === mod.id);
  const prev = state.curriculum.modules[idx - 1];
  const next = state.curriculum.modules[idx + 1];
  const mst = moduleStats(mod);
  const mAllDone = mst.total > 0 && mst.done === mst.total;
  const modToggleBtn = '<button type="button" class="btn ' + (mAllDone ? 'done-state' : 'ghost') +
    '" data-action="toggle-module" data-id="' + mod.id + '">' +
    (mAllDone ? '✓ Module complete' : 'I already know this — mark module complete') + '</button>';
  const lessons = mod.lessons.map((l) =>
    '<a class="lesson-row" href="#/lesson/' + l.id + '">' +
    '<span class="checkbox ' + (lessonDone(l.id) ? 'on' : '') + '">' + (lessonDone(l.id) ? '✓' : '') + '</span>' +
    '<span class="t">' + escapeHtml(l.title) + '</span>' +
    '<span class="mins">' + (l.minutes || '') + (l.minutes ? ' min' : '') + '</span></a>'
  ).join('');
  const exercises = mod.exercises.map((e) =>
    '<a class="exercise-row" href="#/exercise/' + e.id + '">' +
    '<span class="done-mark">' + (exerciseDone(e.id) ? '✓' : '') + '</span>' +
    '<span class="t">' + escapeHtml(e.title) + '</span>' +
    '<span class="chip ' + e.difficulty + '">' + escapeHtml(e.difficulty || '') + '</span></a>'
  ).join('');
  return (
    '<div class="crumb"><a href="#/">Roadmap</a> · Module ' + (idx + 1) + ' of ' + state.curriculum.modules.length + '</div>' +
    '<div class="card"><h2 style="margin:0 0 6px">' + escapeHtml(mod.title) + '</h2>' +
    '<p style="margin:0 0 4px;color:var(--muted)">' + escapeHtml(mod.tagline || '') + '</p>' +
    '<p class="note-small">~' + mod.estimatedMinutes + ' min · ' + mod.lessons.length + ' lessons · ' + mod.exercises.length + ' exercises</p>' +
    '<div style="margin-top:14px">' + modToggleBtn + '</div></div>' +
    '<div class="section-head">Lessons</div><div class="card" style="padding:6px 18px">' + lessons + '</div>' +
    '<div class="section-head">Practice</div><div class="exercise-list">' + exercises + '</div>' +
    '<div class="pager">' +
    (prev ? '<a href="#/module/' + prev.id + '"><span>← Previous module</span>' + escapeHtml(prev.title) + '</a>' : '<span></span>') +
    (next ? '<a href="#/module/' + next.id + '" style="text-align:right"><span>Next module →</span>' + escapeHtml(next.title) + '</a>' : '<span></span>') +
    '</div>'
  );
}

function viewLesson(mod, id) {
  const l = mod.lessons.find((x) => x.id === id);
  if (!l) return notFound('Lesson not found.');
  const flat = allLessons();
  const i = flat.findIndex((x) => x.lesson.id === id);
  const prev = flat[i - 1], next = flat[i + 1];
  const done = lessonDone(id);
  let html =
    '<div class="crumb"><a href="#/">Roadmap</a> · <a href="#/module/' + mod.id + '">' + escapeHtml(mod.title) + '</a></div>' +
    '<div class="card"><h2 style="margin:0 0 4px">' + escapeHtml(l.title) + '</h2>' +
    '<p class="lesson-meta">' + (l.minutes ? 'About ' + l.minutes + ' minutes · ' : '') + 'Module: ' + escapeHtml(mod.title) + '</p>' +
    '<div class="lesson-body">' + renderMarkdown(l.body) + '</div>';
  if (l.jsNote) {
    html += '<div class="callout"><h4>Coming from Java / JavaScript</h4><div class="lesson-body">' + renderMarkdown(l.jsNote) + '</div></div>';
  }
  if (l.keyPoints && l.keyPoints.length) {
    html += '<div class="keypoints"><h4>Key takeaways</h4><ul>' +
      l.keyPoints.map((k) => '<li>' + renderMarkdown(k).replace(/^<p>|<\/p>$/g, '') + '</li>').join('') + '</ul></div>';
  }
  html += '<div class="complete-row">' + toggleBtn('lesson', id, done) + '</div></div>';
  html += '<div class="pager">' +
    (prev ? '<a href="#/lesson/' + prev.lesson.id + '"><span>← Previous lesson</span>' + escapeHtml(prev.lesson.title) + '</a>' : '<span></span>') +
    (next ? '<a href="#/lesson/' + next.lesson.id + '" style="text-align:right"><span>Next lesson →</span>' + escapeHtml(next.lesson.title) + '</a>' : '<span></span>') +
    '</div>';
  return html;
}

function viewExercise(mod, id) {
  const e = mod.exercises.find((x) => x.id === id);
  if (!e) return notFound('Exercise not found.');
  const flat = allExercises();
  const i = flat.findIndex((x) => x.exercise.id === id);
  const prev = flat[i - 1], next = flat[i + 1];
  const done = exerciseDone(id);
  let html =
    '<div class="crumb"><a href="#/">Roadmap</a> · <a href="#/module/' + mod.id + '">' + escapeHtml(mod.title) + '</a> · Practice</div>' +
    '<div class="card"><h2 style="margin:0 0 8px">' + escapeHtml(e.title) + '</h2>' +
    '<p><span class="chip ' + (e.difficulty || '') + '">' + escapeHtml(e.difficulty || 'exercise') + '</span></p>' +
    '<div class="lesson-body">' + renderMarkdown(e.prompt) + '</div>';
  if (e.starterCode) {
    html += '<div class="section-head">Starter code</div>' + codeHtml(e.starterCode, 'python');
  }
  if (e.hints && e.hints.length) {
    html += '<div class="toggle-block"><button type="button" data-action="show-hints">Show hints (' + e.hints.length + ')</button>' +
      '<ul class="hints-list hidden" id="hints-block">' + e.hints.map((h) => '<li>' + escapeHtml(h) + '</li>').join('') + '</ul></div>';
  }
  html += '<div class="toggle-block"><button type="button" data-action="show-solution">Show solution</button>' +
    '<div id="solution-block" class="hidden">' + codeHtml(e.solution, 'python') + '</div></div>';
  html += '<div class="complete-row">' + toggleBtn('exercise', id, done) +
    '<span class="note-small">Try it in your own editor first — the solution is there when you need it.</span></div></div>';
  html += '<div class="pager">' +
    (prev ? '<a href="#/exercise/' + prev.exercise.id + '"><span>← Previous exercise</span>' + escapeHtml(prev.exercise.title) + '</a>' : '<span></span>') +
    (next ? '<a href="#/exercise/' + next.exercise.id + '" style="text-align:right"><span>Next exercise →</span>' + escapeHtml(next.exercise.title) + '</a>' : '<span></span>') +
    '</div>';
  return html;
}

function viewPractice() {
  const groups = state.curriculum.modules.map((m) => {
    const rows = m.exercises.map((e) =>
      '<a class="exercise-row" href="#/exercise/' + e.id + '">' +
      '<span class="done-mark">' + (exerciseDone(e.id) ? '✓' : '') + '</span>' +
      '<span class="t">' + escapeHtml(e.title) + '</span>' +
      '<span class="chip ' + (e.difficulty || '') + '">' + escapeHtml(e.difficulty || '') + '</span></a>'
    ).join('');
    return '<div class="section-head">' + escapeHtml(m.title) + '</div><div class="exercise-list">' + rows + '</div>';
  }).join('');
  const s = overallStats();
  return '<div class="card hero"><h2>Practice</h2><p>' + s.exDone + ' of ' + s.exTotal +
    ' exercises done. Work them in order, or jump around — they\'re yours.</p></div>' + groups;
}

function viewProgress() {
  const s = overallStats();
  const rows = state.curriculum.modules.map((m, i) => {
    const st = moduleStats(m);
    const pct = st.total === 0 ? 0 : Math.round((st.done / st.total) * 100);
    return '<a class="lesson-row" href="#/module/' + m.id + '">' +
      '<span class="checkbox ' + (st.total > 0 && st.done === st.total ? 'on' : '') + '">' + (st.total > 0 && st.done === st.total ? '✓' : '') + '</span>' +
      '<span class="t">' + (i + 1) + '. ' + escapeHtml(m.title) + '</span>' +
      '<span class="mins">' + st.done + '/' + st.total + '</span></a>';
  }).join('');
  return (
    '<div class="card hero"><h2>Your progress</h2>' +
    '<div class="stats-row">' +
    '<span class="stat"><b>' + s.pct + '%</b>complete</span>' +
    '<span class="stat"><b>' + s.lessonsDone + '/' + s.lessonsTotal + '</b>lessons</span>' +
    '<span class="stat"><b>' + s.exDone + '/' + s.exTotal + '</b>exercises</span>' +
    '</div>' +
    '<p class="note-small">Progress is saved in this browser on this machine — close the app and reopen it, everything is still here.</p></div>' +
    '<div class="card" style="padding:6px 18px">' + rows + '</div>' +
    '<div class="card"><h3 style="margin-top:0">Backup</h3>' +
    '<p class="note-small">Download your progress as a file, or restore it from a backup — ' +
    'handy if you ever clear your browser\'s site data.</p>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
    '<button type="button" class="btn ghost" data-action="export-progress">Export progress</button>' +
    '<button type="button" class="btn ghost" data-action="import-progress">Import backup</button>' +
    '<input type="file" id="import-file" accept=".json,application/json" class="hidden">' +
    '</div><p class="note-small" id="import-msg"></p></div>' +
    '<div class="card"><h3 style="margin-top:0">Start over</h3>' +
    '<p class="note-small">Clears all lesson and exercise progress on this machine. This can\'t be undone.</p>' +
    '<button type="button" class="btn danger" data-action="reset">Reset all progress</button></div>'
  );
}

function notFound(msg) {
  return '<div class="card error-card"><h2>Not found</h2><p class="note-small">' +
    escapeHtml(msg) + '</p><a class="btn ghost" href="#/">Back to roadmap</a></div>';
}

/* ---------------- router ---------------- */

let routeToken = 0;
async function route() {
  const myToken = ++routeToken;
  const view = document.getElementById('view');
  const render = (html) => {
    if (myToken !== routeToken) return; // a newer navigation already won
    view.innerHTML = html;
    renderChrome();
    window.scrollTo(0, 0);
  };
  if (state.loadError) {
    render('<div class="card error-card"><h2>Couldn\'t load the curriculum</h2>' +
      '<p class="note-small">' + escapeHtml(state.loadError) + '</p>' +
      '<p class="note-small">Run the app with <code>python3 run.py</code> so the curriculum files can load.</p></div>');
    return;
  }
  const h = location.hash || '#/';
  try {
    let html;
    if (h === '#/' || h === '') html = viewRoadmap();
    else if (h === '#/practice') html = viewPractice();
    else if (h === '#/progress') html = viewProgress();
    else if (h.startsWith('#/module/')) {
      const mod = await ensureModule(decodeURIComponent(h.slice(9)));
      html = viewModule(mod);
    } else if (h.startsWith('#/lesson/')) {
      const id = decodeURIComponent(h.slice(9));
      const mid = moduleOfLesson(id);
      html = mid ? viewLesson(await ensureModule(mid), id) : notFound('Lesson not found.');
    } else if (h.startsWith('#/exercise/')) {
      const id = decodeURIComponent(h.slice(11));
      const mid = moduleOfExercise(id);
      html = mid ? viewExercise(await ensureModule(mid), id) : notFound('Exercise not found.');
    } else html = notFound('That page doesn\'t exist.');
    render(html);
  } catch (err) {
    render('<div class="card error-card"><h2>Couldn\'t load this page</h2>' +
      '<p class="note-small">' + escapeHtml((err && err.message) || String(err)) + '</p>' +
      '<p class="note-small">Run the app with <code>python3 run.py</code> so the curriculum files can load.</p></div>');
  }
}

/* ---------------- events ---------------- */

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const action = el.getAttribute('data-action');
  if (action === 'toggle-lesson') {
    const id = el.getAttribute('data-id');
    if (lessonDone(id)) delete state.progress.lessons[id];
    else state.progress.lessons[id] = true;
    saveProgress();
    route();
  } else if (action === 'toggle-exercise') {
    const id = el.getAttribute('data-id');
    if (exerciseDone(id)) delete state.progress.exercises[id];
    else state.progress.exercises[id] = true;
    saveProgress();
    route();
  } else if (action === 'copy') {
    const target = document.getElementById(el.getAttribute('data-target'));
    const done = () => {
      const orig = el.textContent;
      el.textContent = 'Copied!';
      setTimeout(() => { el.textContent = orig; }, 1200);
    };
    if (target && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(target.innerText).then(done, done);
    } else if (target) {
      const r = document.createRange();
      r.selectNodeContents(target);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      try { document.execCommand('copy'); } catch (e) {}
      sel.removeAllRanges();
      done();
    }
  } else if (action === 'show-solution') {
    const b = document.getElementById('solution-block');
    if (b) {
      b.classList.toggle('hidden');
      el.textContent = b.classList.contains('hidden') ? 'Show solution' : 'Hide solution';
    }
  } else if (action === 'show-hints') {
    const b = document.getElementById('hints-block');
    if (b) {
      b.classList.toggle('hidden');
      el.textContent = b.classList.contains('hidden')
        ? el.textContent.replace('Hide', 'Show')
        : el.textContent.replace('Show', 'Hide');
    }
  } else if (action === 'export-progress') {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'python-roadmap-progress-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  } else if (action === 'import-progress') {
    const inp = document.getElementById('import-file');
    if (inp) inp.click();
  } else if (action === 'toggle-module') {
    const mod = findModule(el.getAttribute('data-id'));
    if (mod) {
      const st = moduleStats(mod);
      const allDone = st.total > 0 && st.done === st.total;
      for (const l of mod.lessons) {
        if (allDone) delete state.progress.lessons[l.id];
        else state.progress.lessons[l.id] = true;
      }
      for (const e of mod.exercises) {
        if (allDone) delete state.progress.exercises[e.id];
        else state.progress.exercises[e.id] = true;
      }
      saveProgress();
      route();
    }
  } else if (action === 'reset') {
    if (window.confirm('Reset all progress? This clears every lesson and exercise on this machine.')) {
      resetProgress();
      route();
    }
  }
});

window.addEventListener('hashchange', route);

document.addEventListener('change', (ev) => {
  if (ev.target && ev.target.id === 'import-file') {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const p = JSON.parse(rd.result);
        if (!p || typeof p !== 'object' || typeof p.lessons !== 'object' || typeof p.exercises !== 'object') {
          throw new Error('bad shape');
        }
        state.progress = {
          lessons: p.lessons || {},
          exercises: p.exercises || {},
          updatedAt: p.updatedAt || null,
        };
        saveProgress();
        route();
      } catch (e) {
        const msg = document.getElementById('import-msg');
        if (msg) msg.textContent = 'That file doesn\'t look like a progress backup — nothing was changed.';
      }
    };
    rd.readAsText(f);
  }
});

/* ---------------- boot ---------------- */

loadProgress();
fetch(INDEX_URL)
  .then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' loading ' + INDEX_URL);
    return r.json();
  })
  .then((data) => {
    state.curriculum = data;
    route();
  })
  .catch((err) => {
    state.loadError = err && err.message ? err.message : String(err);
    route();
  });
