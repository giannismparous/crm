import "./bootstrap";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GuestI18nProvider } from "./contexts/I18nContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GuestI18nProvider>
      <App />
    </GuestI18nProvider>
  </React.StrictMode>
);
