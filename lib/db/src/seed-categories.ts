import { db, categoriesTable } from "./index";
import { sql } from "drizzle-orm";

const CATEGORIES = [
  { name: "Plomería", description: "Instalación y reparación de tuberías, grifos y sistemas de agua", icon: "🔧", color: "#3B82F6" },
  { name: "Electricidad", description: "Instalaciones eléctricas, cableado y reparaciones eléctricas", icon: "⚡", color: "#F59E0B" },
  { name: "Carpintería", description: "Fabricación y reparación de muebles, puertas y estructuras en madera", icon: "🪵", color: "#92400E" },
  { name: "Pintura", description: "Pintura interior y exterior de viviendas y locales comerciales", icon: "🎨", color: "#8B5CF6" },
  { name: "Albañilería", description: "Construcción, remodelación y reparación de obras civiles", icon: "🏗️", color: "#6B7280" },
  { name: "Aire Acondicionado", description: "Instalación, mantenimiento y reparación de equipos de A/C", icon: "❄️", color: "#06B6D4" },
  { name: "Cerrajería", description: "Apertura, cambio y reparación de cerraduras y sistemas de seguridad", icon: "🔑", color: "#D97706" },
  { name: "Jardinería", description: "Diseño, mantenimiento y cuidado de jardines y áreas verdes", icon: "🌿", color: "#10B981" },
  { name: "Limpieza del Hogar", description: "Limpieza profunda y mantenimiento de hogares y apartamentos", icon: "🧹", color: "#EC4899" },
  { name: "Mudanzas", description: "Transporte y traslado de muebles y enseres en Caracas y estado Miranda", icon: "🚛", color: "#EF4444" },
  { name: "Cuidado de Personas Mayores", description: "Acompañamiento, cuidado y asistencia a adultos mayores en casa", icon: "👴", color: "#F97316" },
  { name: "Cuidado de Niños", description: "Niñeras, guarderías en casa y actividades recreativas para niños", icon: "👶", color: "#FB923C" },
  { name: "Cuidado de Mascotas", description: "Paseo, baño y cuidado de mascotas a domicilio", icon: "🐾", color: "#84CC16" },
  { name: "Clases Particulares", description: "Tutorías y refuerzo académico para bachillerato y universidad", icon: "📚", color: "#6366F1" },
  { name: "Clases de Idiomas", description: "Inglés, francés, italiano y otros idiomas a domicilio", icon: "🗣️", color: "#0EA5E9" },
  { name: "Reparación de Electrodomésticos", description: "Reparación de lavadoras, neveras, microondas y más", icon: "🛠️", color: "#475569" },
  { name: "Tecnología y Computación", description: "Soporte técnico, reparación de PC y laptops, instalación de redes", icon: "💻", color: "#1D4ED8" },
  { name: "Diseño y Fotografía", description: "Fotografía de eventos, diseño gráfico y edición de fotos", icon: "📷", color: "#DB2777" },
  { name: "Chef a Domicilio", description: "Preparación de comidas, catering y eventos gastronómicos en casa", icon: "👨‍🍳", color: "#DC2626" },
  { name: "Lavado de Vehículos", description: "Lavado, encerado y detailing de carros a domicilio", icon: "🚗", color: "#1E40AF" },
  { name: "Mecánica Automotriz", description: "Mantenimiento preventivo y reparaciones mecánicas a domicilio", icon: "🔩", color: "#374151" },
  { name: "Belleza y Estética", description: "Cortes de cabello, manicure, pedicure y maquillaje a domicilio", icon: "💅", color: "#F472B6" },
  { name: "Mensajería y Delivery", description: "Mandados, compras y entregas rápidas en moto por la ciudad", icon: "📦", color: "#F59E0B" },
  { name: "Soldadura y Herrería", description: "Trabajos de soldadura, rejas, portones y estructuras metálicas", icon: "🔥", color: "#7C3AED" },
  { name: "Medicina General", description: "Consultas médicas a domicilio, diagnósticos y atención primaria de salud", icon: "🩺", color: "#10B981" },
  { name: "Pediatría", description: "Atención médica especializada para bebés, niños y adolescentes", icon: "👶🏻", color: "#34D399" },
  { name: "Cardiología", description: "Consultas cardiológicas, evaluación y seguimiento de salud cardiovascular", icon: "❤️", color: "#EF4444" },
  { name: "Veterinaria", description: "Atención veterinaria a domicilio para mascotas: consultas, vacunas y tratamientos", icon: "🐶", color: "#F97316" },
  { name: "Técnico de Televisores", description: "Reparación y mantenimiento de televisores, pantallas y equipos audiovisuales", icon: "📺", color: "#6366F1" },
  { name: "Mecánico de Motos", description: "Mantenimiento, revisión y reparación de motocicletas a domicilio", icon: "🏍️", color: "#78716C" },
  { name: "Abogacía", description: "Asesoría legal, consultas jurídicas y redacción de documentos legales", icon: "⚖️", color: "#1D4ED8" },
  { name: "Diseño Gráfico", description: "Creación de logos, material publicitario, identidad visual y artes digitales", icon: "🎨", color: "#A855F7" },
  { name: "Creador de Contenido Digital", description: "Influencers, creación de contenido para redes sociales, fotografía y video para marcas", icon: "📱", color: "#E1306C" },
  { name: "Cantante para Eventos", description: "Cantantes solistas para bodas, cumpleaños, fiestas corporativas y celebraciones", icon: "🎤", color: "#8B5CF6" },
  { name: "Mariachis y Serenatas", description: "Mariachis, tríos y serenatas para toda ocasión a domicilio", icon: "🎺", color: "#DC2626" },
  { name: "Grupo Musical y Bandas", description: "Bandas en vivo, conjuntos musicales y orquestas para eventos y fiestas", icon: "🎸", color: "#7C3AED" },
  { name: "Animación Infantil y Payasos", description: "Payasos, magos y animadores para fiestas y cumpleaños infantiles", icon: "🤡", color: "#F59E0B" },
  { name: "DJ y Sonido para Eventos", description: "DJ profesional, equipos de sonido e iluminación para fiestas y eventos", icon: "🎧", color: "#06B6D4" },
  { name: "Alquiler para Fiestas y Eventos", description: "Alquiler de sillas, mesas, carpas, brincolines y artículos para celebraciones", icon: "🎪", color: "#10B981" },
  { name: "Decoración de Eventos", description: "Decoración temática, arreglos florales y ambientación para bodas, cumpleaños y eventos", icon: "🎊", color: "#EC4899" },
  { name: "Bartender y Coctelería", description: "Bartenders profesionales, coctelería y servicio de barra para eventos y fiestas", icon: "🍹", color: "#0EA5E9" },
  { name: "Magia e Ilusionismo", description: "Shows de magia, ilusionismo y mentalismo para fiestas, eventos corporativos y cumpleaños", icon: "🪄", color: "#6366F1" },
];

async function seed() {
  console.log("🌱 Seeding categories...");
  for (const cat of CATEGORIES) {
    try {
      await db.execute(sql`
        INSERT INTO categories (name, description, icon, color)
        VALUES (${cat.name}, ${cat.description}, ${cat.icon}, ${cat.color})
        ON CONFLICT (name) DO NOTHING
      `);
      console.log(`  ✅ ${cat.name}`);
    } catch (e: any) {
      console.log(`  ⚠️  ${cat.name}: ${e.message}`);
    }
  }
  console.log("✨ Categories seed complete!");
  process.exit(0);
}

seed();
