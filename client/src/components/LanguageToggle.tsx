import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

export default function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const isSpanish = i18n.resolvedLanguage === "es";

  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(isSpanish ? "en" : "es")}
      className="w-10 h-10 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0 relative"
      aria-label={isSpanish ? t("common.switchToEnglish") : t("common.switchToSpanish")}
      title={isSpanish ? t("common.switchToEnglish") : t("common.switchToSpanish")}
    >
      <Languages className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
      <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold uppercase bg-basketball-orange text-white rounded px-0.5 leading-tight">
        {isSpanish ? "ES" : "EN"}
      </span>
    </button>
  );
}
