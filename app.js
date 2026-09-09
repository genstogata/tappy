(() => {
  "use strict";

  const STORAGE_KEY = "tappy.app.v2";
  const LEGACY_STORAGE_KEY = "tappy.students.v1"; // single-roster format from before multi-class support
  const MAX_CLASSES = 5;
  const WARN_MS = 5 * 60 * 1000;   // 5 minutes -> yellow
  const DANGER_MS = 10 * 60 * 1000; // 10 minutes -> red
  const GRID_GAP = 8;

  /** @typedef {{id:string, first:string, last:string, activeStart:number|null, totalMs:number, sessions:{start:number,end:number}[]}} Student */
  /** @typedef {{id:string, name:string, students:Student[]}} ClassRoster */

  /** @type {{activeClassId:string, classes:ClassRoster[]}} */
  let state = { activeClassId: "", classes: [] };

  function activeClass() {
    return state.classes.find(c => c.id === state.activeClassId) || state.classes[0];
  }

  function makeClass(name, students) {
    return { id: uid(), name, students: students || [] };
  }

  // ---------- Persistence ----------
  // Rebuilds trusted-shaped objects from parsed JSON so a corrupted/tampered localStorage
  // value (e.g. hand-edited via devtools) can't inject unexpected types/fields into app state.
  function normalizeStudent(s) {
    return {
      id: (s && typeof s.id === "string" && s.id) || uid(),
      first: (s && typeof s.first === "string") ? s.first : "",
      last: (s && typeof s.last === "string") ? s.last : "",
      activeStart: (s && typeof s.activeStart === "number") ? s.activeStart : null,
      totalMs: (s && typeof s.totalMs === "number" && s.totalMs >= 0) ? s.totalMs : 0,
      sessions: (s && Array.isArray(s.sessions))
        ? s.sessions.filter(sess => sess && typeof sess.start === "number" && typeof sess.end === "number")
        : []
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.classes)) return null;
    const classes = raw.classes
      .filter(c => c && typeof c === "object")
      .map(c => ({
        id: (typeof c.id === "string" && c.id) || uid(),
        name: (typeof c.name === "string" && c.name) || "Class",
        students: Array.isArray(c.students) ? c.students.filter(s => s && typeof s === "object").map(normalizeStudent) : []
      }));
    if (classes.length === 0) return null;
    const activeClassId = classes.some(c => c.id === raw.activeClassId) ? raw.activeClassId : classes[0].id;
    return { activeClassId, classes };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = normalizeState(JSON.parse(raw)) || { activeClassId: "", classes: [] };
      } else {
        // No default class on first run — only migrate legacy single-roster data, if any.
        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : [];
        const legacyStudents = Array.isArray(legacyParsed)
          ? legacyParsed.filter(s => s && typeof s === "object").map(normalizeStudent)
          : [];
        if (legacyStudents.length > 0) {
          const first = makeClass("Class 1", legacyStudents);
          state = { activeClassId: first.id, classes: [first] };
        } else {
          state = { activeClassId: "", classes: [] };
        }
      }
    } catch (e) {
      console.error("Failed to load app state", e);
      state = { activeClassId: "", classes: [] };
    }
    if (state.classes.length > 0 && !activeClass()) {
      state.activeClassId = state.classes[0].id;
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  // ---------- Helpers ----------
  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function elapsedFor(student) {
    return student.activeStart ? (Date.now() - student.activeStart) : 0;
  }

  function totalFor(student) {
    return student.totalMs + elapsedFor(student);
  }

  function sortedStudents() {
    const cls = activeClass();
    if (!cls) return [];
    return [...cls.students].sort((a, b) => {
      const ln = a.last.localeCompare(b.last);
      if (ln !== 0) return ln;
      return a.first.localeCompare(b.first);
    });
  }

  // ---------- Grid rendering & responsive fit ----------
  const grid = document.getElementById("grid");
  const emptyState = document.getElementById("empty-state");
  const tileEls = new Map(); // id -> element

  function renderGrid() {
    grid.querySelectorAll(".tile").forEach(el => el.remove());
    tileEls.clear();

    const list = sortedStudents();
    emptyState.style.display = list.length === 0 ? "flex" : "none";
    if (list.length === 0) updateEmptyState(!!activeClass());

    for (const student of list) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.id = student.id;
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.innerHTML = `
        <div class="name">
          <div class="name-line">${escapeHtml(student.first)}</div>
          <div class="name-line">${escapeHtml(student.last)}</div>
        </div>
        <div class="timer">00:00</div>
        <div class="sub"></div>
      `;
      tile.addEventListener("click", () => toggleStudent(student.id));
      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleStudent(student.id);
        }
      });
      grid.appendChild(tile);
      tileEls.set(student.id, tile);
    }

    layoutGrid(list);
    tick(); // immediately reflect current state
  }

  function layoutGrid(list) {
    const n = list.length;
    if (n === 0) return;
    const rect = grid.getBoundingClientRect();
    const w = rect.width - GRID_GAP;
    const h = rect.height - GRID_GAP;

    let best = { cols: 1, rows: n, tileW: w, tileH: h, size: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const tileW = (w - GRID_GAP * (cols - 1)) / cols;
      const tileH = (h - GRID_GAP * (rows - 1)) / rows;
      const size = Math.min(tileW, tileH);
      if (size > best.size) best = { cols, rows, tileW, tileH, size };
    }

    grid.style.gridTemplateColumns = `repeat(${best.cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${best.rows}, 1fr)`;

    const baseFontSize = Math.max(11, Math.min(48, best.size * 0.24));
    grid.style.setProperty("--name-size", `${baseFontSize}px`);

    // Shrink each tile's own name to fit its longest line, so long names stay whole instead of truncating.
    const innerWidth = (best.tileW - 16) * 0.92; // safety margin for font-metric estimation differences
    for (const student of list) {
      const tile = tileEls.get(student.id);
      if (!tile) continue;
      const longest = student.first.length >= student.last.length ? student.first : student.last;
      const neededWidth = measureTextWidth(longest, baseFontSize);
      const fitSize = neededWidth > innerWidth ? Math.max(9, baseFontSize * (innerWidth / neededWidth)) : baseFontSize;
      tile.style.setProperty("--tile-name-size", `${fitSize}px`);
    }
  }

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  function measureTextWidth(text, fontPx) {
    measureCtx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    return measureCtx.measureText(text).width;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // Shows getting-started steps when there's no class yet, or roster-specific instructions when a class is empty.
  function updateEmptyState(hasClass) {
    emptyState.innerHTML = hasClass ? `
      <div class="empty-state-content">
        <p>No students yet in this class.</p>
        <p>Click <strong>Roster</strong> to add students — type a name, paste a list, or upload a .csv/.txt file — then tap their tile here to start a timer when they head out.</p>
      </div>
    ` : `
      <div class="empty-state-content">
        <h2>Welcome to Tappy</h2>
        <ol>
          <li>Click <strong>+ Create Class</strong> to set up your first class.</li>
          <li>Click <strong>Roster</strong> to add students — type names one at a time, or paste/upload a list.</li>
          <li>Tap a student's tile to start their timer when they leave the room; tap again when they return.</li>
          <li>Click <strong>Report</strong> anytime for today's totals, and <strong>Reset Day</strong> to clear timers for tomorrow.</li>
        </ol>
      </div>
    `;
  }

  // ---------- Timer tick ----------
  function tick() {
    const cls = activeClass();
    if (!cls) return;
    for (const student of cls.students) {
      const tile = tileEls.get(student.id);
      if (!tile) continue;

      tile.classList.remove("tile-active", "tile-warn", "tile-danger");

      const timerEl = tile.querySelector(".timer");
      const subEl = tile.querySelector(".sub");

      if (student.activeStart) {
        const elapsed = elapsedFor(student);
        timerEl.textContent = formatDuration(elapsed);
        tile.classList.add("tile-active");
        if (elapsed >= DANGER_MS) tile.classList.add("tile-danger");
        else if (elapsed >= WARN_MS) tile.classList.add("tile-warn");
        subEl.classList.remove("visible");
      } else {
        subEl.classList.toggle("visible", student.totalMs > 0);
        if (student.totalMs > 0) {
          subEl.textContent = `Today: ${formatDuration(student.totalMs)}`;
        }
      }
    }
  }

  setInterval(tick, 1000);

  // ---------- Actions ----------
  function toggleStudent(id) {
    const cls = activeClass();
    if (!cls) return;
    const student = cls.students.find(s => s.id === id);
    if (!student) return;

    if (student.activeStart) {
      const start = student.activeStart;
      const end = Date.now();
      student.totalMs += (end - start);
      student.sessions.push({ start, end });
      student.activeStart = null;
    } else {
      student.activeStart = Date.now();
    }
    save();
    tick();
  }

  function addStudent(first, last) {
    const cls = activeClass();
    if (!cls) return;
    first = first.trim();
    last = last.trim();
    if (!first && !last) return;
    cls.students.push({ id: uid(), first, last, activeStart: null, totalMs: 0, sessions: [] });
    save();
    renderGrid();
    renderRosterList();
  }

  function removeStudent(id) {
    const cls = activeClass();
    if (!cls) return;
    cls.students = cls.students.filter(s => s.id !== id);
    save();
    renderGrid();
    renderRosterList();
  }

  function parseImportLine(line) {
    line = line.trim();
    if (!line) return null;
    if (line.includes(",")) {
      const [last, first] = line.split(",").map(s => s.trim());
      return { first: first || "", last: last || "" };
    }
    const parts = line.split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: "" };
    const last = parts.pop();
    return { first: parts.join(" "), last };
  }

  function importList(text) {
    const cls = activeClass();
    if (!cls) return 0;
    const lines = text.split(/\r?\n/);
    let added = 0;
    for (const line of lines) {
      const parsed = parseImportLine(line);
      if (parsed && (parsed.first || parsed.last)) {
        cls.students.push({ id: uid(), first: parsed.first, last: parsed.last, activeStart: null, totalMs: 0, sessions: [] });
        added++;
      }
    }
    if (added) {
      save();
      renderGrid();
      renderRosterList();
    }
    return added;
  }

  function resetDay() {
    const cls = activeClass();
    if (!cls) return;
    for (const student of cls.students) {
      student.activeStart = null;
      student.totalMs = 0;
      student.sessions = [];
    }
    save();
    renderGrid();
  }

  function clearRoster() {
    const cls = activeClass();
    if (!cls) return;
    cls.students = [];
    save();
    renderGrid();
    renderRosterList();
  }

  // ---------- Class management ----------
  function createClass(name) {
    if (state.classes.length >= MAX_CLASSES) return null;
    const cls = makeClass(name, []);
    state.classes.push(cls);
    state.activeClassId = cls.id;
    save();
    renderClassUI();
    renderGrid();
    renderRosterList();
    return cls;
  }

  function switchClass(id) {
    if (!state.classes.some(c => c.id === id) || id === state.activeClassId) return;
    state.activeClassId = id;
    save();
    renderClassUI();
    renderGrid();
    renderRosterList();
  }

  function deleteActiveClass() {
    if (state.classes.length === 0) return;
    const idx = state.classes.findIndex(c => c.id === state.activeClassId);
    state.classes.splice(idx, 1);
    const next = state.classes[Math.max(0, idx - 1)];
    state.activeClassId = next ? next.id : "";
    save();
    renderClassUI();
    renderGrid();
    renderRosterList();
  }

  // ---------- Roster modal ----------
  const modalRoster = document.getElementById("modal-roster");
  const rosterList = document.getElementById("roster-list");
  const rosterCount = document.getElementById("roster-count");

  function renderRosterList() {
    rosterList.innerHTML = "";
    const cls = activeClass();
    rosterCount.textContent = cls ? cls.students.length : 0;
    for (const student of sortedStudents()) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(student.first)} ${escapeHtml(student.last)}</span>`;
      const btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.type = "button";
      btn.textContent = "Remove";
      btn.addEventListener("click", () => removeStudent(student.id));
      li.appendChild(btn);
      rosterList.appendChild(li);
    }
  }

  document.getElementById("btn-roster").addEventListener("click", () => {
    renderRosterList();
    modalRoster.showModal();
  });

  const modalCreateClass = document.getElementById("modal-create-class");
  const inputNewClassName = document.getElementById("input-new-class-name");

  document.getElementById("btn-create-class").addEventListener("click", () => {
    if (state.classes.length >= MAX_CLASSES) return;
    inputNewClassName.value = `Class ${state.classes.length + 1}`;
    modalCreateClass.showModal();
    inputNewClassName.focus();
    inputNewClassName.select();
  });

  inputNewClassName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("btn-create-class-confirm").click();
    }
  });

  modalCreateClass.addEventListener("close", () => {
    if (modalCreateClass.returnValue !== "create") return;
    const trimmed = inputNewClassName.value.trim();
    if (trimmed) createClass(trimmed);
  });

  document.getElementById("btn-delete-class").addEventListener("click", () => {
    const cls = activeClass();
    if (!cls) return;
    if (confirm(`Delete "${cls.name}" and all its tracked data? This cannot be undone.`)) {
      deleteActiveClass();
    }
  });

  // ---------- Class dropdown ----------
  const classSelect = document.getElementById("class-select");

  function renderClassUI() {
    classSelect.innerHTML = "";
    const sorted = [...state.classes].sort((a, b) => a.name.localeCompare(b.name));
    for (const cls of sorted) {
      const opt = document.createElement("option");
      opt.value = cls.id;
      opt.textContent = cls.name;
      if (cls.id === state.activeClassId) opt.selected = true;
      classSelect.appendChild(opt);
    }
    const hasClasses = state.classes.length > 0;
    document.getElementById("btn-create-class").disabled = state.classes.length >= MAX_CLASSES;
    document.getElementById("btn-delete-class").disabled = !hasClasses;
    document.getElementById("btn-roster").disabled = !hasClasses;
    document.getElementById("btn-report").disabled = !hasClasses;
    document.getElementById("btn-reset").disabled = !hasClasses;
  }

  classSelect.addEventListener("change", () => switchClass(classSelect.value));

  document.getElementById("btn-add-student").addEventListener("click", () => {
    const firstEl = document.getElementById("input-first");
    const lastEl = document.getElementById("input-last");
    addStudent(firstEl.value, lastEl.value);
    firstEl.value = "";
    lastEl.value = "";
    firstEl.focus();
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    const textEl = document.getElementById("input-import");
    const added = importList(textEl.value);
    if (added) textEl.value = "";
  });

  document.getElementById("input-import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importList(String(reader.result));
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("btn-clear-roster").addEventListener("click", () => {
    if (confirm("Remove all students from the roster? This also erases their tracked time.")) {
      clearRoster();
    }
  });

  // ---------- Reset day ----------
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (confirm("Reset all timers and cumulative totals for a new day? Names are kept.")) {
      resetDay();
    }
  });

  // ---------- Report modal ----------
  const modalReport = document.getElementById("modal-report");
  const reportBody = document.getElementById("report-body");
  const reportMeta = document.getElementById("report-meta");

  function reportDateStr() {
    return new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function renderReport() {
    const cls = activeClass();
    if (!cls) return;
    reportBody.innerHTML = "";
    reportMeta.textContent = `${cls.name} — ${reportDateStr()}`;
    const list = [...cls.students].sort((a, b) => totalFor(b) - totalFor(a));
    for (const student of list) {
      const tr = document.createElement("tr");
      const elapsed = elapsedFor(student);
      if (student.activeStart) {
        if (elapsed >= DANGER_MS) tr.classList.add("row-danger");
        else if (elapsed >= WARN_MS) tr.classList.add("row-warn");
      }
      tr.innerHTML = `
        <td>${escapeHtml(student.first)} ${escapeHtml(student.last)}</td>
        <td>${student.sessions.length}</td>
        <td>${student.activeStart ? formatDuration(elapsed) : "—"}</td>
        <td>${formatDuration(totalFor(student))}</td>
      `;
      reportBody.appendChild(tr);
    }
  }

  document.getElementById("btn-report").addEventListener("click", () => {
    renderReport();
    modalReport.showModal();
  });

  document.getElementById("btn-print").addEventListener("click", () => {
    window.print();
  });

  // Prevent CSV formula injection: spreadsheet apps auto-execute cells starting with =, +, -, @, tab, or CR.
  function sanitizeCsvField(value) {
    const str = String(value);
    return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  }

  document.getElementById("btn-export-csv").addEventListener("click", () => {
    const cls = activeClass();
    if (!cls) return;
    const rows = [
      ["Class", cls.name],
      ["Date", reportDateStr()],
      [],
      ["Name", "Times Out", "Currently Out (sec)", "Total Time Out (sec)", "Total Time Out"]
    ];
    const list = [...cls.students].sort((a, b) => totalFor(b) - totalFor(a));
    for (const student of list) {
      const total = totalFor(student);
      rows.push([
        `${student.first} ${student.last}`,
        student.sessions.length,
        student.activeStart ? Math.floor(elapsedFor(student) / 1000) : 0,
        Math.floor(total / 1000),
        formatDuration(total)
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${sanitizeCsvField(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tappy-report-${cls.name.replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---------- Resize handling ----------
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => layoutGrid(sortedStudents()), 100);
  });

  // ---------- Init ----------
  load();
  renderClassUI();
  renderGrid();
  renderRosterList();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
