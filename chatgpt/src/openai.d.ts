export type SearchRoom = {
  id: string;
  property_id?: string;
  name: string;
  type?: string;
  description?: string;
  price_per_night?: string | number;
  currency_code?: string;
  currency_display?: string;
  estimated_total_price?: number;
  estimated_total_price_currency_code?: string;
  estimated_total_price_currency_display?: string;
  max_guests?: number;
  amenities?: string[];
  images?: string[];
};

export type SearchHotel = {
  property_id?: string;
  property_name?: string;
  min_price_per_night?: number;
  min_price_currency_code?: string;
  min_price_currency_display?: string;
  matching_rooms?: SearchRoom[];
};

export type SearchRoomsStructuredPayload = {
  property_id?: string;
  property_name?: string;
  rooms?: SearchRoom[];
  hotels?: SearchHotel[];
  count?: number;
  count_hotels?: number;
  count_rooms?: number;
  message?: string;
  error?: string;
};

export type BookingPayload = {
  booking_id?: string;
  status?: string;
  guest_name?: string;
  guests?: number;
  room_id?: string;
  room_name?: string;
  room_type?: string;
  room_description?: string;
  room_images?: string[];
  amenities?: string[];
  max_guests?: number;
  bed_config?: string;
  property_id?: string;
  property_name?: string;
  check_in?: string;
  check_out?: string;
  nights?: number;
  nightly_rate?: number;
  subtotal?: number;
  taxes?: number;
  service_fee?: number;
  total?: number;
  currency?: string;
  currency_code?: string;
  currency_display?: string;
  message?: string;
  error?: string;
};

export type OpenAIBridge = {
  callTool?: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  getInitialState?: () => Promise<unknown> | unknown;
  getState?: () => Promise<unknown> | unknown;
  getContext?: () => Promise<unknown> | unknown;
  getToolOutput?: () => Promise<unknown> | unknown;
  toolOutput?: unknown;
  output?: unknown;
  [key: string]: unknown;
};

declare global {
  interface Window {
    openai?: OpenAIBridge;
  }
}
