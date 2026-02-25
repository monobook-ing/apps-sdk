# Apps SDK UI Projects

`apps-sdk` contains standalone UI projects for ChatGPT Apps SDK widgets.

## `chatgpt` project

Path: `apps-sdk/chatgpt`

This project builds the ChatGPT search widget runtime used by both MCP tools:

- `search_hotels`
- `search_rooms`

The current runtime renders `SearchRoomsWidgetV2` (dark overlay card design + `Reserve Now`) from MCP `structuredContent` inside:

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

Treat these two files as the canonical release artifact for search widget UI.

## API environment

Use explicit asset URLs (recommended):

```env
CHATGPT_WIDGET_JS_URL=https://your-widget-domain.vercel.app/apps/chatgpt-widget.js
CHATGPT_WIDGET_CSS_URL=https://your-widget-domain.vercel.app/apps/chatgpt-widget.css
```

`CHATGPT_WIDGET_BASE_URL` remains supported as a legacy fallback.

## Deploy order

1. Build `apps-sdk/chatgpt`.
2. Deploy `chatgpt-widget.js` and `chatgpt-widget.css`.
3. Ensure API points to those exact URLs via `CHATGPT_WIDGET_JS_URL` and `CHATGPT_WIDGET_CSS_URL`.
