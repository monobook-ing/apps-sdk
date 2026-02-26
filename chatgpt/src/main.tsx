import { createRoot } from "react-dom/client";

import { SearchRoomsWidgetV2 } from "./widget/SearchRoomsWidgetV2";
import { BookingCardWidget } from "./widget/BookingCardWidget";
import "./styles.css";

type BootstrapData = {
  widget?: string;
  payload?: unknown;
};

const parseBootstrap = (): BootstrapData | null => {
  const node = document.getElementById("monobook-widget-bootstrap");
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent) as BootstrapData;
  } catch {
    return null;
  }
};

const container =
  document.getElementById("monobook-widget-root") ?? document.getElementById("root");

if (container) {
  const bootstrap = parseBootstrap();
  const widgetType = bootstrap?.widget ?? "search_rooms";

  let widget: JSX.Element;
  switch (widgetType) {
    case "create_booking":
      widget = <BookingCardWidget />;
      break;
    case "search_rooms":
    case "search_hotels":
    case "check_availability":
    default:
      widget = <SearchRoomsWidgetV2 />;
      break;
  }

  createRoot(container).render(widget);
}
