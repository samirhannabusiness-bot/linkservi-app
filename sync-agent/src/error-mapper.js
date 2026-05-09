// Traduce errores técnicos del driver SQL Server, del fetch al backend de
// LinkServi y del filesystem a mensajes claros para usuarios no técnicos.
// La UI muestra siempre el mensaje "amigable" + el detalle técnico colapsado.

export function friendlyError(err) {
  if (!err) return { title: "Error desconocido", detail: "" };
  const raw = err?.message ?? String(err);
  const code = err?.code ?? err?.cause?.code ?? "";
  const causeMsg = err?.cause?.message ?? "";
  const text = `${raw} ${causeMsg}`.toLowerCase();

  // ── Red / DNS ──────────────────────────────────────────────────────────────
  if (code === "ENOTFOUND" || text.includes("getaddrinfo enotfound")) {
    return {
      title: "No se encuentra el servidor de la base de datos",
      detail:
        "Verifica que el campo \"host\" del config esté escrito correctamente y que tu computadora pueda alcanzar ese servidor por la red.",
      raw,
    };
  }
  if (code === "ECONNREFUSED" || text.includes("econnrefused")) {
    return {
      title: "El servidor rechazó la conexión",
      detail:
        "Verifica que SQL Server esté activo, que el puerto sea el correcto (por defecto 1433) y que el firewall lo permita.",
      raw,
    };
  }
  if (code === "ETIMEDOUT" || text.includes("etimedout") || text.includes("timeout")) {
    return {
      title: "El servidor tardó demasiado en responder",
      detail:
        "La base de datos no respondió a tiempo. Puede estar saturada o caída — reintenta en unos minutos.",
      raw,
    };
  }

  // ── Auth SQL Server ────────────────────────────────────────────────────────
  if (text.includes("login failed") || text.includes("login fail") || text.includes("password did not match")) {
    return {
      title: "Usuario o contraseña incorrectos",
      detail: "Las credenciales de SQL Server no son válidas. Verifica usuario y contraseña.",
      raw,
    };
  }
  if (text.includes("cannot open database") || text.includes("database does not exist")) {
    return {
      title: "La base de datos no existe",
      detail: "El nombre de base de datos no se encontró en este SQL Server. Verifica el campo \"database\".",
      raw,
    };
  }

  // ── Esquema / mapping ──────────────────────────────────────────────────────
  if (text.includes("invalid object name") || text.includes("could not find") || text.includes("no existe")) {
    return {
      title: "La tabla o columna no existe",
      detail:
        "El mapping apunta a una tabla o columna que no existe en SAINT. Revisa los campos \"mapping.table\" y los nombres de columna.",
      raw,
    };
  }
  if (text.includes("invalid column name")) {
    return {
      title: "Una columna del mapping no existe",
      detail: "Revisa los campos sku/name/price/stock del mapping — algún nombre no coincide con el esquema real.",
      raw,
    };
  }
  if (text.includes("identificador sql inválido")) {
    return {
      title: "Configuración con caracteres no permitidos",
      detail:
        "Los nombres de tabla y columna sólo pueden tener letras, números y _, y deben empezar por letra. Revisa el mapping.",
      raw,
    };
  }

  // ── Backend LinkServi ──────────────────────────────────────────────────────
  if (text.includes("http 401") || text.includes("api key inválida") || text.includes("falta header x-api-key")) {
    return {
      title: "API Key inválida o ausente",
      detail:
        "La API Key configurada no coincide con la del panel /integrations de LinkServi. Cópiala de nuevo desde el panel.",
      raw,
    };
  }
  if (text.includes("http 422")) {
    return {
      title: "El usuario aún no tiene tienda configurada",
      detail: "Crea o reclama tu tienda en LinkServi antes de sincronizar productos.",
      raw,
    };
  }
  if (text.includes("http 429") || text.includes("rate limit")) {
    return {
      title: "Demasiadas solicitudes — reduce la frecuencia",
      detail: "Estás sincronizando con mucha frecuencia. Espera unos segundos o aumenta el intervalo.",
      raw,
    };
  }
  if (text.includes("http 5") || text.includes("internal server")) {
    return {
      title: "El servidor de LinkServi tuvo un error",
      detail: "Hubo un problema en el servidor. Reintentaremos en el próximo ciclo.",
      raw,
    };
  }
  if (text.includes("fetch failed") || text.includes("network") || text.includes("enetunreach")) {
    return {
      title: "No hay conexión a LinkServi",
      detail: "Verifica tu conexión a internet y que apiUrl sea accesible.",
      raw,
    };
  }

  // ── Adapter no implementado ────────────────────────────────────────────────
  if (text.includes("firebird aún no implementado") || text.includes("no soportado")) {
    return {
      title: "Tipo de base de datos no soportado todavía",
      detail: "Esta versión soporta SQL Server. Firebird llegará en una próxima actualización.",
      raw,
    };
  }

  // ── Default ────────────────────────────────────────────────────────────────
  return {
    title: "Ocurrió un error",
    detail: raw || "Sin detalle técnico disponible.",
    raw,
  };
}
