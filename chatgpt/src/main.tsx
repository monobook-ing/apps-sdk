import { createRoot } from "react-dom/client";

import { SearchRoomsWidgetV2 } from "./widget/SearchRoomsWidgetV2";
import "./styles.css";

const container =
  document.getElementById("monobook-widget-root") ?? document.getElementById("root");

if (container) {
  createRoot(container).render(<SearchRoomsWidgetV2 />);
}
