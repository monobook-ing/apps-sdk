export type SearchRoom = {
  id: string;
  property_id?: string;
  name: string;
  type?: string;
  description?: string;
  price_per_night?: string | number;
  max_guests?: number;
  amenities?: string[];
  images?: string[];
};

export type SearchRoomsStructuredPayload = {
  property_id?: string;
  property_name?: string;
  rooms?: SearchRoom[];
  count?: number;
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
