# Local testing — web + mobile + LAN access

End-to-end runbook for testing the platform on your dev machine and from a
phone over LAN. Covers WSL2 → LAN networking, login creds, and a feature
checklist for the AI surfaces.

---

## 1. Bring the stack up

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

To enable AI features, set your OpenAI key first:

```bash
export OPENAI_API_KEY=sk-...your-key...
docker compose -f infrastructure/docker/docker-compose.yml up -d adaptive-engine
```

Verify:

```bash
curl -s http://localhost:38010/adaptive/ai-status
# {"enabled": true,  "provider": "openai"}  ← AI engaged
# {"enabled": false, "provider": "openai"}  ← heuristic fallback
```

---

## 2. Test from your dev machine

### URLs

| Surface | URL | Login |
|---|---|---|
| Student web | http://localhost:35173 | `student@alp.dev` / `Password123!` |
| Educator portal | http://localhost:35174 | `teacher@alp.dev` / `Password123!` |
| Admin | http://localhost:35175 | `admin@alp.dev` / `Password123!` |
| Mailpit (OTP/reset emails) | http://localhost:38025 | (no auth) |

### AI feature checklist

After logging into student web at port 35173:

- [ ] **Home dashboard** — observe **Predicted AIR card** (top, purple), then
      a **Photo-Doubt panel**, then **Guided Next Steps** (3 ranked actions),
      then **Cross-Topic Weakness Diagnosis**.
- [ ] **Topic detail** — drill into any topic from Study Map. Bottom of page
      shows "Stuck on something? Ask the AI tutor" — opens a streaming
      chat panel.
- [ ] **Quiz Result** — finish a quiz session. Each item shows a teaching
      note (authored when present, AI-generated for wrong answers, on-demand
      button for correct ones).

In the educator portal at 35174:

- [ ] Go to **New Question** → pick Exam → Subject → Topic.
- [ ] Below the manual form, find **AI-assisted authoring** panel.
- [ ] Click `✨ Generate N draft questions`. Items appear; edit any field;
      click `Save N drafts`. Each lands as DRAFT in your question list.

### What "AI" vs "heuristic" looks like

Each AI surface returns a `source: "ai" | "heuristic" | "stub"` field that the
UI surfaces as a chip:

- **◈ AI** — OpenAI-generated, learner-specific narrative
- **◈ Heuristic** — deterministic fallback derived from mastery vector / IRT
- **◈ Stub** — feature explicitly requires `OPENAI_API_KEY` (e.g. photo OCR)

If a card says *◈ Heuristic* when you expected *◈ AI*, your key isn't loaded —
re-run the compose step in §1 with the env var set, or check
`docker exec alp-local-adaptive-engine-1 env | grep OPENAI`.

---

## 3. Test from a phone or other LAN device

You're on **WSL2**. WSL has its own internal IP (`172.30.x.x`) that LAN
devices can't reach directly. Pick **one** of the two options below.

### Option A — Mirrored networking (Windows 11 22H2+, easiest)

In `%USERPROFILE%\.wslconfig` add:

```ini
[wsl2]
networkingMode=mirrored
```

Then from PowerShell:

```powershell
wsl --shutdown
```

Restart your terminal. WSL services bound to `0.0.0.0` are now reachable on
your **Windows host's LAN IP**. Find it with:

```powershell
ipconfig | findstr IPv4
```

Open Windows Firewall for the ports (one-time, admin PowerShell):

```powershell
New-NetFirewallRule -DisplayName "ALP-LAN" -Direction Inbound `
  -LocalPort 35173,35174,35175,38001,38010,38011 -Protocol TCP -Action Allow
```

### Option B — Manual port forwarding (any Windows version)

Run the helper from this repo as admin in PowerShell:

```powershell
cd <path-to-this-repo>\scripts
.\wsl-lan-forward.ps1
```

This sets up `netsh portproxy` from Windows → WSL for every port you need
plus matching firewall rules. The script prints the URLs. Re-run it after
any WSL or Windows restart (WSL IPs aren't stable across reboots — use
Option A if you want this to persist).

To remove later: `.\wsl-lan-forward.ps1 -Remove`

### From your phone

With either option, on a LAN device pointed to your Windows host's IP
(call it `<HOST-IP>`):

| Surface | URL |
|---|---|
| Student web | `http://<HOST-IP>:35173` |
| Educator portal | `http://<HOST-IP>:35174` |
| Admin | `http://<HOST-IP>:35175` |

The web apps work in any phone browser — exact same surface as desktop,
including all eight AI features.

---

## 4. Flutter mobile app

The mobile app needs the same `<HOST-IP>` to find the API. It uses **one**
base URL, routes through web-student's nginx, so only one port needs to be
reachable.

### Build & run with the LAN IP baked in

```bash
cd apps/mobile
flutter run --dart-define=ALP_API_BASE_URL=http://<HOST-IP>:35173/api/v1
```

For Android emulator (still on your dev machine), use the loopback IP:

```bash
flutter run --dart-define=ALP_API_BASE_URL=http://10.0.2.2:35173/api/v1
```

For a real Android/iOS device on the same WiFi, use your Windows host IP:

```bash
flutter run --dart-define=ALP_API_BASE_URL=http://192.168.x.x:35173/api/v1
```

> **Note**: the default in `apps/mobile/lib/main.dart` is `http://10.0.2.2:38001`
> — this only works for the Android emulator and only for `/auth/*` routes
> (it doesn't include `/api/v1` and points at the auth service direct, not
> nginx). **For real-device testing, always pass `--dart-define=ALP_API_BASE_URL=…`**.

### Quick smoke from a phone browser

Before flashing the mobile app, sanity-check from any LAN device:

```bash
# From phone or laptop on the same WiFi:
curl http://<HOST-IP>:35173/api/v1/adaptive/ai-status
# Expect: {"enabled": true|false, "provider": "openai"}
```

If that returns the right JSON, the network path is working. If not, see
the troubleshooting section.

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Phone gets `connection refused` | WSL ports not forwarded to Windows | Run `wsl-lan-forward.ps1` (Option B) or set up mirrored mode (Option A) |
| Phone gets `timeout` | Windows Firewall blocks the port | Add the firewall rule shown in Option A |
| `localhost` works but LAN doesn't | Service bound to 127.0.0.1 only | Verify with `docker compose ps` — every port should show `0.0.0.0:NNNNN->8000/tcp` |
| Mobile app crashes on launch | Wrong `ALP_API_BASE_URL` (no `/api/v1` suffix, or wrong port) | Should be `http://<HOST>:35173/api/v1` |
| AI cards say "heuristic" everywhere | `OPENAI_API_KEY` missing in container | `docker exec alp-local-adaptive-engine-1 env \| grep OPENAI` — should show the key |
| `make seed-hindi` ran but no Hindi questions | Bridge subscriber needs catalog DB up | `docker logs alp-local-quiz-1 \| grep content.question` should show subscriber attached |

### Verify which IP is which (WSL2)

```bash
# Inside WSL — internal WSL IP (NOT what your phone uses):
hostname -I

# From PowerShell on Windows — your Windows host LAN IP (what your phone uses):
ipconfig | findstr IPv4
```

---

## 6. Seeded test users (every fresh stack)

These are inserted by Auth migration 004 when `AUTH_SEED_LOCAL=1` (set by
default in `docker-compose.yml`):

| Email | Password | Role | What it tests |
|---|---|---|---|
| `student@alp.dev` | `Password123!` | STUDENT | Quiz, AI tutor, photo-doubt, rank, weakness, explanations |
| `teacher@alp.dev` | `Password123!` | TEACHER | Authoring (manual + AI), submit for review |
| `moderator@alp.dev` | `Password123!` | MODERATOR | Review queue, approve/reject |
| `admin@alp.dev` | `Password123!` | PLATFORM_ADMIN | Flag console, audit log, user management |
