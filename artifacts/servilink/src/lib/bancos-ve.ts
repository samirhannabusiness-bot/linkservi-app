export const BANCOS_VE = [
  { code: "0102", name: "Banco de Venezuela (BDV)" },
  { code: "0134", name: "Banesco" },
  { code: "0105", name: "Mercantil" },
  { code: "0108", name: "BBVA Provincial" },
  { code: "0114", name: "Bancaribe" },
  { code: "0115", name: "Banco Exterior" },
  { code: "0191", name: "Nacional de Crédito (BNC)" },
  { code: "0172", name: "Bancamiga" },
  { code: "0173", name: "Banplus" },
  { code: "0175", name: "Bicentenario" },
  { code: "0177", name: "BANFANB" },
  { code: "0163", name: "Banco del Tesoro" },
  { code: "0166", name: "Banco Agrícola" },
  { code: "0128", name: "Banco Caroní" },
  { code: "0151", name: "BFC" },
  { code: "0156", name: "100% Banco" },
  { code: "0157", name: "DelSur Banco" },
  { code: "0171", name: "Activo Bank" },
  { code: "0104", name: "Venezolano de Crédito" },
  { code: "0137", name: "Sofitasa" },
] as const;

export type BancoVE = (typeof BANCOS_VE)[number];
