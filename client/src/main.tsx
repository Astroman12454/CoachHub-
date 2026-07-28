import { createRoot } from "react-dom/client";
import App from "./App";
// Only the solid style is used anywhere in the app (no "far"/"fab" icons),
// so importing just the base + solid stylesheet skips ~150KB of unused
// brands/regular CSS and font files that all.min.css would otherwise ship.
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
