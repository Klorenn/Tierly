import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ADMIN_OPEN_EVENT, getBridge } from "./lib/bridge";
import { App } from "./App";
import "./styles/admin.css";

// Punto de montaje de la isla. `#tierly-admin` ya existe en `tierly/index.html`
// (linea 1130) y lo sigue controlando la app vanilla; React solo toma ese div.
const bridge = getBridge();
const mount = document.querySelector<HTMLElement>("#tierly-admin");

if (bridge && mount) {
  // `app.js:1483` llama a `window.TierlyAdmin?.open?.()` al entrar a la vista.
  // Sin esto el panel queda con los datos del primer montaje.
  window.TierlyAdmin = { open: () => window.dispatchEvent(new Event(ADMIN_OPEN_EVENT)) };

  // `app.js` usa este atributo para saber que vista esta activa.
  mount.closest(".lb-view")?.setAttribute("data-view", "admin");

  const root = createRoot(mount);
  root.render(
    <StrictMode>
      <App bridge={bridge} />
    </StrictMode>,
  );
}
