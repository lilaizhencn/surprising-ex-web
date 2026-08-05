import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

if (import.meta.env.DEV) {
  void import("react-grab");
  void import("react-scan");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
