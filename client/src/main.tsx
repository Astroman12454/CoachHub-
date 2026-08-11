import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { initErrorMonitoring } from "./lib/monitoring";

initErrorMonitoring();

createRoot(document.getElementById("root")!).render(<App />);
