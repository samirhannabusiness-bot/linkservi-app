export interface VenezuelaState {
  name: string;
  cities: string[];
}

export const VENEZUELA_STATES: VenezuelaState[] = [
  {
    name: "Amazonas",
    cities: ["Puerto Ayacucho", "San Fernando de Atabapo", "San Juan de Manapiare"],
  },
  {
    name: "Anzoátegui",
    cities: ["Barcelona", "Puerto La Cruz", "El Tigre", "Anaco", "Guanta", "Lechería", "Cantaura", "Pariaguán"],
  },
  {
    name: "Apure",
    cities: ["San Fernando de Apure", "Guasdualito", "Biruaca", "Valle de La Pascua"],
  },
  {
    name: "Aragua",
    cities: ["Maracay", "La Victoria", "Cagua", "Villa de Cura", "Turmero", "El Limón", "Palo Negro", "Santa Rita"],
  },
  {
    name: "Barinas",
    cities: ["Barinas", "Barinitas", "Socopó", "Obispos", "Capitanejo"],
  },
  {
    name: "Bolívar",
    cities: ["Ciudad Bolívar", "Ciudad Guayana (Puerto Ordaz)", "Caicara del Orinoco", "Upata", "El Callao", "Santa Elena de Uairén", "Tumeremo"],
  },
  {
    name: "Carabobo",
    cities: ["Valencia", "Puerto Cabello", "Guacara", "San Diego", "Naguanagua", "Los Guayos", "Tocuyito", "Mariara"],
  },
  {
    name: "Cojedes",
    cities: ["San Carlos", "Tinaco", "El Baúl", "Tinaquillo"],
  },
  {
    name: "Delta Amacuro",
    cities: ["Tucupita", "Pedernales", "Curiapo"],
  },
  {
    name: "Distrito Capital",
    cities: ["Caracas", "El Valle", "La Vega", "Antímano", "Macarao"],
  },
  {
    name: "Falcón",
    cities: ["Coro", "Punto Fijo", "La Vela de Coro", "Chichiriviche", "Tucacas", "Santa Cruz de Bucaral"],
  },
  {
    name: "Guárico",
    cities: ["San Juan de los Morros", "Valle de La Pascua", "Calabozo", "Altagracia de Orituco", "El Sombrero", "Zaraza"],
  },
  {
    name: "La Guaira",
    cities: ["La Guaira", "Maiquetía", "Catia La Mar", "Naiguatá", "La Sabana"],
  },
  {
    name: "Lara",
    cities: ["Barquisimeto", "Carora", "Quíbor", "El Tocuyo", "Cabudare", "Duaca"],
  },
  {
    name: "Mérida",
    cities: ["Mérida", "El Vigía", "Ejido", "Tovar", "Valera", "Lagunillas"],
  },
  {
    name: "Miranda",
    cities: ["Los Teques", "Guarenas", "Guatire", "Ocumare del Tuy", "Santa Teresa del Tuy", "Charallave", "Cúa", "Caucagua", "Higuerote"],
  },
  {
    name: "Monagas",
    cities: ["Maturín", "Caripito", "Punta de Mata", "Temblador", "Barrancas del Orinoco"],
  },
  {
    name: "Nueva Esparta",
    cities: ["La Asunción", "Porlamar", "Pampatar", "Juan Griego", "El Valle del Espíritu Santo"],
  },
  {
    name: "Portuguesa",
    cities: ["Guanare", "Acarigua", "Araure", "Biscucuy", "Payara"],
  },
  {
    name: "Sucre",
    cities: ["Cumaná", "Carúpano", "Güiria", "Cariaco", "Casanay"],
  },
  {
    name: "Táchira",
    cities: ["San Cristóbal", "Táriba", "San Antonio del Táchira", "La Grita", "Rubio", "Santa Ana del Táchira"],
  },
  {
    name: "Trujillo",
    cities: ["Trujillo", "Valera", "Boconó", "Pampán", "Escuque"],
  },
  {
    name: "Yaracuy",
    cities: ["San Felipe", "Yaritagua", "Chivacoa", "Nirgua", "Urachiche"],
  },
  {
    name: "Zulia",
    cities: ["Maracaibo", "Cabimas", "Ciudad Ojeda", "San Francisco", "Lagunillas", "Machiques", "Punto Fijo", "Villa del Rosario", "Cumaná"],
  },
];

export function getCitiesForState(stateName: string): string[] {
  return VENEZUELA_STATES.find(s => s.name === stateName)?.cities ?? [];
}

export const STATE_NAMES = VENEZUELA_STATES.map(s => s.name);
