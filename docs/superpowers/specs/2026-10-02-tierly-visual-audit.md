# Auditoría visual TIRLY (público) — 2026-10-02

Referencia: `ejemplos/` (5 mockups Admin) + prod `tirly.xyz` + código `tierly/`.

## Veredicto

La home **puede** verse pro (hero de juegos + teal/sand), pero hoy peca de: (1) bug de boot que deja Home vacía, (2) demasiadas cards/glass, (3) ranking/perfil/settings todavía “dashboard viejo”, (4) contraste débil vs los ejemplos (hero oscuro + pills teal + tablas limpias).

## Hallazgos (por severidad)

### P0 — Bloqueantes

| # | Hallazgo | Evidencia | Fix |
|---|----------|-----------|-----|
| 1 | **Home en blanco** al cargar | `TierlyDiscover.open()` corre en `app.js` antes de que el módulo `discover.js` registre la API | Re-open al montar el módulo; reintentar si `#tierly-discover` está vacío |
| 2 | Selector `data-view=discover` ambiguo | Nav button y section comparten atributo; audits/scripts pueden enganchar el botón | Preferir `section.lb-view[data-view=…]` en código nuevo |

### P1 — Alejan de “pro” (vs ejemplos)

| # | Hallazgo | Vs ejemplos | Fix |
|---|----------|-------------|-----|
| 3 | **Glass en casi todas las cards** (`backdrop-filter`) | Ejemplos: cards sólidas blancas, un solo banner oscuro | Quitar glass de cards rutinarias; dejar blur solo en hero/overlay |
| 4 | **Pulse infinito** en badge live | Antislop R-19 / checklist motion | Pulse solo si hay filas live reales; respetar `prefers-reduced-motion` (ya global) |
| 5 | **Stats + spotlight pelean** | Ejemplos: KPI chicos → featured grande | Stats más compactos bajo el hero; menos sombra |
| 6 | **Contenido sin max-width** | Ultrawide estira tablas/grids | `.lb-main-inner { max-width: 1120px }` |
| 7 | **Ranking / Events / Profile** sin el lenguaje del hero | Mockups tienen header oscuro, pills, tablas con thumb | Unificar view-head + cards sólidas + tipografía Fraunces solo en títulos |
| 8 | **Sidebar promo** genérica | OK en ejemplos, pero ocupa alto en móvil | Compactar; en mobile colapsar |

### P2 — Pulido

| # | Hallazgo | Fix |
|---|----------|-----|
| 9 | Doble “card wrapping” (sección dentro de `.lb-disc-card` con sombra) | Spotlight fuera de card; secciones secundarias más planas |
| 10 | Footer Tellus + shell compiten visualmente | Más aire / borde superior sutil |
| 11 | Live vacío + top games: copy OK, layout aún “lista de cards iguales” | Mantener rail del spotlight; live más denso |
| 12 | Inter mezclado en caches viejas | Ya Source Sans 3 en `v=09+` |

## Aciertos a conservar

- Palette sand/teal/clay (marca Tellus/TIRLY), no purple-AI.
- Fraunces en display + Source Sans 3 en UI.
- Hero `#1 Más jugado` alineado con banners de `ejemplos/`.
- Eventos gated por `public_directory`; Tellus event con banner real.

## Prioridad de implementación

1. Fix boot Home (P0).
2. Sistema: max-width, menos glass, stats compactos, pulse condicional.
3. Unificar heads de Ranking/Events/Profile al mismo ritmo tipográfico.
4. (Luego) Admin React island alineado a mockups — fuera de este pase público.
