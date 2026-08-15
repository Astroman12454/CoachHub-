import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

export default function ThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-10 h-10 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
      aria-label={isDark ? t("common.switchToLightMode") : t("common.switchToDarkMode")}
      title={isDark ? t("common.switchToLightMode") : t("common.switchToDarkMode")}
    >
      {isDark ? <Sun className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /> : <Moon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
    </button>
  );
}
