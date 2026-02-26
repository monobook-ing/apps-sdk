import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  OpenAIBridge,
  SearchHotel,
  SearchRoom,
  SearchRoomsStructuredPayload,
} from "../openai";

const FALLBACK_GRADIENTS = [
  "linear-gradient(150deg, #405760 0%, #5d7884 42%, #7f9ca8 100%)",
  "linear-gradient(150deg, #4a4e36 0%, #65704a 42%, #8a9560 100%)",
  "linear-gradient(150deg, #56463e 0%, #6f5a4f 42%, #8d7464 100%)",
  "linear-gradient(150deg, #384958 0%, #4f6578 42%, #68839b 100%)",
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

const formatPrice = (
  value: string | number | undefined,
  currencyDisplay: string | undefined,
  currencyCode: string | undefined
): string => {
  const numeric = Number(value ?? 0);
  const resolvedCurrencyDisplay = resolveCurrencyDisplay(
    currencyDisplay,
    currencyCode
  );
  if (Number.isFinite(numeric)) {
    const amount = numeric.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (isPrefixCurrencyDisplay(resolvedCurrencyDisplay)) {
      return `${resolvedCurrencyDisplay}${amount}`;
    }
    return `${amount} ${resolvedCurrencyDisplay}`;
  }
  if (isPrefixCurrencyDisplay(resolvedCurrencyDisplay)) {
    return `${resolvedCurrencyDisplay}0`;
  }
  return `0 ${resolvedCurrencyDisplay}`;
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

const resolveBathCount = (room: SearchRoom): string => {
  const fromAmenity = (room.amenities ?? []).find((item) => /bath/i.test(item));
  const amenityMatch = fromAmenity?.match(/\d+(?:\.\d+)?/);
  if (amenityMatch) return amenityMatch[0];

  const descriptionMatch = room.description?.match(/(\d+(?:\.\d+)?)\s*(bath|bathroom)/i);
  if (descriptionMatch) return descriptionMatch[1];

  return "1";
};

const resolveArea = (room: SearchRoom): string => {
  const textBlocks = [room.description, ...(room.amenities ?? [])].filter(Boolean);
  for (const block of textBlocks) {
    const match = block?.match(/(\d{3,5})\s*(sq\.?\s*ft|sqft|ft2|sqm|m2)/i);
    if (match) {
      const unit = /sqm|m2/i.test(match[2]) ? "sqm" : "sqft";
      return `${match[1]} ${unit}`;
    }
  }

  return "N/A";
};

type RoomCardV2Props = {
  room: SearchRoom;
  index: number;
  selected: boolean;
  subtitle: string;
  onBookNow: (room: SearchRoom) => void;
};

function RoomCardV2({ room, index, selected, subtitle, onBookNow }: RoomCardV2Props) {
  const imageSrc = resolveImageSource(room);
  const guestCount = room.max_guests && room.max_guests > 0 ? room.max_guests : 2;
  const bedCount = Math.max(1, Math.ceil(guestCount / 2));
  const bathCount = resolveBathCount(room);
  const area = resolveArea(room);
  const fallbackBackground = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];

  return (
    <article className="room-card-v2">
      {imageSrc ? (
        <img className="room-card-v2__image" src={imageSrc} alt={room.name} />
      ) : (
        <div
          className="room-card-v2__image room-card-v2__image--fallback"
          style={{ background: fallbackBackground }}
          aria-label={room.name}
        />
      )}

      <div className="room-card-v2__overlay" />

      <div className="room-card-v2__content">
        <h3 className="room-card-v2__title">{room.name}</h3>
        <p className="room-card-v2__subtitle">{subtitle}</p>

        <div className="room-card-v2__facts" role="list" aria-label="Room details">
          <span className="room-card-v2__fact" role="listitem">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 11h18v8H3z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M6 11V8a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <span>Bed: {bedCount}</span>
          </span>

          <span className="room-card-v2__fact room-card-v2__fact--separated" role="listitem">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 15V9a2 2 0 0 1 2-2h8a4 4 0 0 1 4 4v4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path d="M4 15h16v3H4z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <span>Baths: {bathCount}</span>
          </span>

          <span className="room-card-v2__fact room-card-v2__fact--separated" role="listitem">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8h16M4 16h16" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M4 4v16M20 4v16" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <span>{area}</span>
          </span>
        </div>

        <div className="room-card-v2__actions">
          <span className="room-card-v2__price">
            {formatPrice(
              room.price_per_night,
              room.currency_display,
              room.currency_code
            )}
          </span>
          <button
            type="button"
            className={
              selected
                ? "room-card-v2__reserve room-card-v2__reserve--selected"
                : "room-card-v2__reserve"
            }
            onClick={() => onBookNow(room)}
          >
            {selected ? "Reserved" : "Reserve Now"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function SearchRoomsWidgetV2() {
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
      console.warn("[SearchRoomsWidgetV2] OpenAI bridge not found on window.");
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
      `[SearchRoomsWidgetV2] Evaluating ${candidates.length} bridge candidates.`,
      candidates.map((candidate) => describeCandidateType(candidate))
    );

    for (const candidate of candidates) {
      const extracted = extractStructuredPayload(candidate);
      if (extracted) {
        console.warn("[SearchRoomsWidgetV2] Structured payload extracted from bridge.");
        return extracted;
      }
    }
    console.warn("[SearchRoomsWidgetV2] Structured payload extraction failed.");
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
      console.warn("[SearchRoomsWidgetV2] Structured payload received via postMessage.");
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

  const roomSubtitle = useMemo(() => {
    const byPropertyId = new Map<string, string>();

    for (const hotel of payload?.hotels ?? []) {
      const propertyId = hotel.property_id?.trim();
      const propertyName = hotel.property_name?.trim();
      if (propertyId && propertyName) {
        byPropertyId.set(propertyId, propertyName);
      }
    }

    return (room: SearchRoom): string => {
      const propertyId = room.property_id?.trim();
      if (propertyId && byPropertyId.has(propertyId)) {
        return byPropertyId.get(propertyId) as string;
      }

      const payloadProperty = payload?.property_name?.trim();
      if (payloadProperty) return payloadProperty;

      const roomType = room.type?.trim();
      if (roomType) return roomType;

      return "Monobook Collection";
    };
  }, [payload?.hotels, payload?.property_name]);

  const onBookNow = useCallback(
    async (room: SearchRoom) => {
      setSelectedRoomId(room.id);

      const propertyId =
        room.property_id ??
        payload?.property_id ??
        payload?.hotels?.[0]?.property_id ??
        null;

      // Call create_booking via the OpenAI bridge when available
      const bridge = window.openai;
      if (bridge?.callTool) {
        try {
          await bridge.callTool("create_booking", {
            property_id: propertyId,
            room_id: room.id,
            guest_name: "Guest",
            check_in: payload?.check_in ?? "",
            check_out: payload?.check_out ?? "",
            guests: payload?.guests ?? 2,
          });
        } catch {
          // Fall through to event dispatching
        }
      }

      // Keep event dispatching as fallback for non-ChatGPT contexts
      const detail = {
        room_id: room.id,
        room_name: room.name,
        property_id: propertyId,
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
    [payload]
  );

  return (
    <main className="rooms-widget-v2">
      <div className="rooms-widget-v2__content">
        {loading && (
          <>
            <div className="skeleton skeleton--title" />
            <div className="rooms-grid-v2">
              <div className="skeleton skeleton--card-v2" />
              <div className="skeleton skeleton--card-v2" />
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
            <h2 className="rooms-widget-v2__title">{titleText}</h2>

            {rooms.length === 0 ? (
              <p className="rooms-widget-v2__empty">
                No rooms found for these filters.
              </p>
            ) : (
              <div className="rooms-grid-v2">
                {rooms.map((room, index) => (
                  <RoomCardV2
                    key={room.id}
                    room={room}
                    index={index}
                    selected={selectedRoomId === room.id}
                    subtitle={roomSubtitle(room)}
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
