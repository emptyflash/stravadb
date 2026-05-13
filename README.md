# stravadb

Let's get banned from Strava!

> Store arbitrary data inside Strava activities. Like a database, but every record is a "run."

stravadb encodes your bytes as GPS coordinates, packs them into a GPX file, and uploads them as a private Strava activity. Later, it fetches the route back, decodes the coordinates, and gives you your data. Free cloud storage, as long as Strava doesn't mind.

![Screenshot of a strava activity](https://github.com/emptyflash/stravadb/blob/main/image.png?raw=true)

---

## How it works

```
┌──────────┐     ┌──────────────┐     ┌───────────┐     ┌──────────────┐
│  bytes   │────▶│ GPS offsets  │────▶│ GPX file  │────▶│ Strava       │
│          │     │ (tiny area)  │     │           │     │ activity     │
└──────────┘     └──────────────┘     └───────────┘     └──────────────┘
                                                               │
                                                               │ retrieve
                                                               ▼
┌──────────┐     ┌──────────────┐     ┌───────────┐     ┌──────────────┐
│  bytes   │◀────│ GPS offsets  │◀────│ latlng    │◀────│ Strava       │
│          │     │ (reverse)    │     │ stream    │     │ activity     │
└──────────┘     └──────────────┘     └───────────┘     └──────────────┘
```

Each byte pair becomes a tiny offset from a fixed baseline near **40.0°N, 120.0°W** (somewhere in northern California). The resulting "run" wobbles around inside a ~300m box — boring enough that Strava's route processor leaves it alone.

Each activity stores up to ~2 KB of payload. Larger files are automatically chunked across multiple activities named `stravadb:key:000`, `stravadb:key:001`, etc.

---

## Setup

### 1. Get Strava API credentials

Go to **[strava.com/settings/api](https://www.strava.com/settings/api)** and create an application:

| Field | Value |
|---|---|
| Application Name | `stravadb` (or whatever) |
| Category | Other |
| Website | `http://localhost` |
| Authorization Callback Domain | `localhost` |

Copy your **Client ID** and **Client Secret**.

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc123def456...
STRAVA_REDIRECT_URI=http://localhost:3000/callback
```

### 3. Install

**Local development:**

```bash
npm install
npm run build
npm link                # makes `stravadb` available globally
```

### 4. Authenticate

```bash
stravadb auth
```

This opens your browser. Log in to Strava, authorize the app, and your tokens are saved to `~/.stravadb/tokens.json`.

## Usage

```bash
# Store a file
stravadb put mykey ./important-data.txt

# Retrieve it
stravadb get mykey

# Save to a file
stravadb get mykey -o ./recovered.txt

# List everything stored
stravadb list

# Show metadata
stravadb info mykey

# Find activities to delete manually
stravadb delete mykey
```

```
$ stravadb put secrets ./api-keys.json
Chunk 1/1 uploaded as activity 18485835492 (stravadb:secrets)

$ stravadb list
secrets     2048 bytes    1 chunks    api-keys.json

$ stravadb get secrets
{"openai": "sk-...", "github": "ghp_..."}
```

---

## Rate limits

Strava allows **100 requests per 15 minutes** per user. A put or get operation typically uses 2-3 requests (list, upload/stream, detail). Keep your usage reasonable or you'll get rate-limited. Chunking large files across many activities will burn through your quota fast.

---

## Why this works (and almost didn't)

Building stravadb involved several rounds of discovering how Strava _actually_ processes uploaded data:

### Problem 1: There's no "create route" API
Strava's public API can _read_ routes and _export_ routes, but can't _create_ them. The workaround: upload a GPX file via the Upload API, which creates an activity with GPS track data.

### Problem 2: Trainer activities don't have GPS
Setting `trainer=1` on uploads marks the activity as indoor. Strava discards all GPS data from indoor activities. Lesson: GPS encoding requires outdoor activities.

### Problem 3: Strava rewrites your coordinates
Uploading GPS points scattered across the entire globe triggers Strava's route processor, which "snaps" points to roads, filters outliers, and generally ruins your encoded data. Encoding data as **small offsets from a fixed baseline** produces a track that looks like a real person jogging around a parking lot, so Strava preserves every point exactly.

### Problem 4: The activity polyline is simplified
`GET /activities/{id}` returns a simplified `map.polyline` — it drops points and smooths the track. The `latlng` stream endpoint (`/activities/{id}/streams?keys=latlng`) returns the raw, unmodified coordinates. stravadb uses the stream endpoint for retrieval.

### Problem 5: You can't delete with the default scopes
Strava requires additional permissions to delete activities via the API. The `delete` command lists the activities you need to remove manually from [strava.com](https://www.strava.com/athlete/training). The `put` command handles updates by uploading new activities and deduplicating on retrieval.

---

## Encoding density

| Metric | Value |
|---|---|
| Bytes per GPS point | 2 (1 byte per lat/lng offset) |
| Points per activity | ~1000 |
| Payload per activity | ~2 KB |
| Chunking threshold | 2 KB per chunk |
| Overhead per activity | 8-byte header |

At 2 bytes per point and ~1,000 points per activity, each "run" stores about 2 KB of your data. A 100 KB file becomes ~50 activities.

---

## Project structure

```
stravadb/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── types.ts              # Types and error class
│   ├── commands/
│   │   ├── auth.ts           # OAuth2 flow
│   │   ├── put.ts            # Encode → upload
│   │   ├── get.ts            # Download → decode
│   │   ├── list.ts           # List keys
│   │   ├── delete.ts         # Show activities to remove
│   │   └── info.ts           # Metadata display
│   └── lib/
│       ├── encoder.ts        # Bytes ↔ GPS offsets
│       ├── chunk.ts          # Header + chunking logic
│       ├── gpx.ts            # GPX XML generator
│       ├── polyline.ts       # Google polyline wrapper
│       ├── auth.ts           # Token management
│       └── strava.ts         # Strava API client
├── tests/                    # 73 tests, 8 test files
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Caveats

- **Not encrypted.** Data is encoded, not encrypted. Anyone with your Strava credentials can decode it. Anyone who fetches the activity's latlng stream can attempt to decode it (though activities are marked private).
- **Strava TOS gray area.** This is non-standard API usage. Strava could ban your API application if they notice or care. Use for personal experiments only.
- **Rate limits.** 100 req / 15 min. A 50-chunk file costs ~50 stream requests to retrieve, plus listing.
- **Activity clutter.** Every chunk is an activity. Your Strava training log will fill up with bogus "runs." The activities are private and marked as trainer=0 so they won't appear in feeds, but they're visible to you.
- **Precision.** Encoding uses 1 byte per axis per point (256 quanta). The polyline round-trip preserves 5 decimal places of GPS precision, which is more than enough for 256 values. Data integrity has been verified end-to-end.
- **No deletion via API.** You'll need to clean up old activities manually on the Strava website.

---

## License

MIT — because if you want to store your bitcoin wallet as a fictional run in Nevada, that's between you and Strava.
