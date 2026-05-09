// LinkServi Sync Agent — conector real a SAINT.
//
// Adapter pattern: cada motor (sqlserver / firebird / mock) implementa la misma
// interfaz {connect, readCatalog, disconnect}. El agente se mantiene agnóstico
// del motor y del esquema concreto del cliente, gracias a `mapping` en config:
//
//   db:      { type, host, port, user, password, database, options }
//   mapping: { table, sku, name, price, stock }
//
// La query se construye dinámicamente desde `mapping` (no hardcodea columnas),
// por lo que el agente se adapta a cualquier instalación SAINT del cliente sin
// modificar código.

import mssql from "mssql";

// ── Validación de identificadores SQL ─────────────────────────────────────────
// Para construir SELECT con nombres de tabla/columna del config sin riesgo de
// inyección, exigimos identificadores tipo [A-Za-z_][A-Za-z0-9_]{0,127}.
// Si el cliente necesita tablas con esquema (ej: "dbo.Productos"), permitimos
// un único punto separador. Los nombres se quotean con [brackets] (T-SQL).
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
function quoteIdent(name) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("identificador SQL vacío");
  }
  const parts = name.trim().split(".");
  if (parts.length > 2) {
    throw new Error(`identificador SQL inválido: "${name}" (máximo schema.tabla)`);
  }
  for (const p of parts) {
    if (!IDENT_RE.test(p)) {
      throw new Error(
        `identificador SQL inválido: "${p}" (sólo A-Z, a-z, 0-9 y _; debe empezar por letra o _)`,
      );
    }
  }
  return parts.map((p) => `[${p}]`).join(".");
}

// ── Mapping con defaults sensatos ─────────────────────────────────────────────
const DEFAULT_MAPPING = {
  table: "productos",
  sku: "codigo",
  name: "descripcion",
  price: "precio",
  stock: "existencia",
};

function resolveMapping(mapping) {
  const m = { ...DEFAULT_MAPPING, ...(mapping ?? {}) };
  for (const k of ["table", "sku", "name", "price", "stock"]) {
    if (typeof m[k] !== "string" || !m[k].trim()) {
      throw new Error(`mapping.${k} requerido (string no vacío)`);
    }
  }
  return m;
}

// ── Normalización de filas a {sku, name, price, stock} ────────────────────────
// Se asume que el recordset YA viene con claves estándar (`sku`, `name`,
// `price`, `stock`). El SQL adapter aliasa explícitamente las columnas del
// mapping a esos nombres en la query, por lo que el resto del agente trabaja
// siempre con el formato canonical, independientemente del esquema del cliente.
function normalizeRow(row) {
  const skuRaw = row?.sku;
  const nameRaw = row?.name;
  const priceRaw = row?.price;
  const stockRaw = row?.stock;

  const sku = skuRaw == null ? "" : String(skuRaw).trim();
  const name = nameRaw == null ? "" : String(nameRaw).trim();
  const price = priceRaw == null ? NaN : Number(priceRaw);
  const stock = stockRaw == null ? 0 : Math.trunc(Number(stockRaw));

  return { sku, name, price, stock };
}

function isValidNormalized(p) {
  return (
    p.sku.length > 0 &&
    p.name.length > 0 &&
    Number.isFinite(p.price) &&
    p.price >= 0 &&
    Number.isFinite(p.stock) &&
    p.stock >= 0
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter: SQL Server (motor principal SAINT). Pool persistente con reconexión
// automática tras error.
// ─────────────────────────────────────────────────────────────────────────────
function createSqlServerAdapter(db, mappingCfg, logger) {
  const m = resolveMapping(mappingCfg);

  if (!db?.host) throw new Error("db.host requerido para sqlserver");
  if (!db?.database) throw new Error("db.database requerido para sqlserver");
  if (typeof db?.user !== "string") throw new Error("db.user requerido para sqlserver");

  const poolConfig = {
    server: String(db.host).trim(),
    port: db.port ? Number(db.port) : 1433,
    database: String(db.database).trim(),
    user: String(db.user).trim(),
    password: db.password == null ? "" : String(db.password),
    pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
    options: {
      encrypt: db.options?.encrypt ?? false,
      trustServerCertificate: db.options?.trustServerCertificate ?? true,
      enableArithAbort: true,
      ...(db.options?.instanceName ? { instanceName: db.options.instanceName } : {}),
    },
    requestTimeout: 30_000,
    connectionTimeout: 15_000,
  };

  // Pre-quoteo identificadores (valida shape y previene inyección).
  const qTable = quoteIdent(m.table);
  const qSku = quoteIdent(m.sku);
  const qName = quoteIdent(m.name);
  const qPrice = quoteIdent(m.price);
  const qStock = quoteIdent(m.stock);
  // Aliases fijos del lado de aplicación → mapping no afecta el normalize.
  const sqlQuery =
    `SELECT ${qSku} AS sku, ${qName} AS name, ${qPrice} AS price, ${qStock} AS stock FROM ${qTable}`;

  let pool = null;

  async function connect() {
    if (pool && pool.connected) return;
    logger.info("conectando a SAINT (SQL Server)", {
      host: poolConfig.server,
      port: poolConfig.port,
      database: poolConfig.database,
      user: poolConfig.user,
    });
    try {
      pool = new mssql.ConnectionPool(poolConfig);
      pool.on("error", (err) => {
        logger.warn("pool SQL Server emitió error", { message: err?.message });
      });
      await pool.connect();
      logger.info("✔ conexión a SAINT establecida", {
        database: poolConfig.database,
        query: sqlQuery,
      });
    } catch (err) {
      pool = null;
      const e = new Error(
        `no se pudo conectar a SAINT (SQL Server) en ${poolConfig.server}:${poolConfig.port}/${poolConfig.database} — ${err?.message ?? "error desconocido"}`,
      );
      e.cause = err;
      throw e;
    }
  }

  async function readCatalog() {
    if (!pool || !pool.connected) {
      await connect();
    }
    let result;
    try {
      result = await pool.request().query(sqlQuery);
    } catch (err) {
      // Marcamos pool como muerto para reconectar al siguiente ciclo.
      try { await pool.close(); } catch { /* ignore */ }
      pool = null;
      const e = new Error(`fallo ejecutando query SAINT: ${err?.message ?? "error desconocido"}`);
      e.cause = err;
      throw e;
    }
    const rows = result?.recordset ?? [];
    const total = rows.length;
    const normalized = [];
    let skipped = 0;
    for (const row of rows) {
      // El recordset trae claves canonical (sku/name/price/stock) gracias a los
      // aliases en la query — `mapping` afecta sólo a la construcción del SQL.
      const p = normalizeRow(row);
      if (!isValidNormalized(p)) {
        skipped++;
        continue;
      }
      normalized.push(p);
    }
    logger.info(`✔ leídos ${total} productos desde SAINT`, {
      total,
      válidos: normalized.length,
      descartados: skipped,
    });
    return normalized;
  }

  async function disconnect() {
    if (!pool) return;
    try {
      await pool.close();
      logger.info("conexión a SAINT cerrada");
    } catch (err) {
      logger.warn("error cerrando pool SQL Server", { message: err?.message });
    } finally {
      pool = null;
    }
  }

  return { type: "sqlserver", connect, readCatalog, disconnect, query: sqlQuery };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter: Firebird (preparado, no implementado todavía).
// La interfaz queda lista para que se conecte un driver real (node-firebird)
// sin tocar el resto del agente.
// ─────────────────────────────────────────────────────────────────────────────
function createFirebirdAdapter(_db, _mappingCfg, logger) {
  return {
    type: "firebird",
    async connect() {
      logger.error("Adapter Firebird aún no está implementado en esta versión");
      throw new Error(
        "db.type='firebird' aún no implementado. Roadmap: integrar node-firebird usando el mismo `mapping` que sqlserver.",
      );
    },
    async readCatalog() {
      throw new Error("Adapter Firebird no disponible");
    },
    async disconnect() {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter: Mock (dev / smoke test). Dataset embebido — útil para verificar el
// pipeline completo sin requerir una instancia SAINT real. NO documentado como
// modo de producción.
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_SEED = [
  { sku: "SAINT-0001", name: "Harina P.A.N. blanca 1kg", basePrice: 1.85, stock: 480 },
  { sku: "SAINT-0002", name: "Harina P.A.N. amarilla 1kg", basePrice: 1.95, stock: 320 },
  { sku: "SAINT-0003", name: "Aceite Mazeite 1L", basePrice: 3.4, stock: 210 },
  { sku: "SAINT-0004", name: "Arroz Mary 1kg", basePrice: 2.2, stock: 540 },
  { sku: "SAINT-0005", name: "Azúcar Santa Bárbara 1kg", basePrice: 1.6, stock: 600 },
  { sku: "SAINT-0006", name: "Café Madrid molido 250g", basePrice: 3.1, stock: 180 },
  { sku: "SAINT-0007", name: "Mantequilla Mavesa 200g", basePrice: 2.8, stock: 95 },
  { sku: "SAINT-0008", name: "Leche Los Andes 1L UHT", basePrice: 2.4, stock: 240 },
  { sku: "SAINT-0009", name: "Pasta Primor 500g", basePrice: 1.5, stock: 390 },
  { sku: "SAINT-0010", name: "Atún Margarita lata 140g", basePrice: 2.05, stock: 260 },
  { sku: "SAINT-0011", name: "Sal La Llave 1kg", basePrice: 0.95, stock: 480 },
  { sku: "SAINT-0012", name: "Salsa de tomate Pampero 397g", basePrice: 1.75, stock: 220 },
  { sku: "SAINT-0013", name: "Mayonesa Mavesa 445g", basePrice: 3.2, stock: 140 },
  { sku: "SAINT-0014", name: "Queso amarillo lonjas 200g", basePrice: 4.5, stock: 70 },
  { sku: "SAINT-0015", name: "Pan canilla unidad", basePrice: 0.8, stock: 120 },
  { sku: "SAINT-0016", name: "Huevos cartón x30", basePrice: 5.2, stock: 88 },
  { sku: "SAINT-0017", name: "Pollo entero kg", basePrice: 4.9, stock: 140 },
  { sku: "SAINT-0018", name: "Carne molida kg", basePrice: 6.4, stock: 95 },
  { sku: "SAINT-0019", name: "Jabón Las Llaves x3 barras", basePrice: 2.1, stock: 320 },
  { sku: "SAINT-0020", name: "Detergente Ariel 1kg", basePrice: 4.8, stock: 210 },
  { sku: "SAINT-0021", name: "Papel higiénico Rosal x4", basePrice: 3.6, stock: 280 },
  { sku: "SAINT-0022", name: "Crema dental Colgate 100g", basePrice: 2.45, stock: 175 },
  { sku: "SAINT-0023", name: "Shampoo Pantene 400ml", basePrice: 6.3, stock: 110 },
  { sku: "SAINT-0024", name: "Cloro Las Llaves 1L", basePrice: 1.4, stock: 240 },
  { sku: "SAINT-0025", name: "Refresco Pepsi 2L", basePrice: 2.0, stock: 360 },
  { sku: "SAINT-0026", name: "Cerveza Polar lata 295ml", basePrice: 1.1, stock: 720 },
  { sku: "SAINT-0027", name: "Agua mineral Minalba 5L", basePrice: 2.8, stock: 140 },
  { sku: "SAINT-0028", name: "Galletas María 200g", basePrice: 1.2, stock: 410 },
  { sku: "SAINT-0029", name: "Chocolate Savoy 200g", basePrice: 3.9, stock: 130 },
  { sku: "SAINT-0030", name: "Avena Quaker 400g", basePrice: 2.6, stock: 200 },
];

function createMockAdapter(_db, _mappingCfg, logger) {
  const state = new Map();
  for (const p of MOCK_SEED) state.set(p.sku, { ...p, lastPrice: p.basePrice });

  async function connect() {
    logger.info("✔ adapter MOCK listo (dataset embebido — sólo dev)", {
      productos: state.size,
    });
  }
  async function readCatalog() {
    const out = [];
    for (const [sku, st] of state) {
      // Drift suave para verificar updates en e2e.
      if (Math.random() < 0.15) {
        const delta = (Math.random() - 0.5) * 0.06;
        st.lastPrice = Math.max(0.1, +(st.lastPrice * (1 + delta)).toFixed(2));
      }
      const stockDelta = Math.floor((Math.random() - 0.5) * 8);
      st.stock = Math.max(0, st.stock + stockDelta);
      out.push({ sku, name: st.name, price: st.lastPrice, stock: st.stock });
    }
    logger.info(`✔ leídos ${out.length} productos (mock)`, { total: out.length });
    return out;
  }
  async function disconnect() {
    /* no-op */
  }
  return { type: "mock", connect, readCatalog, disconnect };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory público.
// ─────────────────────────────────────────────────────────────────────────────
export function createSaintClient(dbConfig, mappingConfig, logger) {
  const type = (dbConfig?.type ?? "sqlserver").toLowerCase();
  switch (type) {
    case "sqlserver":
    case "mssql":
      return createSqlServerAdapter(dbConfig, mappingConfig, logger);
    case "firebird":
      return createFirebirdAdapter(dbConfig, mappingConfig, logger);
    case "mock":
      return createMockAdapter(dbConfig, mappingConfig, logger);
    default:
      throw new Error(
        `db.type="${dbConfig?.type}" no soportado. Usa "sqlserver" o "firebird".`,
      );
  }
}

// Exportamos los helpers para tests / diagnóstico.
export { quoteIdent, normalizeRow, isValidNormalized, resolveMapping };
