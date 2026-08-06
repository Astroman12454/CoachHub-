import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";

const LAST_UPDATED = "August 4, 2026";
const CONTACT_EMAIL = "luis.barrionuevo0308@gmail.com";

interface BulletItem {
  bold: string;
  text: string;
}

export default function Privacy() {
  const { t } = useTranslation();
  const dataWeCollectItems = t("privacy.sections.dataCollection.items", { returnObjects: true }) as BulletItem[];
  const shareItems = t("privacy.sections.sharing.items", { returnObjects: true }) as BulletItem[];

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
            {t("privacy.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("privacy.lastUpdated", { date: LAST_UPDATED })}</p>
        </div>

        <div className="prose-content text-sm text-foreground space-y-5 leading-relaxed">
          <p>{t("privacy.intro")}</p>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.dataCollection.heading")}
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              {dataWeCollectItems.map((item, i) => (
                <li key={i}><strong>{item.bold}</strong> {item.text}</li>
              ))}
            </ul>
            <p className="mt-2">
              {t("privacy.sections.dataCollection.noAds")}
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.whyWeProcess.heading")}
            </h2>
            <p>{t("privacy.sections.whyWeProcess.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.minors.heading")}
            </h2>
            <p>{t("privacy.sections.minors.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.sharing.heading")}
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              {shareItems.map((item, i) => (
                <li key={i}><strong>{item.bold}</strong> {item.text}</li>
              ))}
            </ul>
            <p className="mt-2">
              {t("privacy.sections.sharing.footer")}
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.transfers.heading")}
            </h2>
            <p>{t("privacy.sections.transfers.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.retention.heading")}
            </h2>
            <p>{t("privacy.sections.retention.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.security.heading")}
            </h2>
            <p>{t("privacy.sections.security.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.rights.heading")}
            </h2>
            <p>
              {t("privacy.sections.rights.bodyPrefix")}{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-basketball-orange hover:underline">
                {CONTACT_EMAIL}
              </a>
              {t("privacy.sections.rights.bodyMiddle")}
              <a href="https://www.aepd.es" target="_blank" rel="noreferrer" className="text-basketball-orange hover:underline">
                aepd.es
              </a>
              {t("privacy.sections.rights.bodySuffix")}
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.cookies.heading")}
            </h2>
            <p>{t("privacy.sections.cookies.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.changes.heading")}
            </h2>
            <p>{t("privacy.sections.changes.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("privacy.sections.contact.heading")}
            </h2>
            <p>
              {t("privacy.sections.contact.bodyPrefix")}{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-basketball-orange hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
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
