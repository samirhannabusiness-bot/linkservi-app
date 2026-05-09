import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

export function ThemeToggle({ variant = "default" }: { variant?: "default" | "sidebar" | "ghost" }) {
  const { theme, toggleTheme } = useTheme();

  if (variant === "sidebar") {
    return (
      <button
        onClick={toggleTheme}
        className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium text-slate-400 hover:bg-sidebar-accent hover:text-white transition-all duration-150"
        title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        {theme === "dark" ? "Modo claro" : "Modo oscuro"}
      </button>
    );
  }

  if (variant === "ghost") {
    return (
      <button
        onClick={toggleTheme}
        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="w-9 h-9 rounded-xl flex items-center justify-center border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
