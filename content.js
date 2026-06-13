// WorldSBK Gap Columns
// Adds "Gap to 1st" and "Gap to prev" after the Time cell on every results table.
// On RACE sessions it also adds a "Pts" column with championship points.

const TABLE_SEL = "table.results-table__table";
const TIME_HEAD = ".results-table__header-cell--time";
const TIME_CELL = ".results-table__body-cell--time";
const POS_CELL = ".results-table__body-cell--pos";
const TAG = "wsbk-col"; // marks cells we inject, so re-runs are idempotent

// Championship points by finishing position.
// Full races (Race 1 / Race 2): top 15 score.
const POINTS_FULL = {
  1: 25, 2: 20, 3: 16, 4: 13, 5: 11, 6: 10, 7: 9, 8: 8,
  9: 7, 10: 6, 11: 5, 12: 4, 13: 3, 14: 2, 15: 1,
};
// Superpole Race (10-lap sprint): top 9 score, reduced scale.
const POINTS_SPRINT = {
  1: 12, 2: 10, 3: 9, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2,
};

// The session is identified by the LAST path segment of the URL (the site's
// <select> does not reflect the active session, so we can't read it from there).
//   .../sbk/001 -> Race 1   .../sbk/002 -> Superpole Race   .../sbk/003 -> Race 2
//   .../sbk/l1a -> FP1, /q1a -> Superpole (qualifying), /w1a -> Warm Up, etc.
const RACE_CODES = {
  "001": POINTS_FULL,    // Race 1
  "003": POINTS_FULL,    // Race 2
  "002": POINTS_SPRINT,  // Superpole Race
};

function sessionCode() {
  const seg = location.pathname.split("/").filter(Boolean).pop() || "";
  return seg.toUpperCase();
}

// Returns the points table for the current session, or null if it isn't a race.
function pointsTableFor() {
  const code = sessionCode();
  if (RACE_CODES[code]) return RACE_CODES[code];
  // Fallback: if the option label for this code mentions "Race", honour it
  // (guards against the site changing codes). "Superpole" alone = qualifying.
  const opt = document.querySelector(
    'select[name="results-filter-session"] option[value="' + code + '"]'
  );
  const label = opt ? opt.textContent.trim() : "";
  if (/race/i.test(label)) return /superpole/i.test(label) ? POINTS_SPRINT : POINTS_FULL;
  return null;
}

// Parse a lap/total/gap string. Returns { v: seconds, rel: isGapToLeader } or null.
//   "1'32.733"  -> { v: 92.733,  rel: false }   (lap or total race time)
//   "32'46.379" -> { v: 1966.379, rel: false }
//   "+0.059"    -> { v: 0.059,   rel: true  }   (some pages show gaps directly)
//   "+1 Lap" / "DNF" / "" -> null
function parseLap(raw) {
  let s = (raw || "").trim();
  let rel = false;
  if (s[0] === "+") { rel = true; s = s.slice(1).trim(); }
  const m = s.match(/^(?:(\d+)')?(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return null;
  const mins = m[1] ? parseInt(m[1], 10) : 0;
  return { v: mins * 60 + parseFloat(m[2]), rel };
}

function fmtGap(delta) {
  if (delta == null) return "–";
  if (delta <= 0.0005) return "+0.000";
  return "+" + delta.toFixed(3);
}

function th(label, extra) {
  const el = document.createElement("th");
  el.className = "results-table__header-cell " + TAG + (extra ? " " + extra : "");
  el.textContent = label;
  return el;
}

function td(text, extra) {
  const el = document.createElement("td");
  el.className = "results-table__body-cell " + TAG + (extra ? " " + extra : "");
  el.textContent = text;
  return el;
}

function enhance(table) {
  // Clear anything we added before, so this is safe to call repeatedly
  // (lazy loads, live-timing updates, session switches, SPA navigation).
  table.querySelectorAll("." + TAG).forEach((n) => n.remove());

  const headRow = table.querySelector("thead tr");
  const timeHead = headRow && headRow.querySelector(TIME_HEAD);
  if (!timeHead) return;

  const points = pointsTableFor(); // null on practice/qualifying/warm-up
  const isRace = points != null;

  // Headers: Gap 1st, Gap Prev, and (race only) Pts
  const headCells = [th("Gap 1st"), th("Gap Prev")];
  if (isRace) headCells.push(th("Pts", "wsbk-points"));
  timeHead.after(...headCells);

  let firstAbs = null; // leader's time (slowest-looking total in a race, fastest in practice)
  let prevAbs = null;

  table.querySelectorAll("tbody tr").forEach((row) => {
    const timeCell = row.querySelector(TIME_CELL);
    if (!timeCell) return;

    const p = parseLap(timeCell.textContent);
    let abs = null;
    let valid = false;
    if (p) {
      abs = p.rel && firstAbs != null ? firstAbs + p.v : p.v;
      if (firstAbs == null) firstAbs = abs; // first row = leader, defines the baseline
      // A genuine finisher is never ahead of the leader's total time. Retired
      // riders show a smaller partial time, so treat those as unclassified.
      valid = abs >= firstAbs - 0.0005;
    }

    const gapFirst = valid ? fmtGap(abs - firstAbs) : "–";
    const gapPrev = valid ? (prevAbs == null ? "–" : fmtGap(abs - prevAbs)) : "–";
    if (valid) prevAbs = abs;

    const cells = [td(gapFirst), td(gapPrev)];

    if (isRace) {
      const posCell = row.querySelector(POS_CELL);
      const pos = posCell ? parseInt(posCell.textContent.trim(), 10) : NaN;
      // Classified position -> points (0 if outside the scoring range).
      // No numeric position -> "–".
      const pts = Number.isInteger(pos) ? (points[pos] || 0) : "–";
      cells.push(td(String(pts), "wsbk-points"));
    }

    timeCell.after(...cells);
  });
}

let timer = null;
let observer = null;

function run() {
  if (observer) observer.disconnect(); // avoid reacting to our own edits
  document.querySelectorAll(TABLE_SEL).forEach(enhance);
  if (observer) observer.observe(document.body, { childList: true, subtree: true });
}

observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(run, 200); // debounce lazy-load / live-timing / nav churn
});

run();
