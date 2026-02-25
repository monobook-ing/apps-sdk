# Apps SDK UI Projects

`apps-sdk` contains standalone UI projects for ChatGPT Apps SDK widgets.

## `chatgpt` project

Path: `apps-sdk/chatgpt`

This project builds a dedicated `search_rooms` widget component (cards + `Book now`) that reads MCP `structuredContent` and renders UI inside:

- `#monobook-widget-root`
- bootstrap script: `#monobook-widget-bootstrap`

## Commands

```bash
cd apps-sdk/chatgpt
npm install
npm run build
```

Build output:

- `apps-sdk/chatgpt/dist/apps/chatgpt-widget.js`
- `apps-sdk/chatgpt/dist/apps/chatgpt-widget.css`

Deploy these two assets to your Vercel static host.

## API environment

Point API to the widget domain:

```env
CHATGPT_WIDGET_BASE_URL=https://your-widget-domain.vercel.app
```

or explicit URLs:

```env
CHATGPT_WIDGET_JS_URL=https://your-widget-domain.vercel.app/apps/chatgpt-widget.js
CHATGPT_WIDGET_CSS_URL=https://your-widget-domain.vercel.app/apps/chatgpt-widget.css
```
