# Divas Bakers

**Freshly Baked · Beautifully Served**

A responsive bakery website with a password-protected product admin. The product catalog is served by the included Node server and saved in a persistent data directory. Pushing to GitHub does not publish the live site.

## Requirements

- Node.js 20 or newer.
- No third-party Node packages are required.

## Run locally

Copy `.env.example` to `.env` and set a private `ADMIN_PASSWORD` (at least 14 characters) and random `SESSION_SECRET` (at least 32 random bytes, encoded as hex). In PowerShell, start with `Copy-Item .env.example .env`. Generate a secret with:

```bash
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

Keep `.env` private; it is excluded from Git. Run the server:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). The product admin is at [http://localhost:3000/admin.html](http://localhost:3000/admin.html). For the equivalent development script, run `npm run dev`. Set `PORT` to use a different port; the default is `3000`.

## Product catalog

Open `/admin.html` to add, edit, hide, or delete products. Each product can have a category, description, photo, and up to 12 size or serving options priced in whole Kenyan shillings (KSh). Photos are resized in the browser before upload. The public catalog displays published products and creates a WhatsApp inquiry link for each item.

Product records are stored in `DATA_DIR/products.json` and photos in `DATA_DIR/uploads/`. By default, `DATA_DIR` is the `data/` directory beside the server. On the production host, point `DATA_DIR` at persistent writable storage and back up that directory.

The admin uses one server-side password and signed, HttpOnly sessions. Keep `ADMIN_PASSWORD` and `SESSION_SECRET` private, use HTTPS in production, and do not commit `.env`. If the password or session secret does not meet the requirements above, the admin stays disabled.

Customer reviews remain in each visitor’s browser only; they are not sent to the bakery or shared between visitors. Opening hours remain placeholders because actual times were not provided. The custom-cake form prepares a WhatsApp inquiry; customers review and send it themselves.

## Project structure

| Path | Purpose |
| --- | --- |
| `public/index.html` | Homepage, product catalog, services, contact details, gallery, and WhatsApp inquiry links |
| `public/styles.css` | Responsive website styles |
| `public/script.js`, `public/catalog.js` | Navigation, filters, browser-local reviews, cake inquiry, and shared product rendering |
| `public/admin.html`, `public/admin.js`, `public/admin.css` | Password-protected product management interface |
| `server.mjs` | Node server for website files, product APIs, authentication, and uploaded images |
| `.env.example` | Template for private server configuration |
| `app.config.ts` | Manus project branding metadata |

## Images and portability

The website logo and original gallery images are bundled in `public/images/`. Product photos added through the admin are stored under `DATA_DIR/uploads/`, outside the public source tree; the server serves only the validated uploaded image files.

## Deploy

The existing Manus project is configured for static output (`public/`) and does not run `server.mjs`, so it cannot provide the shared product API or admin. To use the admin for customers, deploy this project as a Node.js service using `npm start`, configure `ADMIN_PASSWORD` and `SESSION_SECRET` as hosting secrets, and attach persistent storage at `DATA_DIR`. A static-only deployment can serve the page files, but product management and the shared catalog require the Node server. Auto-publishing is off, so pushing this GitHub repository alone does not publish the site.

For another host, run `npm start` from the project root and provide persistent writable storage for `DATA_DIR`; serving only the `public/` folder will not run the admin API. Serve the site at the domain root because its asset and page links use root-relative paths. This repository does not include a hosting-specific deployment pipeline.
