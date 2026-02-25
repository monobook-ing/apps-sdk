import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  OpenAIBridge,
  SearchHotel,
  SearchRoom,
  SearchRoomsStructuredPayload,
} from "../openai";

const FALLBACK_GRADIENTS = [
  "linear-gradient(145deg, #4f3324 0%, #6f4a34 40%, #8c6a50 100%)",
  "linear-gradient(145deg, #085f6d 0%, #0e7a83 40%, #2aa7a0 100%)",
  "linear-gradient(145deg, #4a5b2f 0%, #6c7e40 50%, #8e9a5a 100%)",
  "linear-gradient(145deg, #5b5b5b 0%, #7a7a7a 50%, #a3a3a3 100%)",
];

const BRIDGE_METHODS = [
  "getInitialState",
  "getState",
  "getContext",
  "getToolOutput",
] as const;

const BRIDGE_STATIC_KEYS = [
  "toolOutput",
  "output",
  "data",
  "result",
  "response",
  "toolResult",
  "tool_output",
  "tool_result",
  "state",
  "value",
] as const;

const MAX_BRIDGE_ATTEMPTS = 80;
const BRIDGE_POLL_INTERVAL_MS = 100;

type BootstrapData = {
  widget?: string;
  payload?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseJson = (value: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const coerceToRecord = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    const parsed = parseJson(value);
    if (isRecord(parsed)) return parsed;
  }
  return null;
};

const hasSearchRoomsData = (value: Record<string, unknown>): boolean =>
  Object.prototype.hasOwnProperty.call(value, "rooms") ||
  Object.prototype.hasOwnProperty.call(value, "hotels") ||
  Object.prototype.hasOwnProperty.call(value, "count") ||
  Object.prototype.hasOwnProperty.call(value, "property_name") ||
  Object.prototype.hasOwnProperty.call(value, "error");

const flattenHotelsToRooms = (hotels: SearchHotel[] | undefined): SearchRoom[] => {
  if (!hotels || hotels.length === 0) return [];

  const rooms: SearchRoom[] = [];
  for (const hotel of hotels) {
    const hotelPropertyId = hotel.property_id;
    for (const room of hotel.matching_rooms ?? []) {
      rooms.push({
        ...room,
        property_id: room.property_id ?? hotelPropertyId,
      });
    }
  }
  return rooms;
};

const extractStructuredPayload = (
  payload: unknown
): SearchRoomsStructuredPayload | null => {
  const record = coerceToRecord(payload);
  if (!record) return null;

  const maybeStructured = coerceToRecord(record.structuredContent);
  if (maybeStructured) {
    return maybeStructured as SearchRoomsStructuredPayload;
  }

  for (const key of [
    "result",
    "output",
    "data",
    "response",
    "toolResult",
    "tool_result",
    "toolOutput",
    "tool_output",
    "value",
  ]) {
    const extracted = extractStructuredPayload(record[key]);
    if (extracted) return extracted;
  }

  if (Array.isArray(record.content)) {
    for (const item of record.content) {
      if (!isRecord(item)) continue;
      const text = item.text;
      if (typeof text !== "string") continue;
      const parsed = parseJson(text);
      const extracted = extractStructuredPayload(parsed);
      if (extracted) return extracted;
    }
  }

  if (hasSearchRoomsData(record)) {
    return record as SearchRoomsStructuredPayload;
  }

  for (const value of Object.values(record)) {
    const nested = coerceToRecord(value);
    if (!nested) continue;
    if (hasSearchRoomsData(nested)) {
      return nested as SearchRoomsStructuredPayload;
    }
  }

  return null;
};

const describeCandidateType = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
};

const bootstrapPayloadFromScript = (): SearchRoomsStructuredPayload | null => {
  const node = document.getElementById("monobook-widget-bootstrap");
  const fromScript = parseJson(node?.textContent ?? null) as BootstrapData | null;
  const query = new URLSearchParams(window.location.search);
  const queryPayload = parseJson(query.get("payload"));

  return (
    extractStructuredPayload(fromScript?.payload) ??
    extractStructuredPayload(queryPayload)
  );
};

const isPrefixCurrencyDisplay = (currencyDisplay: string): boolean => {
  return !/[A-Za-z]/.test(currencyDisplay);
};

const resolveCurrencyDisplay = (
  currencyDisplay: string | undefined,
  currencyCode: string | undefined
): string => {
  const normalizedDisplay = currencyDisplay?.trim();
  if (normalizedDisplay) return normalizedDisplay;
  const normalizedCode = currencyCode?.trim().toUpperCase();
  if (!normalizedCode) return "$";
  if (normalizedCode === "USD") return "$";
  return normalizedCode;
};

const formatPricePerNight = (
  value: string | number | undefined,
  currencyDisplay: string | undefined,
  currencyCode: string | undefined
): string => {
  const numeric = Number(value ?? 0);
  const resolvedCurrencyDisplay = resolveCurrencyDisplay(
    currencyDisplay,
    currencyCode
  );
  const amount = Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "0";
  if (isPrefixCurrencyDisplay(resolvedCurrencyDisplay)) {
    return `${resolvedCurrencyDisplay}${amount}/night`;
  }
  return `${amount} ${resolvedCurrencyDisplay}/night`;
};

const formatPriceLabel = (
  value: string | number | undefined,
  currencyDisplay: string | undefined,
  currencyCode: string | undefined
): string => {
  const numeric = Number(value ?? 0);
  if (Number.isFinite(numeric)) {
    return formatPricePerNight(value, currencyDisplay, currencyCode);
  }
  return formatPricePerNight(0, currencyDisplay, currencyCode);
};

const splitAmenities = (
  amenities: string[] | undefined
): { primary: string[]; extraCount: number } => {
  const normalized = (amenities ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    primary: normalized.slice(0, 3),
    extraCount: Math.max(normalized.length - 3, 0),
  };
};

const resolveImageSource = (room: SearchRoom): string | null => {
  const firstImage = room.images?.[0];
  if (!firstImage) return null;
  if (
    firstImage.startsWith("http://") ||
    firstImage.startsWith("https://") ||
    firstImage.startsWith("/") ||
    firstImage.startsWith("data:image/")
  ) {
    return firstImage;
  }
  return null;
};

type RoomCardProps = {
  room: SearchRoom;
  index: number;
  selected: boolean;
  onBookNow: (room: SearchRoom) => void;
};

function RoomCard({ room, index, selected, onBookNow }: RoomCardProps) {
  const imageSrc = resolveImageSource(room);
  const guestCount = room.max_guests && room.max_guests > 0 ? room.max_guests : "-";
  const amenities = splitAmenities(room.amenities);
  const fallbackBackground = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];

  return (
    <article className="room-card">
      <div className="room-card__media">
        {imageSrc ? (
          <img className="room-card__image" src={imageSrc} alt={room.name} />
        ) : (
          <div
            className="room-card__image room-card__image--fallback"
            style={{ background: fallbackBackground }}
            aria-label={room.name}
          />
        )}

        <div className="room-card__guests" aria-label="Max guests">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <path d="M20 8v6" />
            <path d="M23 11h-6" />
          </svg>
          <span>{guestCount}</span>
        </div>

        <div className="room-card__price">
          {formatPriceLabel(
            room.price_per_night,
            room.currency_display,
            room.currency_code
          )}
        </div>
      </div>

      <div className="room-card__body">
        <h3 className="room-card__title">{room.name}</h3>
        <p className="room-card__type">{room.type ?? "Room"}</p>

        <div className="room-card__amenities">
          {amenities.primary.map((amenity) => (
            <span key={`${room.id}-${amenity}`} className="chip">
              {amenity}
            </span>
          ))}
          {amenities.extraCount > 0 && <span className="chip">+{amenities.extraCount}</span>}
        </div>

        <button
          type="button"
          className={selected ? "book-button book-button--selected" : "book-button"}
          onClick={() => onBookNow(room)}
        >
          Book now
        </button>
      </div>
    </article>
  );
}

export function SearchRoomsWidget() {
  const [initialPayload] = useState<SearchRoomsStructuredPayload | null>(
    () => bootstrapPayloadFromScript()
  );
  const [payload, setPayload] = useState<SearchRoomsStructuredPayload | null>(
    initialPayload
  );
  const [loading, setLoading] = useState<boolean>(() => !initialPayload);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const loadBridgePayload = useCallback(async (): Promise<SearchRoomsStructuredPayload | null> => {
    const bridge = window.openai as OpenAIBridge | undefined;
    if (!bridge) {
      console.warn("[SearchRoomsWidget] OpenAI bridge not found on window.");
      return null;
    }

    const bridgeRecord = bridge as Record<string, unknown>;
    const candidates: unknown[] = [];
    const seen = new Set<unknown>();

    const addCandidate = (value: unknown) => {
      if (typeof value === "undefined") return;
      if (seen.has(value)) return;
      seen.add(value);
      candidates.push(value);
    };

    for (const key of BRIDGE_STATIC_KEYS) {
      addCandidate(bridgeRecord[key]);
    }

    for (const methodName of BRIDGE_METHODS) {
      const method = bridge[methodName];
      if (typeof method !== "function") continue;
      try {
        addCandidate(await method.call(bridge));
      } catch {
        // Bridge methods can be absent/fail depending on host lifecycle.
      }
    }

    for (const [key, value] of Object.entries(bridgeRecord)) {
      if (key.startsWith("_")) continue;
      if (typeof value === "function") continue;
      if (BRIDGE_STATIC_KEYS.includes(key as (typeof BRIDGE_STATIC_KEYS)[number])) {
        continue;
      }
      addCandidate(value);
    }

    console.warn(
      `[SearchRoomsWidget] Evaluating ${candidates.length} bridge candidates.`,
      candidates.map((candidate) => describeCandidateType(candidate))
    );

    for (const candidate of candidates) {
      const extracted = extractStructuredPayload(candidate);
      if (extracted) {
        console.warn("[SearchRoomsWidget] Structured payload extracted from bridge.");
        return extracted;
      }
    }
    console.warn("[SearchRoomsWidget] Structured payload extraction failed.");
    return null;
  }, []);

  useEffect(() => {
    if (payload) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollBridge = async () => {
      if (cancelled) return;
      const extracted = await loadBridgePayload();
      if (cancelled) return;

      if (extracted) {
        setPayload(extracted);
        setLoading(false);
        return;
      }

      attempts += 1;
      if (attempts < MAX_BRIDGE_ATTEMPTS) {
        timeoutId = setTimeout(pollBridge, BRIDGE_POLL_INTERVAL_MS);
      } else {
        setLoading(false);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (cancelled) return;
      const extracted = extractStructuredPayload(event.data);
      if (!extracted) return;
      setPayload(extracted);
      setLoading(false);
      console.warn("[SearchRoomsWidget] Structured payload received via postMessage.");
    };

    window.addEventListener("message", onMessage);
    pollBridge();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener("message", onMessage);
    };
  }, [loadBridgePayload, payload]);

  const rooms = useMemo(() => {
    if (Array.isArray(payload?.rooms) && payload.rooms.length > 0) {
      return payload.rooms;
    }
    return flattenHotelsToRooms(payload?.hotels);
  }, [payload]);

  const hotelCount = useMemo(() => {
    if (typeof payload?.count_hotels === "number") return payload.count_hotels;
    return payload?.hotels?.length ?? 0;
  }, [payload]);

  const count = useMemo(() => {
    if (typeof payload?.count === "number") return payload.count;
    if (typeof payload?.count_rooms === "number") return payload.count_rooms;
    return rooms.length;
  }, [payload, rooms.length]);

  const titleText = useMemo(() => {
    if (hotelCount > 1) {
      return `${count} rooms across ${hotelCount} hotels`;
    }

    if (hotelCount === 1) {
      const hotelName =
        payload?.hotels?.[0]?.property_name?.trim() ||
        payload?.property_name?.trim() ||
        "Selected hotel";
      return `${count} rooms at ${hotelName}`;
    }

    const propertyName = payload?.property_name?.trim() || "Selected property";
    return `${count} rooms at ${propertyName}`;
  }, [count, hotelCount, payload]);

  const onBookNow = useCallback(
    (room: SearchRoom) => {
      setSelectedRoomId(room.id);
      const detail = {
        room_id: room.id,
        room_name: room.name,
        property_id:
          room.property_id ??
          payload?.property_id ??
          payload?.hotels?.[0]?.property_id ??
          null,
      };

      window.dispatchEvent(
        new CustomEvent("monobook:room-select", { detail })
      );
      try {
        window.parent?.postMessage(
          { type: "monobook.room_select", detail },
          "*"
        );
      } catch {
        // Keep UI responsive even if parent messaging is unavailable.
      }
    },
    [payload?.hotels, payload?.property_id]
  );

  return (
    <main className="rooms-widget">
      <div className="rooms-widget__content">
        {loading && (
          <>
            <div className="skeleton skeleton--title" />
            <div className="rooms-grid">
              <div className="skeleton skeleton--card" />
              <div className="skeleton skeleton--card" />
            </div>
          </>
        )}

        {!loading && payload?.error && (
          <div className="widget-alert" role="alert">
            {payload.error}
          </div>
        )}

        {!loading && !payload?.error && (
          <>
            <h2 className="rooms-widget__title">
              {titleText}
            </h2>

            {rooms.length === 0 ? (
              <p className="rooms-widget__empty">
                No rooms found for these filters.
              </p>
            ) : (
              <div className="rooms-grid">
                {rooms.map((room, index) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    index={index}
                    selected={selectedRoomId === room.id}
                    onBookNow={onBookNow}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
