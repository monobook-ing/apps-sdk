# ChatGPT `search_rooms` Widget

Standalone Apps SDK UI widget for `search_rooms`.

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Artifacts:

- `dist/apps/chatgpt-widget.js`
- `dist/apps/chatgpt-widget.css`

## Expected payload shape

The widget reads standard MCP tool payloads and expects this `structuredContent` shape:

```json
{
  "property_id": "uuid-or-id",
  "property_name": "Sunset Beach Resort",
  "count": 6,
  "rooms": [
    {
      "id": "room-1",
      "property_id": "uuid-or-id",
      "name": "Garden Family Room",
      "type": "Family Room",
      "price_per_night": 195,
      "max_guests": 4,
      "amenities": ["WiFi", "Garden View", "Pool Access"],
      "images": ["https://..."]
    }
  ]
}
```
