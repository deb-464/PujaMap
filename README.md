# PujaMap — Find. Explore. Celebrate.

A mobile-first static web app that shows nearby Durga Puja pandals on a map.
HTML5 · CSS3 · Bootstrap 5 · Vanilla JS · Leaflet · OpenStreetMap. No backend, no database, no build step, no API keys.

> **All rows in `data/pujas.csv` are DEMO / SAMPLE data.** Names, addresses and coordinates are placeholders
> (every record has `"demo": true`, shows a "নমুনা তথ্য" badge, and none is marked verified). Replace them with real data.

## Project structure

```
PujaMap/
├── index.html            main map page
├── about.html            about + "Add Puja Information"
├── favorites.html        saved Puja (localStorage)
├── manifest.json         PWA manifest
├── service-worker.js     offline shell + Puja data cache
├── data/pujas.csv        ALL Puja data lives here (edit in Excel/Google Sheets)
└── assets/
    ├── css/style.css
    ├── js/
    │   ├── ui.js          escaping, toast, image fallback, contribute button
    │   ├── puja.js        config, data loading, Haversine, HTML templates
    │   ├── favorites.js   localStorage favorites
    │   ├── search.js      instant search
    │   ├── location.js    Geolocation API wrapper
    │   ├── map.js         Leaflet map, markers, camera
    │   ├── app.js         state + rendering + events (map page)
    │   └── favorites-page.js
    └── images/            placeholder.jpg, logo/icons, puja/ (your photos)
```

## Run locally

The app loads `data/pujas.csv` with `fetch`, so open it through a local server (not by double-clicking the file):

```bash
cd PujaMap
python3 -m http.server 8000      # then open http://localhost:8000
```

Browser location works on `https://` sites and on `localhost`.

## CSV format (data/pujas.csv)

Edit it in Excel or Google Sheets. Keep the header row exactly as is. **Save/export as "CSV UTF-8"** so Bangla text stays correct.

| Column | Required | Example / notes |
|---|---|---|
| `id` | yes | `11` — unique number, never reuse (favorites and share links use it) |
| `name` | yes* | English name |
| `name_bn` | no | বাংলা নাম (*at least one of name / name_bn is needed) |
| `location` | no | `Shilkup, Banshkhali` — short area shown on cards |
| `address` | no | full address |
| `latitude` | yes | `22.3569` (decimal, not 0) |
| `longitude` | yes | `91.7832` |
| `description` | no | short text |
| `image` | no | `assets/images/puja/puja-11.jpg` (empty = placeholder) |
| `category` | no | `Sarbojonin`, `Baroari`, `Temple`, `Family` |
| `phone` | no | `01XXXXXXXXX` |
| `facebook` | no | full `https://...` link |
| `opening_time` | no | `18:00` (24-hour) |
| `closing_time` | no | `23:00` |
| `events` | no | `title~date~time` and separate several with `|` — e.g. `সাংস্কৃতিক অনুষ্ঠান~2026-10-20~19:30|আরতি~2026-10-21~18:30` |
| `facilities` | no | separate with `|` — e.g. `Parking|Food Zone|Toilet|Drinking Water|Security|Cultural Program|Wheelchair Access|Emergency Help` |
| `verified` | no | `true` only after you confirmed the info, otherwise `false`/empty |
| `demo` | no | `true` marks a sample row; leave empty for real data |

Tips: wrap a cell in double quotes if it contains a comma (Excel does this automatically). Empty cells are fine — missing info is simply not shown. Rows with invalid coordinates are skipped (see browser console).

## Add / replace Puja data

1. Open `data/pujas.csv`, delete the demo rows, add your real rows (one Puja per row).
2. Put photos in `assets/images/puja/` and write the path in `image`.
3. Set the contribution form: in `assets/js/puja.js` change `FORM_URL: 'YOUR_GOOGLE_FORM_URL'`.
4. After deploying, bump `VERSION` in `service-worker.js` so returning visitors get the new data.

No JavaScript changes are needed. (`DATA_URL` in `assets/js/puja.js` also accepts a `.json` file if you ever prefer that.)

## Deploy

- **GitHub Pages:** push the folder to a repo → Settings → Pages → deploy from branch (root).
- **Netlify:** drag-and-drop the folder at app.netlify.com/drop, or connect the repo (no build command, publish directory `.`).
- **Vercel:** import the repo as a static site (no framework, no build command).

## Privacy

Location is read once per tap, kept in memory only, never stored or sent anywhere. Favorites are stored only in your browser. No accounts, no tracking.

## Known limitations

- Distances are straight-line (Haversine), not walking/driving distance. "Get Directions" opens Google Maps for the real route.
- Needs internet for map tiles; only the app shell and Puja data work offline.
- Search is simple substring matching (no fuzzy/Bangla spelling variants).
- The public OpenStreetMap tile server is for light use; use a tile provider if traffic grows.
- Tested with code-level and simulated-DOM checks only; see the checklist below for what to verify in a real browser.

## Browser test checklist (please run once on a real phone)

OSM tiles load · location prompt and denied/timeout messages · pulsing blue user marker · marker → bottom sheet (mobile) / popup (desktop) · Web Share · Add to Home Screen · no horizontal scroll at 360–1440 px.

## Future ideas

Admin panel and database, user-submitted Puja with moderation, live crowd status, event management, reviews, photo uploads, committee accounts, notifications, walking-route distances.
