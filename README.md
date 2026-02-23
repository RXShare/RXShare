# RXShare

Self-hosted file sharing. Upload stuff, get links, share them. Dark UI with glass effects because why not.

> ⚠️ **Beta** — This is still in active development. Things might break, data might vanish, dragons might appear. Don't run this in production unless you're okay with that. Back up your data.

## What it does

- Drag & drop file uploads with auto-generated thumbnails and previews
- Public/private sharing with direct links
- Custom OG embeds for Discord, Twitter, etc. (title, description, color per user)
- Admin panel for managing users, quotas, site settings, and theming
- API tokens for programmatic uploads (works with ShareX)
- User profiles with custom URL paths
- Multiple dashboard layouts (sidebar, header, floating dock)
- Color theming and background patterns
- SQLite by default, MySQL/MariaDB if you need it
- Local file storage by default, S3-compatible storage if you want it

## Setup

```bash
git clone https://github.com/RXShare/RXShare.git
cd RXShare
npm install
npm run build
npm start
```

Open it in your browser and the setup wizard will walk you through database, storage, and admin account creation.

## Config

Everything goes in `.env` — check `.env.example` for the full list. The setup wizard writes this for you on first run.

The only thing you really need to set manually is `JWT_SECRET` if you're not using the wizard.

## Scripts

- `npm run build` — build for production
- `npm start` — run the server
- `npm run dev` — dev mode with hot reload
- `npm run create-admin` — create an admin user from the terminal

## Stack

React Router 7 (SSR), TypeScript, Tailwind CSS 4, SQLite/MySQL, Sharp for image processing.

## License

[GPL-3.0](LICENSE)
