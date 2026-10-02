export interface TableSkeletonProps {
  readonly rows?: number;
}

/**
 * Esqueleto de carga. `aria-hidden` + un `role="status"` aparte: anunciar 8 filas
 * falsas a un lector de pantalla es peor que no anunciar nada.
 */
export function TableSkeleton({ rows = 6 }: TableSkeletonProps) {
  return (
    <>
      <p className="tla-visually-hidden" role="status">
        Cargando datos…
      </p>
      <div className="tla-table-wrap" aria-hidden="true">
        <div style={{ display: "grid", gap: 1 }}>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="tla-skeleton tla-skeleton-row" />
          ))}
        </div>
      </div>
    </>
  );
}

export function StatSkeleton() {
  return (
    <div className="tla-grid" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="tla-stat">
          <div className="tla-skeleton" style={{ width: "40%", height: 28 }} />
          <div className="tla-skeleton tla-skeleton-text" style={{ width: "70%" }} />
        </div>
      ))}
    </div>
  );
}
