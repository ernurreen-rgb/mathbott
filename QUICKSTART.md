## Containerized Run (Recommended)

Start the whole project with one command:

```bash
docker compose up --build -d
```

Check status:

```bash
docker compose ps
docker compose logs -f backend frontend
```

Stop:

```bash
docker compose down
```

Environment variables for compose (set them in your shell or in `.env` next to `docker-compose.yml`):

```env
NEXTAUTH_SECRET=change-me-in-production
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_SECRET=change-me-in-production
ADMIN_EMAIL=
```

# Quick Start: Mathbot

## 1. Backend (API)

```bash
cd bot
pip install -r requirements.txt
export PORT=8000
python main.py
```

### Windows (PowerShell)

```powershell
cd bot
pip install -r requirements.txt
$env:PORT="8000"
python main.py
```

The API will be available at `http://localhost:8000`.

## 2. Frontend (Web Interface)

```bash
cd web
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional (debug / logs)
# NEXTAUTH_DEBUG=true
# NEXT_PUBLIC_DEBUG_API=true
# NEXT_PUBLIC_DEBUG_UI=true
```

Start the frontend:

```bash
npm run dev
```

The web interface will be available at `http://localhost:3000`.

## First Steps

1. Open `http://localhost:3000` and sign in with Google.
2. Add tasks through the admin panel in the web interface.
3. Solve a task from the main UI.

## Google OAuth Setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the Google OAuth APIs you need.
4. Create OAuth 2.0 credentials.
5. Add `http://localhost:3000/api/auth/callback/google` to authorized redirect URIs.
6. Copy the Client ID and Client Secret into `.env.local`.
