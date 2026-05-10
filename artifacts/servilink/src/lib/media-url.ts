/**
 * Resuelve la URL final para un recurso de media (imagen, archivo) almacenado
 * en object storage. Tolera todas las variantes históricas que pueden venir
 * desde la base de datos:
 *
 *   - URL absoluta (http/https)         -> se devuelve tal cual
 *   - data: URI                          -> se devuelve tal cual
 *   - "/api/storage/objects/..."         -> ya tiene prefijo, se devuelve tal cual
 *   - "/objects/..."                     -> se prefija "/api/storage"
 *   - "uploads/..." o cualquier otro     -> se prefija "/api/storage/objects/"
 *
 * Devuelve `""` si la ruta es vacía/nula (el caller decide el fallback visual).
 *
 * El backend (image-pipeline) ya devuelve `/api/storage/objects/...`, así que
 * la mayoría de paths nuevos caen en el caso 3. Los casos 4 y 5 cubren registros
 * antiguos guardados antes de que el pipeline incluyera el prefijo.
 */
export function mediaSrc(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("data:")) return path;
  if (path.startsWith("/api/storage")) return path;
  if (path.startsWith("/objects/")) return `/api/storage${path}`;
  if (path.startsWith("/")) return `/api/storage${path}`;
  return `/api/storage/objects/${path}`;
}
