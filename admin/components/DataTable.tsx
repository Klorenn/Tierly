import { useId, useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  /** Lo que se pinta en la celda. */
  render(row: T): ReactNode;
  /**
   * Texto plano de la celda, para buscar y exportar. Obligatorio porque la
   * version vanilla sacaba el texto del DOM con `textContent` y eso exportaba
   * basura cuando la celda tenia iconos o imagenes.
   */
  text(row: T): string;
}

export interface DataTableProps<T> {
  readonly id: string;
  readonly columns: ReadonlyArray<Column<T>>;
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly caption: string;
  readonly searchable?: boolean;
  readonly emptyMessage?: string;
}

function toCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function DataTable<T>({
  id,
  columns,
  rows,
  rowKey,
  caption,
  searchable = true,
  emptyMessage = "No hay datos disponibles.",
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const searchId = useId();

  // Se filtra sobre los DATOS, no ocultando `<tr>` con `display:none` como hacia
  // la version vanilla. Asi el CSV exporta exactamente lo que se ve y los
  // lectores de pantalla no anuncian filas escondidas.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((column) => column.text(row).toLowerCase().includes(needle)),
    );
  }, [query, rows, columns]);

  function exportCsv(): void {
    const header = columns.map((column) => toCsvField(column.header));
    const body = visible.map((row) => columns.map((column) => toCsvField(column.text(row))));
    const csv = [header, ...body].map((line) => line.join(",")).join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tirly-admin-${id}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    URL.revokeObjectURL(url);
    anchor.remove();
  }

  if (!rows.length) {
    return (
      <p className="tla-empty" role="status">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="tla-table-block">
      <div className="tla-table-tools">
        {searchable && (
          <label className="tla-search" htmlFor={searchId}>
            <span className="tla-visually-hidden">Buscar en {caption}</span>
            <input
              id={searchId}
              type="search"
              value={query}
              placeholder="Buscar…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}
        <button type="button" className="tla-btn tla-btn-ghost" onClick={exportCsv}>
          Exportar CSV
        </button>
      </div>

      <div className="tla-table-wrap">
        <table className="tla-table" id={id}>
          <caption className="tla-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!visible.length && (
        <p className="tla-empty" role="status">
          Ningún resultado para “{query}”.
        </p>
      )}
    </div>
  );
}
