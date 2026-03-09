# Excalidraw Persist

A self-hostable collaborative whiteboard app with server-side persistence and multiple boards, based on [Excalidraw](https://excalidraw.com/).

```bash
docker run -p 80:80 ghcr.io/alejandr003/excalidraw-persist:latest
```

<img width="1440" height="790" alt="Screenshot" src="https://github.com/user-attachments/assets/18f0f065-58d1-42d8-94d6-b29531b4b685" />

## Features

- 💾 **Server-side persistence** of drawings, images, and library objects
- 📑 **Multiple boards/tabs** support with rename and management
- 🤝 **Real-time collaboration** — multiple users can draw together simultaneously with live cursor tracking (up to 6 users per board)
- 🖱️ **Live cursors** — see other collaborators' cursors and usernames in real time
- 🔗 **Board sharing** via shareable links (edit or read-only)
- 🗑️ **Trash** — deleted boards go to trash and can be restored or permanently deleted
- 🗃️ **SQLite database** for simple, zero-config deployment
- 🖼️ **Image/file persistence** — images embedded in drawings are stored server-side
- 📚 **Library persistence** — your Excalidraw element library is saved per board

---

## Real-Time Collaboration

Multiple users can join the same board and draw together in real time.

- Up to **6 users** can collaborate simultaneously on a single board.
- Each collaborator gets a **unique color** assigned automatically.
- **Live cursors** show the position and username of each collaborator.
- Changes are broadcast instantly to all connected users via Socket.IO (polling + WebSocket upgrade).
- The connection works reliably behind reverse proxies and Cloudflare Tunnel.

### How to collaborate

1. Open any board.
2. Share the board URL with others (or use the **Share** button for a shareable link).
3. Anyone with the URL sees the board live — cursors and edits appear in real time.

---

## Sharing Boards

Each board can be shared with a unique link at one of two permission levels:

| Permission    | Description                                        |
| ------------- | -------------------------------------------------- |
| **Edit**      | Anyone with the link can view and modify the board |
| **Read-only** | Anyone with the link can only view the board       |

### How to share a board

1. Open the board you want to share.
2. Click the **Share** button in the header.
3. Choose **Edit access** or **Read-only access** and click **Create link**.
4. The link is automatically copied to your clipboard.

Recipients can open the link without an account. Edit-link recipients can make changes that are saved server-side and reflected for all users of that board.

> Share links are persistent — they remain valid until manually removed. Each board supports one link per permission level.

---

## Development

This project uses pnpm workspaces as a monorepo.

### Prerequisites

- [Node.js](https://nodejs.org/) v22 or newer
- [pnpm](https://pnpm.io/) v10 or newer

```bash
# Clone the repository
git clone https://github.com/alejandr003/excalidraw-persist.git
cd excalidraw-persist

# Install dependencies
pnpm install

# Create environment configuration
cp packages/server/.env.example packages/server/.env

# Start development servers (client on :3000, server on :4000)
pnpm dev

# Build for production
pnpm build
```

---

## Deployment

### Docker (Recommended)

The simplest way to deploy. A single container runs both nginx (frontend) and Node.js (backend) managed by supervisord.

#### Quick start

```bash
docker run -d \
  -p 80:80 \
  -v excalidraw_data:/app/data \
  --name excalidraw \
  ghcr.io/alejandr003/excalidraw-persist:latest
```

Access the app at `http://localhost` (or your server's IP/domain).

#### Docker Compose (recommended for persistent data)

Create a `docker-compose.yml`:

```yaml
services:
  excalidraw:
    image: ghcr.io/alejandr003/excalidraw-persist:latest
    ports:
      - '80:80'
    volumes:
      - excalidraw_data:/app/data
    environment:
      - PORT=4000
      - NODE_ENV=production
      - DB_PATH=/app/data/database.sqlite
    restart: unless-stopped

volumes:
  excalidraw_data:
    driver: local
```

Then run:

```bash
docker-compose up -d
```

#### Available npm scripts

| Script | Description |
|---|---|
| `pnpm docker:build` | Build the Docker image |
| `pnpm docker:up` | Start containers in detached mode |
| `pnpm docker:down` | Stop and remove containers |
| `pnpm docker:logs` | Follow container logs |

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Internal port for the Node.js backend |
| `NODE_ENV` | `production` | Environment mode |
| `DB_PATH` | `/app/data/database.sqlite` | Path to the SQLite database file |

#### Container architecture

```
[Browser] → nginx:80 → /api/*      → Node.js:4000 (REST API)
                      → /socket.io/ → Node.js:4000 (Socket.IO)
                      → /*          → React SPA (static files)
```

Both nginx and Node.js run inside the **same container** managed by supervisord.

---

### Deploying behind a Reverse Proxy or Cloudflare Tunnel

If you expose the app through nginx, Caddy, or Cloudflare Tunnel, Socket.IO requires correct WebSocket/proxy headers.

#### nginx example

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location /socket.io/ {
    proxy_pass http://localhost:80;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

#### Cloudflare Tunnel

Cloudflare Tunnel supports WebSocket natively. No special configuration is required beyond ensuring WebSocket is not blocked by WAF rules.

---

### Manual Deployment

```bash
git clone https://github.com/alejandr003/excalidraw-persist.git
cd excalidraw-persist
pnpm install
cp packages/server/.env.example packages/server/.env
# Edit packages/server/.env as needed
pnpm build
pnpm start
```

For production, use a process manager:

```bash
npm install -g pm2
pm2 start pnpm --name "excalidraw-persist" -- start
pm2 save
```

---

## Backup

All data is stored in an SQLite database file.

```bash
# Docker
docker cp excalidraw:/app/data/database.sqlite ./backup/

# Docker Compose (volume)
cp -r ./data/database.sqlite /your/backup/location/
```

---

## Troubleshooting

| Problem | What to check |
|---|---|
| App not loading | Verify port 80 is not in use. Check `docker logs` |
| Collaboration not working | Open browser DevTools → Console. If you see `Transport unknown`, check nginx WebSocket headers |
| Cursors not visible | Ensure the Socket.IO connection is established (check the "Connecting..." indicator in the header) |
| Images not persisting | Verify the `/app/data` volume is mounted and writable |
| Database errors | Check that `DB_PATH` is writable inside the container |

Check container logs:

```bash
docker logs excalidraw
# Or inside the container
docker exec -it excalidraw tail -f /var/log/supervisor/server.log
docker exec -it excalidraw tail -f /var/log/supervisor/nginx_error.log
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Excalidraw |
| Backend | Node.js, Express, Socket.IO 4 |
| Database | SQLite (better-sqlite3) |
| Real-time | Socket.IO (polling + WebSocket) |
| Proxy | nginx (alpine) |
| Container | Docker, supervisord |
| CI/CD | GitHub Actions → GHCR |

---

## License

MIT
