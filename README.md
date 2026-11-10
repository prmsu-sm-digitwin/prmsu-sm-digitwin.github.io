# PRMSU San Marcelino Digital Twin

Photogrammetry-Based Digital Twin: Enhancing Offline Navigation via A* Pathfinding for President Ramon Magsaysay State University San Marcelino Campus.

A project made by PixiCraft Studios, a team of three BS Computer Science students of PRMSU San Marcelino Campus.

## About
A client-side Progressive Web App (PWA) built with HTML, CSS, JavaScript and Three.js. There is no backend. After the first load with internet, the app keeps working offline through a service worker, and it can be installed on a phone like a regular app.

Photogrammetry was done with Agisoft Metashape, but image alignment was too poor to finish a reconstructed model. The digital twin is therefore image-based: 360-degree photos of the campus plus Blender block models of the buildings.

## Pages

### Navigation Map
- 3D campus with 77 buildings and places, each with its own model, plus roads, ground and the running oval.
- A* pathfinding over 101 waypoints and 140 two-way paths. Pick a building and press Navigate to get an orange route with direction arrows.
- Search by building name, acronym or full college name (for example CCIT or College of Communication and Information Technology).
- GPS blue dot that can be shown as a character (Princess, Jonathan or Shane).
- First-person mode with an on-screen joystick.
- Drag to pan, pinch or scroll to zoom, right-click drag, Shift + drag or two fingers to rotate.
- Legend viewer.

### Campus Walkthrough
- 360-degree photo tour of Zones 1 to 5 with 1,133 stops shot with a DJI Osmo 360.
- Forward, back and junction arrows, and a Places list (31 places) to jump to a spot.
- Optional download of all photos for offline use (about 450 MB).

### Campus Directory
- Cards for Academic, Facility and Multi-Court buildings, each with a photo and a short description.

### Development Zones
- Satellite map with 16 pins. Tap a pin to open a point-of-view photo of that area.

### About
- Vision, Mission, Quality Policy, a description of the PWA and links to the university and department pages.

## Offline use
Open the app once with internet. The map, models, Directory photos and icons are saved automatically in the background. The 360 walkthrough photos are large, so they are an optional download inside the Campus Walkthrough page.

## Running it locally
The service worker needs a web server, so opening `index.html` directly will not work. Start any local server in this folder, for example:

```
python -m http.server 8000
```

Then open `http://localhost:8000`.

## For developers
- `data/campus.json` holds buildings, places, waypoints and paths. `data/tour360.json` and `data/devzones.json` hold the walkthrough and Development Zones data.
- `campus-editor.html` and `devzones-editor.html` are the editors for the map and the Development Zones pins. They are not part of the installed app.
- After changing any file, increase `CACHE_NAME` in `service-worker.js`. Then reload the app twice so the new version replaces the cached one.
- Models are `.glb` files in `models/`. New models must also be listed in `MODEL_ASSETS` in `service-worker.js` so they work offline.

## Team
PixiCraft Studios, BS Computer Science, PRMSU San Marcelino Campus
- Princess: Fullstack Developer and lead researcher
- Jonathan: Artist (Blender and Metashape)
- Shane: Artist (Blender and Metashape)
