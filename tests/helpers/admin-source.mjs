import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// El panel admin dejo de ser un archivo (`tierly/admin.js`) y paso a ser la isla
// React de `admin/`. Los tests que afirmaban "el source del admin contiene X"
// siguen siendo validos, pero ahora X puede estar en cualquiera de los modulos.
//
// Se concatena todo el arbol en vez de listar archivos a mano: si manana una
// seccion se parte en dos, el test no deberia romperse por eso. Lo que se
// verifica es el contrato del panel, no su reparticion en archivos.
function collect(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return collect(full);
      return /\.(ts|tsx|css)$/.test(entry) ? [readFileSync(full, "utf8")] : [];
    });
}

const root = fileURLToPath(new URL("../../admin", import.meta.url));

/** Todo el fuente de la isla admin concatenado, separado por archivo. */
export const adminSource = collect(root).join("\n\n");
