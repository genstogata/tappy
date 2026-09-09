# Tappy — Hallway Pass Tracker

Tappy is a lightweight, offline-first web app for tracking how long students are out of class (e.g., on a hallway/bathroom pass). Teachers display a grid of student tiles on a tablet, phone, or classroom screen; tapping a student's tile starts a timer, and tapping it again stops it. Tiles change color the longer a student is out, so it's easy to spot at a glance who's been gone too long.

Tappy works entirely in the browser — there's no server, account, or internet connection required after the first load, and it can be installed as a Progressive Web App (PWA) for a native, full-screen experience.

## Features

- **Tap-to-toggle timers** — tap a student's tile to mark them "out"; tap again when they return.
- **Color-coded alerts** — tiles turn yellow after 5 minutes out and red after 10 minutes out, so overdue students stand out.
- **Multiple classes** — create and switch between up to 5 class rosters (e.g., one per period).
- **Roster management** — add students one at a time, or import a whole class at once.
- **Flexible import** — paste a list of names or upload a `.csv`/`.txt` file, accepting either `First Last` or `Last, First` (comma-separated) formats, one student per line.
- **Daily report** — view total times out, number of times out, and current status per student; export the report as CSV or print it.
- **Reset day** — clear all timers/totals to start a fresh day without losing the roster.
- **Offline & private** — all data is stored locally in the browser (`localStorage`) and never leaves the device; nothing is synced between devices, so remember to export a report before switching devices or clearing browser data.
- **Installable PWA** — add it to your home screen/desktop for an app-like, offline-capable experience via the built-in service worker.

## Installation

Tappy is a static site with no build step or dependencies.

### Use it online

Open the live site in a browser: https://genstogata.github.io/tappy/

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

## Usage

1. **Create a class** — click **+ Create Class** and give it a name, or use the default class already provided.
2. **Add students** — click **Roster**, then either:
   - Type a first and last name and click **Add**, or
   - Paste a list of names (one per line, `First Last` or `Last, First`) into the import box and click **Import**, or
   - Upload a `.csv`/`.txt` file of names using the file picker.
3. **Track hallway passes** — from the main grid, tap a student's tile to start their timer when they leave the room; tap it again when they return to stop it.
4. **Watch for overdue students** — tiles turn yellow after 5 minutes and red after 10 minutes out.
5. **View the report** — click **Report** to see each student's number of times out, current status, and total time out for the day. Use **Export CSV** or **Print** to save a copy — this is important since data isn't synced between devices.
6. **Reset for a new day** — click **Reset Day** to clear all timers and totals while keeping the roster intact.
7. **Switch or manage classes** — use the class dropdown to switch rosters, or **Delete Class** to remove one entirely.

Sample roster files in various formats are available in [sample-data/](sample-data) for testing the import feature.

## Data & Privacy

All student data is stored locally in your browser's `localStorage` and is never transmitted anywhere. Clearing your browser data, switching browsers, or switching devices will lose the data, so export a CSV report if you need to keep records.

## Tech Stack

Vanilla HTML, CSS, and JavaScript — no frameworks or build tools. Offline support is provided by [service-worker.js](service-worker.js) and [manifest.json](manifest.json).

## Author

Developed by Alex Filiputti (with Claude)
