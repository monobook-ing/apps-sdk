import { createRoot } from "react-dom/client";

import { SearchRoomsWidget } from "./widget/SearchRoomsWidget";
import "./styles.css";

const container =
  document.getElementById("monobook-widget-root") ?? document.getElementById("root");

if (container) {
  createRoot(container).render(<SearchRoomsWidget />);
}
