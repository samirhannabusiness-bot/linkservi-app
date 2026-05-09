// Introspección de SQL Server para auto-onboarding (FASE 2).
//
// Helpers que el wizard de la UI usa para que el cliente NO tenga que escribir
// nombres de bases / tablas / columnas a mano. Cada helper crea un pool nuevo,
// hace la consulta y cierra el pool — son operaciones one-shot, no compiten
// con el pool persistente de saint-client.js usado por el sync productivo.
//
// IMPORTANTE: ninguno de estos helpers escribe en la DB del cliente. Sólo
// SELECT contra catálogos del sistema (sys.databases / INFORMATION_SCHEMA).

import mssql from "mssql";

// ── Connection helpers ───────────────────────────────────────────────────────

function buildPoolConfig({ host, port, user, password, database, options }) {
  if (!host) throw new Error("host requerido");
  if (typeof user !== "string") throw new Error("user requerido");
  return {
    server: String(host).trim(),
    port: port ? Number(port) : 1433,
    database: database ? String(database).trim() : "master",
    user: String(user).trim(),
    password: password == null ? "" : String(password),
    pool: { max: 1, min: 0, idleTimeoutMillis: 5_000 },
    options: {
      encrypt: options?.encrypt ?? false,
      trustServerCertificate: options?.trustServerCertificate ?? true,
      enableArithAbort: true,
    },
    requestTimeout: 15_000,
    connectionTimeout: 10_000,
  };
}

async function withPool(cfg, fn) {
  const pool = new mssql.ConnectionPool(cfg);
  // El listener evita que un error de pool tire el proceso entero del agente.
  pool.on("error", () => {});
  try {
    await pool.connect();
    return await fn(pool);
  } finally {
    try { await pool.close(); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// listDatabases — devuelve nombres de bases de USUARIO, ordenadas alfabéticamente.
// Excluye master/tempdb/model/msdb (database_id ≤ 4 en SQL Server).
// ─────────────────────────────────────────────────────────────────────────────
export async function listDatabases({ host, port, user, password, options } = {}) {
  const cfg = buildPoolConfig({ host, port, user, password, database: "master", options });
  return withPool(cfg, async (pool) => {
    const result = await pool.request().query(
      "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name",
    );
    const rows = result?.recordset ?? [];
    return rows.map((r) => String(r.name));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// listTables — devuelve "schema.tabla" para todas las BASE TABLE (no views) de
// la base elegida. Sugerimos la mejor candidata para "productos" si existe.
// ─────────────────────────────────────────────────────────────────────────────
const TABLE_HINT_PATTERNS = [
  /^productos?$/i,
  /^stocks?$/i,
  /^articulos?$/i,
  /^items?$/i,
  /producto/i,
  /articulo/i,
  /stock/i,
];

export async function listTables({ host, port, user, password, database, options } = {}) {
  if (!database) throw new Error("database requerido");
  const cfg = buildPoolConfig({ host, port, user, password, database, options });
  return withPool(cfg, async (pool) => {
    const result = await pool.request().query(
      `SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    );
    const rows = result?.recordset ?? [];
    const tables = rows.map((r) => ({
      schema: String(r.s),
      name: String(r.t),
      qualified: r.s && r.s !== "dbo" ? `${r.s}.${r.t}` : String(r.t),
    }));
    const suggested = pickSuggestedTable(tables);
    return { tables, suggested };
  });
}

export function pickSuggestedTable(tables) {
  if (!Array.isArray(tables) || tables.length === 0) return null;
  for (const pat of TABLE_HINT_PATTERNS) {
    const hit = tables.find((t) => pat.test(t.name));
    if (hit) return hit.qualified;
  }
  return tables[0].qualified;
}

// ─────────────────────────────────────────────────────────────────────────────
// inspectTable — columnas + sample de 5 filas.
// La consulta usa parámetros (sp_executesql) para nombre de tabla seguro,
// pero también validamos shape antes para defense-in-depth.
// ─────────────────────────────────────────────────────────────────────────────
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
function splitTable(qualified) {
  const parts = String(qualified).trim().split(".");
  if (parts.length > 2) throw new Error("tabla inválida (máx schema.tabla)");
  for (const p of parts) {
    if (!IDENT_RE.test(p)) throw new Error(`identificador inválido: "${p}"`);
  }
  if (parts.length === 1) return { schema: "dbo", name: parts[0] };
  return { schema: parts[0], name: parts[1] };
}

export async function inspectTable({ host, port, user, password, database, table, options } = {}) {
  if (!database) throw new Error("database requerido");
  if (!table) throw new Error("table requerido");
  const { schema, name } = splitTable(table);
  const cfg = buildPoolConfig({ host, port, user, password, database, options });
  return withPool(cfg, async (pool) => {
    // Columnas (con tipo, para que la UI pueda matizar el preview).
    const colsResult = await pool.request()
      .input("schema", mssql.NVarChar(128), schema)
      .input("name", mssql.NVarChar(128), name)
      .query(
        `SELECT COLUMN_NAME AS name, DATA_TYPE AS type
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @name
          ORDER BY ORDINAL_POSITION`,
      );
    const columns = (colsResult?.recordset ?? []).map((r) => ({
      name: String(r.name),
      type: String(r.type ?? "").toLowerCase(),
    }));
    if (columns.length === 0) {
      throw new Error(`la tabla "${table}" no existe o no tiene columnas accesibles`);
    }
    // Sample 5 filas con identificador validado (no parametrizable en T-SQL).
    const qSchema = `[${schema}]`;
    const qName = `[${name}]`;
    const sample = await pool.request().query(`SELECT TOP 5 * FROM ${qSchema}.${qName}`);
    const sampleRows = sample?.recordset ?? [];

    const suggestion = autoMapColumns(columns.map((c) => c.name));
    return { table, columns, suggestion, sample: sampleRows };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// autoMapColumns — heurística scoring para sugerir mapping {sku, name, price, stock}.
// Devuelve { mapping, confidence: { sku, name, price, stock }, candidates: { ... } }.
// confidence es 0..1 — la UI lo usa para mostrar "Detectamos tu estructura".
// ─────────────────────────────────────────────────────────────────────────────
// Los patrones cubren tanto el alfabeto SAINT clásico (codigo/descripcion/
// precio/existencia) como nomenclaturas reales que vemos en instalaciones:
// co_art, cod_art, des_art, precio1/precio2, exis/inv, etc. Cuando hay
// múltiples candidatos, gana el de score más alto y se reserva la columna
// para que otros campos no la repitan.
const PATTERNS = {
  sku: [
    { re: /^sku$/i, score: 100 },
    { re: /^codigo$/i, score: 95 },
    { re: /^cod_?prod(ucto)?$/i, score: 95 },
    { re: /^cod_?art(iculo)?$/i, score: 95 }, // SAINT: cod_art / codart
    { re: /^co_?art(iculo)?$/i, score: 92 },  // SAINT VAD: co_art
    { re: /^cod$/i, score: 80 },
    { re: /codigo/i, score: 70 },
    { re: /sku/i, score: 70 },
    { re: /^id_?prod(ucto)?$/i, score: 65 },
    { re: /^id_?art(iculo)?$/i, score: 65 },
    { re: /^id$/i, score: 30 },
    { re: /referenc/i, score: 60 },
    { re: /barcod|barras/i, score: 50 },      // ean/código de barras como fallback
  ],
  name: [
    { re: /^descripcion$/i, score: 100 },
    { re: /^nombre$/i, score: 100 },
    { re: /^name$/i, score: 95 },
    { re: /^des_?art(iculo)?$/i, score: 95 }, // SAINT: des_art
    { re: /^nom_?art(iculo)?$/i, score: 95 },
    { re: /descripcion/i, score: 85 },
    { re: /descrip/i, score: 80 },
    { re: /nombre/i, score: 80 },
    { re: /^titulo$/i, score: 70 },
    { re: /^denominacion$/i, score: 70 },
    { re: /^detalle$/i, score: 55 },
  ],
  price: [
    { re: /^precio$/i, score: 100 },
    { re: /^pvp$/i, score: 100 },
    { re: /^price$/i, score: 95 },
    { re: /^precio1$/i, score: 95 },          // SAINT: precio1 (lista A)
    { re: /^precio_?venta$/i, score: 90 },
    { re: /^precio_?a$/i, score: 88 },
    { re: /precio.*vent/i, score: 85 },
    { re: /^pvp1$/i, score: 85 },
    { re: /^precio[2-5]$/i, score: 75 },      // precio2..5 — listas alternativas
    { re: /precio/i, score: 70 },
    { re: /^valor$/i, score: 50 },
  ],
  stock: [
    { re: /^existencia$/i, score: 100 },
    { re: /^stock$/i, score: 100 },
    { re: /^cantidad$/i, score: 90 },
    { re: /^exis$/i, score: 90 },             // SAINT abreviado
    { re: /^inv$/i, score: 85 },              // SAINT VAD: inv
    { re: /existencia/i, score: 80 },
    { re: /^cant$/i, score: 70 },
    { re: /^qty$/i, score: 70 },
    { re: /stock/i, score: 70 },
    { re: /inventario/i, score: 60 },
    { re: /^disponible$/i, score: 55 },
  ],
};

const FALLBACK = { sku: "codigo", name: "descripcion", price: "precio", stock: "existencia" };

export function autoMapColumns(columnNames) {
  if (!Array.isArray(columnNames) || columnNames.length === 0) {
    return { mapping: { ...FALLBACK }, confidence: { sku: 0, name: 0, price: 0, stock: 0 }, candidates: { sku: [], name: [], price: [], stock: [] } };
  }
  const used = new Set(); // evita asignar la misma columna a dos campos.
  const mapping = {};
  const confidence = {};
  const candidates = {};

  // Primer pass: scoring por campo.
  // Procesamos en orden price→sku→name→stock para que columnas muy específicas
  // (precio1, descripcion) ganen su slot antes que matches genéricos (id).
  const order = ["price", "sku", "name", "stock"];
  for (const field of order) {
    const ranked = [];
    for (const col of columnNames) {
      let best = 0;
      for (const { re, score } of PATTERNS[field]) {
        if (re.test(col) && score > best) best = score;
      }
      if (best > 0) ranked.push({ col, score: best });
    }
    ranked.sort((a, b) => b.score - a.score);
    candidates[field] = ranked.slice(0, 5);

    const winner = ranked.find((r) => !used.has(r.col.toLowerCase()));
    if (winner) {
      mapping[field] = winner.col;
      confidence[field] = winner.score / 100;
      used.add(winner.col.toLowerCase());
    } else {
      mapping[field] = FALLBACK[field];
      confidence[field] = 0;
    }
  }

  return { mapping, confidence, candidates };
}
