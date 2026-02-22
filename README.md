# RXShare

A self-hosted file sharing platform with a modern glassmorphism UI. Upload, manage, and share files with customizable embeds, user management, and a sleek dark interface.

## Features

- File upload with drag & drop, thumbnails, and preview
- Public/private file sharing with unique links
- Customizable OG embeds (title, description, color) for Discord/Twitter/etc.
- Admin panel — user management, storage quotas, design customization
- Dynamic color theming and background patterns
- Multiple dashboard layouts: sidebar, header, floating dock
- API tokens for programmatic uploads (ShareX compatible)
- User profiles with custom URL paths
- SQLite (default) or MySQL/MariaDB database
- Local storage (default) or S3-compatible object storage
- Auto-generated avatars
- Mobile responsive

## Quick Start

```bash
# Clone
git clone https://github.com/RXShare/RXShare.git
cd RXShare

# Install dependencies
npm install

# Copy and edit environment config
cp .env.example .env

# Build
npm run build

# Start
npm start
```

On first launch, visit the app to run the setup wizard and create your admin account.

## Environment Variables

See `.env.example` for all available options. At minimum you need:

- `JWT_SECRET` — change this to a random secret string
- `PORT` — server port (default: 3000)

## Tech Stack

- React Router 7 (SSR)
- TypeScript
- Tailwind CSS 4
- SQLite (better-sqlite3) / MySQL (mysql2)
- Sharp (image thumbnails)
- Material Symbols icons

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run dev` | Development server |
| `npm run create-admin` | Create admin user via CLI |

## License

MIT
