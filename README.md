<p align="center">
  <img src=".github/assets/cover.png" alt="Cover" />
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/github/license/gasleakdetector/gasleakdetector-server?color=04A8F4&style=flat-square"/>
  <img alt="Version" src="https://img.shields.io/badge/version-1.0-04A8F4?style=flat-square"/>
  <img alt="Build" src="https://img.shields.io/github/actions/workflow/status/gasleakdetector/gasleakdetector-server/ci.yml?style=flat-square&color=04A8F4"/>
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/gasleakdetector/gasleakdetector-server?color=04A8F4&style=flat-square"/>
</p>

<div align="center">    
  <h1>Gas Leak Detector — Server</h1>
	
  <p>
    Backend API for the Gas Leak Detector system.<br/>
    Handles ESP8266 sensor ingestion, persists data to Supabase,<br/>
    and streams real-time updates to the Android app via WebSocket.
  </p>

  <p>
    Part of the <b>Gas Leak Detector</b> ecosystem:
    <br/>
    <a href="https://github.com/gasleakdetector/gasleakdetector-server">Server</a> •
    <a href="https://github.com/gasleakdetector/gasleakdetector-esp">ESP8266 Firmware</a> •
    <a href="https://github.com/gasleakdetector/gasleakdetector">Android App</a>
  </p>
</div>

---

> ⚠️ This repository contains the server component only.  
> No hosted instance or pre-built binaries are provided — deployment is your responsibility.

## Quick Setup

1. [Deploy to Vercel](#deploy-to-vercel)
2. [Run the Supabase schema](#supabase-schema)
3. [Set environment variables](#environment-variables)

---

## Project Structure

```
api/
  historical.js      GET   — paginated historical sensor data
  ingest.js          POST  — primary ESP8266 data ingestion endpoint
  logs.js            GET   — recent logs with pagination
  realtime-config.js GET   — Supabase credentials for Android WebSocket
  status.js          GET   — latest reading for a device
lib/
  email.js           Resend email alert helper
  supabase.js        Supabase client, queries, and realtime subscriptions
  validator.js       API key validation, PPM status calculation, input validation
supabase/
  schema.sql         Full database schema — run once in Supabase SQL Editor
```

---

## API Reference

All endpoints require the header `x-api-key: <VALID_API_KEY>`.

### POST /api/ingest

Primary endpoint for the ESP8266 to push sensor readings. Accepts a single reading or a batch of up to 20.

**Single request body:**

```json
{ "device_id": "ESP_GASLEAK_01", "ppm": 245 }
```

**Batch request body:**

```json
{ "batch": [
  { "device_id": "ESP_GASLEAK_01", "ppm": 245 },
  { "device_id": "ESP_GASLEAK_01", "ppm": 260 }
]}
```

**Response (single):**

```json
{ "success": true, "log_id": 1042, "status": "normal" }
```

**Response (batch):**

```json
{ "success": true, "count": 2, "results": [{ "id": 1042, "status": "normal" }, ...] }
```

On each ingested reading, if the status is `danger` and the cooldown window has passed, an email alert is dispatched via Resend.

---

### GET /api/historical

Returns raw sensor readings for a time range with cursor-based pagination. The Android app calls this on startup to populate the chart.

**Query parameters:**

| Parameter   | Required | Default | Description                                   |
|-------------|----------|---------|-----------------------------------------------|
| `device_id` | No       | —       | Filter by device. Omit to return all devices. |
| `range`     | No       | `1d`    | Time window: `1h`, `6h`, `1d`, `7d`, `30d`   |
| `cursor`    | No       | —       | Last seen row `id` for pagination             |

**Response:**

```json
{
  "data": [{ "id": 1001, "gas_ppm": 245, "status": "normal", "created_at": "..." }, ...],
  "total": 1000,
  "nextCursor": 2001,
  "range": "1d",
  "device_id": "ESP_GASLEAK_01"
}
```

Returns up to 1000 rows per page. When `nextCursor` is `null`, all data has been returned. The response is gzip-compressed if the client sends `Accept-Encoding: gzip`.

---

### GET /api/logs

Returns recent readings with descending order and cursor pagination. Intended for debugging and lightweight dashboard queries.

**Query parameters:**

| Parameter   | Required | Default | Description                        |
|-------------|----------|---------|------------------------------------|
| `device_id` | No       | —       | Filter by device                   |
| `limit`     | No       | `100`   | Rows per page (max 500)            |
| `cursor`    | No       | —       | Last seen row `id` for pagination  |

**Response:**

```json
{ "logs": [...], "total": 100, "nextCursor": 940 }
```

---

### GET /api/status

Returns the most recent reading for a specific device. Useful for a quick health check or polling fallback.

**Query parameters:**

| Parameter   | Required | Description    |
|-------------|----------|----------------|
| `device_id` | Yes      | Target device  |

**Response:**

```json
{
  "id": 1042,
  "device_id": "ESP_GASLEAK_01",
  "gas_ppm": 245,
  "status": "normal",
  "ip_address": "192.168.1.5",
  "created_at": "2026-03-15T10:00:00+00:00"
}
```

---

### GET /api/realtime-config

Provides the Supabase URL and anonymous key required for the Android app to establish a direct WebSocket connection to Supabase Realtime. The primary purpose is to allow the Android client to dynamically obtain credentials for subscribing to real-time INSERT events on the gas_logs_raw table, eliminating the need to hardcode sensitive information in the APK.

Response:

```json
{ "url": "https://xxx.supabase.co", "anonKey": "eyJ..." }
```

The Android app calls this endpoint once at startup, builds the WebSocket URL using the returned credentials, and subscribes to INSERT events on gas_logs_raw to receive live sensor readings.

---

## Supabase Schema

Run `supabase/schema.sql` once in the Supabase SQL Editor. It creates:

- `devices` — registered device registry
- `gas_logs_raw` — raw readings from ESP, realtime-enabled
- `gas_logs_minute` — per-minute aggregates
- `gas_logs_hour` — per-hour aggregates
- `aggregate_gas_minute()` and `aggregate_gas_hour()` — aggregation functions
- `pg_cron` jobs for both aggregation functions
- Row Level Security policies (anon read-only)

### Retention Policy

Raw rows in `gas_logs_raw` are **never deleted automatically**. Data is preserved based on status:

| Status    | Retention         |
|-----------|-------------------|
| `normal`  | Manual cleanup only — no automatic deletion |
| `warning` | Kept permanently  |
| `danger`  | Kept permanently  |

> Historical queries beyond recent data should use the `gas_logs_minute` and `gas_logs_hour` aggregate tables for performance.

---

## Environment Variables

| Variable                | Required | Description                                                |
|-------------------------|----------|------------------------------------------------------------|
| `SUPABASE_URL`          | Yes      | Your Supabase project URL                                  |
| `SUPABASE_ANON_KEY`     | Yes      | Supabase anonymous key (used by Android WebSocket)         |
| `SUPABASE_SERVICE_KEY`  | Yes      | Supabase service role key (used by all server-side writes) |
| `VALID_API_KEY`         | Yes      | Shared secret sent in `x-api-key` header by ESP and app   |
| `RESEND_API_KEY`        | Yes      | Resend API key for email alerts                            |
| `ALERT_EMAIL`           | Yes      | Recipient address for danger-level alerts                  |
| `DANGER_THRESHOLD`      | Yes      | PPM value at or above which status becomes `danger` (Recommended: 800 for MQ-6)       |
| `WARNING_THRESHOLD`     | Yes      | PPM value at or above which status becomes `warning` (Recommended: 300 for MQ-6)      |
| `EMAIL_COOLDOWN_MINUTES`| No       | Minimum minutes between repeated email alerts (default: 2) |

Copy `.env` to `.env.local` for local development.

---

## Deploy to Vercel

> Vercel is the recommended deployment target. The project deploys as serverless functions with zero configuration.

### Option 1: Deploy button

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgasleakdetector%2Fgasleakdetector-server)

1. Click the button above
2. Fill in a repository name and click **Create**
3. Add all [environment variables](#environment-variables) in the Vercel dashboard under **Settings > Environment Variables**
4. Click **Deploy**

### Option 2: Vercel CLI

1. Install the Vercel CLI:

```bash
npm install -g vercel
```

2. Clone and enter the repository:

```bash
git clone https://github.com/gasleakdetector/gasleakdetector-server.git
cd gasleakdetector/gasleakdetector-server
```

3. Link to Vercel and deploy:

```bash
vercel
```

4. Add environment variables via the dashboard or CLI:

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
# ... repeat for all variables
```

5. Deploy to production:

```bash
vercel --prod
```

Your API will be available at `https://<project-name>.vercel.app`.

---

## Running Locally

```bash
npm install
```

Create a `.env` file with the variables listed above, then:

```bash
vercel dev
```

The API is available at `http://localhost:3000`.

---

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Apache 2.0 © [Gas Leak Detector](LICENSE)

---

## Closing

<p align="center">
  Have questions or ran into issues? Reach out at <a href="mailto:pan2512811@gmail.com">pan2512811@gmail.com</a>.<br/>
  Found this project useful? Consider giving it a ⭐ — it means a lot and helps others discover it. Thanks!
</p>

