import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";

const CONTACT_EMAIL = "luis.barrionuevo0308@gmail.com";

interface FaqItem {
  bold: string;
  text: string;
}

// Exists mainly so the App Store / Play Store listings have a real, working
// Support URL to point at (Apple rejects a bare mailto: link there).
export default function Support() {
  const { t } = useTranslation();
  const faqItems = t("support.faqItems", { returnObjects: true }) as FaqItem[];

  return (
    <main className="min-h-screen bg-rail p-4 py-10 relative">
      <div className="absolute top-4 right-4 text-foreground">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-2xl mx-auto bg-card rounded-lg shadow-2xl p-8 fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">
            {t("support.title")}
          </h1>
        </div>

        <div className="text-sm text-foreground space-y-5 leading-relaxed">
          <p>{t("support.intro")}</p>
          <p className="text-center">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-lg font-medium text-basketball-orange hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </p>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("support.commonQuestions")}
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              {faqItems.map((item, i) => (
                <li key={i}><strong>{item.bold}</strong> {item.text}</li>
              ))}
            </ul>
          </section>
        </div>

        <p className="text-center text-sm mt-8">
          <Link href="/" className="text-basketball-orange font-medium hover:underline">
            {t("privacy.backToCoachHub")}
          </Link>
        </p>
      </div>
    </main>
  );
}
