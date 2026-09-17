# Tappy — Hallway Pass Tracker

Tappy is a lightweight, offline-first web app for tracking how long students are out of class (e.g., on a hallway/bathroom pass). Teachers display a grid of student tiles on a tablet, phone, or classroom screen; tapping a student's tile starts a timer, and tapping it again stops it. Tiles change color the longer a student is out, so it's easy to spot at a glance who's been gone too long.

Tappy works entirely in the browser — there's no server, account, or internet connection required after the first load, and it can be installed as a Progressive Web App (PWA) for a native, full-screen experience.

## Features

- **Tap-to-toggle timers** — tap a student's tile to mark them "out"; tap again when they return.
- **Color-coded alerts** — tiles turn yellow after 5 minutes out and red after 10 minutes out, so overdue students stand out.
- **Multiple classes** — create and switch between up to 5 class rosters (e.g., one per period).
- **Roster management** — add students one at a time, or import a whole class at once.
- **Flexible import** — paste a list of names, accepting either `First Last` or `Last, First` (comma-separated) formats, one student per line.
- **PIN Lock** - once your class is set up, lock out controls with a PIN (convenience feature, not secure!)
- **Daily report** — view total times out, number of times out, and current status per student; expand a student's row to see the exact local time of each tap-out/tap-in; export the report as CSV or print it.
- **Running history** — every completed session is archived automatically to an on-device log that survives **Reset Day** and closing the app, so you can build up a term-long record instead of losing yesterday's data. Export the whole history as a single cumulative CSV at any time.
- **Reset day** — archive today's sessions to the running history, then clear all timers/totals to start a fresh day without losing the roster or any past data.
- **Offline & private** — all data is stored locally in the browser (`localStorage`) and never leaves the device; nothing is synced between devices, so remember to export a report before switching devices or clearing browser data.
- **Installable PWA** — add it to your home screen/desktop for an app-like, offline-capable experience via the built-in service worker.

## Installation

Tappy is a static site with no build step or dependencies.

### Use it online

Open the live site in a browser: https://genstogata.github.io/tappy/

Note: This site may not be always available in the future. Please consider hosting your own Tappy instance using Docker. 

### Run it locally

1. Clone the repository:
   ```bash
   git clone https://github.com/genstogata/tappy.git
   cd tappy
   ```
2. Serve the folder with any static file server (opening `index.html` directly also works, though a local server ensures the service worker registers correctly). For example:
   ```bash
   npx serve .
   ```
3. Open the served URL (e.g., `http://localhost:3000`) in your browser.

### Install as an app (PWA)

Once loaded in a supported browser (Chrome, Edge, Safari on iOS/macOS, etc.), use the browser's "Install App" / "Add to Home Screen" option to install Tappy for offline, full-screen use.

### Self-host with Docker

Tappy is also published as a Docker image, for running on your own server (e.g. behind a Cloudflare Tunnel):

```bash
docker run -d --name tappy --restart unless-stopped \
  --read-only --tmpfs /var/cache/nginx --tmpfs /tmp \
  --security-opt no-new-privileges:true --cap-drop ALL \
  -p 127.0.0.1:8080:8080 af416/tappy:v31
```

The container serves files and **stores no data** — no database, no volume, no server-side state. Rosters, timers and history all live in the browser on the teacher's device. It runs with a read-only filesystem and all capabilities dropped, so it *cannot* write to the host.

See [docker/README.md](docker/README.md) for the Cloudflare Tunnel setup, security headers, and how to verify the no-data claim yourself.

## Usage

1. **Create a class** — on first launch, click **+ Create Class** and give it a name (up to 5 classes).
2. **Add students** — click **Roster**, then either:
   - Type a first and last name and click **Add**, or
   - Paste a list of names (one per line, `First Last` or `Last, First`) into the import box and click **Import**.
3. **Track hallway passes** — from the main grid, tap a student's tile to start their timer when they leave the room; tap it again when they return to stop it.
4. **Watch for overdue students** — tiles turn yellow after 5 minutes and red after 10 minutes out.
5. **View the report** — click **Report** to see each student's number of times out, current status, and total time out for the day. Click **Details** on a row to see the local clock time of each tap-out/tap-in. The report header shows the device's current local time so you can confirm the clock is correct. The footer of the report shows how many sessions are currently held in the running history.
   - **Export History (CSV)** saves *every* session ever recorded, across all classes and days, as one cumulative file. Each export is a complete replacement for the previous one, so you can just overwrite yesterday's file — or keep each dated export and the newest one is always the most complete.
   - **Export Today (CSV)** saves just today's totals for the current class (the same summary as the table on screen).
   - **Print** prints the on-screen daily report, including the full timestamp log for every student.
6. **Reset for a new day** — click **Reset Day**. Today's sessions are first archived to the running history, then all timers and totals are cleared while the roster stays intact.
7. **Switch or manage classes** — use the class dropdown to switch rosters, or **Delete Class** to remove one entirely. Sessions from a class you delete or switch away from are kept in the running history.

### Building up a long-term record

Tappy can't append to a file on disk (browsers don't allow that), so instead it keeps an **append-only running history** inside the app itself, and every export is a dump of the whole thing:

- A session is archived as soon as it's complete — when you reset the day, export, switch or delete a class, close/hide the tab, or every 5 minutes as a safety net. So history survives crashes and force-quits, not just clean shutdowns.
- Archived rows are **never duplicated or edited**. Re-exporting ten times a day produces the same rows each time, so it's safe to export as often as you like.
- To keep a permanent record, export the history CSV somewhere outside the browser (shared drive, cloud folder) at least weekly. Browser storage is small (~5 MB) and the app trims the oldest rows if it fills up, warning you when that happens.
- **Clear history** (bottom of the Report window) permanently deletes the archived log from the device. Export first if you need it.

A session that's still running when you reset the day isn't history yet — tap the student back in (or export later) and it gets archived like any other session.

Sample roster files in various formats are available in [sample-data/](sample-data) — open one, copy its contents, and paste them into the import box to test the import feature.

## Data & Privacy

All student data is stored locally in your browser's `localStorage` and is never transmitted anywhere. Clearing your browser data, switching browsers, or switching devices will lose the data — including the running history — so export a CSV regularly if you need to keep records.

The running history is capped at 10,000 sessions (roughly 1.2 MB) to stay within typical browser storage limits; the oldest rows are trimmed first, and Tappy warns you if storage is full. Export periodically to keep everything.

## Tech Stack

Vanilla HTML, CSS, and JavaScript — no frameworks or build tools. Offline support is provided by [service-worker.js](service-worker.js) and [manifest.json](manifest.json).

## Author

Developed by Alex Filiputti (with Claude)
