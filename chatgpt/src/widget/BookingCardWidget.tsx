import { useCallback, useEffect, useState } from "react";

import type { BookingPayload, OpenAIBridge } from "../openai";

const FALLBACK_GRADIENT =
  "linear-gradient(135deg, #0b1020 0%, #2b3c6e 45%, #c99a54 100%)";

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

const MAX_BRIDGE_ATTEMPTS_FAST = 100;
const BRIDGE_POLL_INTERVAL_FAST = 100;
const MAX_BRIDGE_ATTEMPTS_SLOW = 40;
const BRIDGE_POLL_INTERVAL_SLOW = 500;

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

const hasBookingData = (value: Record<string, unknown>): boolean =>
  Object.prototype.hasOwnProperty.call(value, "booking_id") ||
  (Object.prototype.hasOwnProperty.call(value, "status") &&
    Object.prototype.hasOwnProperty.call(value, "total") &&
    Object.prototype.hasOwnProperty.call(value, "check_in"));

const extractBookingPayload = (payload: unknown): BookingPayload | null => {
  const record = coerceToRecord(payload);
  if (!record) return null;

  const maybeStructured = coerceToRecord(record.structuredContent);
  if (maybeStructured && hasBookingData(maybeStructured)) {
    return maybeStructured as BookingPayload;
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
    const extracted = extractBookingPayload(record[key]);
    if (extracted) return extracted;
  }

  if (Array.isArray(record.content)) {
    for (const item of record.content) {
      if (!isRecord(item)) continue;
      const text = item.text;
      if (typeof text !== "string") continue;
      const parsed = parseJson(text);
      const extracted = extractBookingPayload(parsed);
      if (extracted) return extracted;
    }
  }

  if (hasBookingData(record)) {
    return record as BookingPayload;
  }

  for (const value of Object.values(record)) {
    const nested = coerceToRecord(value);
    if (!nested) continue;
    if (hasBookingData(nested)) {
      return nested as BookingPayload;
    }
  }

  return null;
};

const bootstrapPayloadFromScript = (): BookingPayload | null => {
  const node = document.getElementById("monobook-widget-bootstrap");
  const fromScript = parseJson(node?.textContent ?? null) as BootstrapData | null;
  const query = new URLSearchParams(window.location.search);
  const queryPayload = parseJson(query.get("payload"));

  return (
    extractBookingPayload(fromScript?.payload) ??
    extractBookingPayload(queryPayload)
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

const formatAmount = (
  value: number | undefined,
  currencyDisplay: string | undefined,
  currencyCode: string | undefined
): string => {
  const numeric = Number(value ?? 0);
  const display = resolveCurrencyDisplay(currencyDisplay, currencyCode);
  const formatted = Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";
  if (isPrefixCurrencyDisplay(display)) return `${display}${formatted}`;
  return `${formatted} ${display}`;
};

const formatDateRange = (checkIn?: string, checkOut?: string): string => {
  if (!checkIn || !checkOut) return "—";
  try {
    const ci = new Date(checkIn + "T00:00:00");
    const co = new Date(checkOut + "T00:00:00");
    const ciStr = ci.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const coStr = co.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${ciStr} – ${coStr}`;
  } catch {
    return `${checkIn} – ${checkOut}`;
  }
};

const resolveImageSrc = (images?: string[]): string | null => {
  const first = images?.[0];
  if (!first) return null;
  if (
    first.startsWith("http://") ||
    first.startsWith("https://") ||
    first.startsWith("/") ||
    first.startsWith("data:image/")
  ) {
    return first;
  }
  return null;
};

const formatGuestsLabel = (guests?: number): string => {
  if (!guests || guests <= 0) return "2 guests";
  return `${guests} guest${guests !== 1 ? "s" : ""}`;
};

const formatSubtitle = (p: BookingPayload): string => {
  const parts: string[] = [];
  if (p.room_type) parts.push(p.room_type);
  if (p.bed_config) parts.push(p.bed_config);
  if (p.max_guests && p.max_guests > 0) parts.push(`Up to ${p.max_guests} guests`);
  return parts.join(" · ") || "Room";
};

type BookingCardProps = {
  payload: BookingPayload;
};

function BookingCard({ payload: p }: BookingCardProps) {
  const imageSrc = resolveImageSrc(p.room_images);
  const display = resolveCurrencyDisplay(p.currency_display, p.currency_code);
  const isConfirmed = p.status === "confirmed";
  const statusLabel = isConfirmed ? "Confirmed" : "Pending";
  const confirmationId = p.booking_id ? p.booking_id.slice(0, 8).toUpperCase() : "";

  return (
    <section className="booking-card" aria-label="Booking card">
      <div className="bc-media" role="img" aria-label={p.room_name ?? "Room photo"}>
        {imageSrc ? (
          <img className="bc-media__image" src={imageSrc} alt={p.room_name ?? "Room"} />
        ) : (
          <div
            className="bc-media__image bc-media__image--fallback"
            style={{ background: FALLBACK_GRADIENT }}
          />
        )}
        <div className="bc-media__overlay" />

        <div className="bc-media-top">
          <span className={`bc-badge ${isConfirmed ? "bc-badge--confirmed" : "bc-badge--pending"}`}>
            <span className="bc-badge__dot" />
            {statusLabel}
          </span>
        </div>

        <div className="bc-media-bottom">
          <div className="bc-price-pill" aria-label="Price per night">
            <span className="bc-price-pill__amount">
              {formatAmount(p.nightly_rate, p.currency_display, p.currency_code).replace(
                /\.00$/,
                ""
              )}
            </span>
            <span className="bc-price-pill__per">/ night</span>
          </div>
        </div>
      </div>

      <div className="bc-content">
        <div className="bc-title-row">
          <div>
            <h2 className="bc-title">{p.room_name || "Room"}</h2>
            {p.property_name && <p className="bc-sub">{p.property_name}</p>}
            <p className="bc-sub">{formatSubtitle(p)}</p>
          </div>
        </div>

        {p.amenities && p.amenities.length > 0 && (
          <div className="bc-meta">
            {p.amenities.slice(0, 5).map((a) => (
              <span className="bc-tag" key={a}>
                {a}
              </span>
            ))}
          </div>
        )}

        <div className="bc-rows" aria-label="Booking details">
          <div className="bc-row">
            <div className="bc-row__left">
              <div className="bc-row__label">Dates</div>
              <div className="bc-row__value">{formatDateRange(p.check_in, p.check_out)}</div>
            </div>
          </div>

          <div className="bc-row">
            <div className="bc-row__left">
              <div className="bc-row__label">Guests</div>
              <div className="bc-row__value">{formatGuestsLabel(p.guests)}</div>
            </div>
          </div>

          {confirmationId && (
            <div className="bc-row">
              <div className="bc-row__left">
                <div className="bc-row__label">Confirmation</div>
                <div className="bc-row__value">{confirmationId}</div>
              </div>
            </div>
          )}
        </div>

        <div className="bc-price-section" aria-label="Price breakdown">
          <h3 className="bc-price-section__heading">Price details</h3>

          <div className="bc-price-line">
            <span>
              {p.nights ?? 1} night{(p.nights ?? 1) !== 1 ? "s" : ""} ×{" "}
              {formatAmount(p.nightly_rate, p.currency_display, p.currency_code)}
            </span>
            <span>{formatAmount(p.subtotal, p.currency_display, p.currency_code)}</span>
          </div>

          <div className="bc-price-line">
            <span>Taxes</span>
            <span>{formatAmount(p.taxes, p.currency_display, p.currency_code)}</span>
          </div>

          <div className="bc-price-line">
            <span>Service fee</span>
            <span>{formatAmount(p.service_fee, p.currency_display, p.currency_code)}</span>
          </div>

          <div className="bc-total">
            <span className="bc-total__label">
              Total{" "}
              <span style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}>
                {display}
              </span>
            </span>
            <span className="bc-total__value">
              {formatAmount(p.total, p.currency_display, p.currency_code)}
            </span>
          </div>
        </div>
      </div>

      <div className="bc-actions">
        <button
          type="button"
          className={`bc-confirm ${isConfirmed ? "bc-confirm--done" : ""}`}
          disabled={isConfirmed}
        >
          {isConfirmed ? "Booking Confirmed" : "Confirm"}
        </button>
      </div>
    </section>
  );
}

export function BookingCardWidget() {
  const [initialPayload] = useState<BookingPayload | null>(() =>
    bootstrapPayloadFromScript()
  );
  const [payload, setPayload] = useState<BookingPayload | null>(initialPayload);
  const [loading, setLoading] = useState<boolean>(() => !initialPayload);

  const loadBridgePayload = useCallback(async (): Promise<BookingPayload | null> => {
    const bridge = window.openai as OpenAIBridge | undefined;
    if (!bridge) return null;

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

    for (const candidate of candidates) {
      const extracted = extractBookingPayload(candidate);
      if (extracted) return extracted;
    }
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
      if (attempts < MAX_BRIDGE_ATTEMPTS_FAST) {
        timeoutId = setTimeout(pollBridge, BRIDGE_POLL_INTERVAL_FAST);
      } else if (
        attempts <
        MAX_BRIDGE_ATTEMPTS_FAST + MAX_BRIDGE_ATTEMPTS_SLOW
      ) {
        timeoutId = setTimeout(pollBridge, BRIDGE_POLL_INTERVAL_SLOW);
      } else {
        setLoading(false);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (cancelled) return;
      const extracted = extractBookingPayload(event.data);
      if (!extracted) return;
      setPayload(extracted);
      setLoading(false);
    };

    window.addEventListener("message", onMessage);
    pollBridge();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
    };
  }, [loadBridgePayload, payload]);

  return (
    <main className="bc-wrap">
      {loading && (
        <div className="skeleton skeleton--booking-card" />
      )}

      {!loading && payload?.error && (
        <div className="widget-alert" role="alert">
          {payload.error}
        </div>
      )}

      {!loading && !payload?.error && payload && (
        <BookingCard payload={payload} />
      )}

      {!loading && !payload?.error && !payload && (
        <div className="widget-alert" role="alert">
          No booking data available.
        </div>
      )}
    </main>
  );
}
