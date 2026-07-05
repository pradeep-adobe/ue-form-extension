# Universal Editor Hosted Extension Starter

A minimal Universal Editor extension that can be hosted on any HTTPS static host.

## What it does

- Registers a header menu button in AEM Universal Editor.
- Shows a toast.
- Opens a modal page served from the same origin.

## Local development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Vite runs on `http://localhost:5173` by default. Universal Editor requires HTTPS for loading extensions, so for real UE preview you need one of these:

- serve the site with HTTPS on localhost using a local certificate, or
- deploy the built files to an HTTPS host, or
- expose your local server through an HTTPS tunnel.

## Build for deployment

```bash
npm run build
```

Deploy the generated `dist/` folder to any static HTTPS host such as Netlify, Vercel, GitHub Pages, S3, Azure Static Web Apps, or any internal static server.

## Using it in Universal Editor

Use the hosted extension URL in the Universal Editor extension configuration.
For local preview, Adobe documents the flow as loading the extension with:

`devMode=true&ext=https://localhost:9080`

That documented flow uses HTTPS and a self-signed cert that the browser must trust.

## Notes

- `http://localhost` will not be good enough for UE extension loading because the documented flow requires HTTPS.
- The modal URL must be same-origin with the extension page.
