import { useEffect, useRef } from "react";

export interface IconProps {
  /** Nombre de Lucide, ej. "gamepad-2". */
  readonly name: string;
  readonly className?: string;
}

/**
 * Icono de Lucide usando el UMD que `tierly/index.html` ya carga (linea 1191).
 * No se agrega `lucide-react`: seria una SEGUNDA copia del set de iconos.
 *
 * `createIcons()` no decora el `<i>`: lo REEMPLAZA por un `<svg>`. Si ese `<i>`
 * lo hubiera renderizado React, en el render siguiente intentaria parchear un
 * nodo que ya fue removido del arbol. Por eso React solo controla el `<span>`
 * contenedor (sin hijos en el JSX) y el contenido lo escribimos nosotros.
 */
export function Icon({ name, className }: IconProps) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    node.replaceChildren();
    const placeholder = document.createElement("i");
    placeholder.dataset["lucide"] = name;
    node.appendChild(placeholder);
    window.lucide?.createIcons();
    return () => node.replaceChildren();
  }, [name]);

  return <span ref={host} className={className} aria-hidden="true" />;
}
