import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import BrandMark from "@/components/BrandMark";
import LanguageToggle from "@/components/LanguageToggle";

const LAST_UPDATED = "August 4, 2026";
const CONTACT_EMAIL = "luis.barrionuevo0308@gmail.com";

export default function Terms() {
  const { t } = useTranslation();
  const acceptableUseItems = t("terms.sections.acceptableUse.items", { returnObjects: true }) as string[];

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
            {t("terms.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("privacy.lastUpdated", { date: LAST_UPDATED })}</p>
        </div>

        <div className="prose-content text-sm text-foreground space-y-5 leading-relaxed">
          <p>{t("terms.intro")}</p>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.service.heading")}
            </h2>
            <p>{t("terms.sections.service.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.accounts.heading")}
            </h2>
            <p>{t("terms.sections.accounts.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.plans.heading")}
            </h2>
            <p>{t("terms.sections.plans.body")}</p>
            <p className="mt-2">{t("terms.sections.plans.bodyCancel")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.dataAboutOthers.heading")}
            </h2>
            <p>
              {t("terms.sections.dataAboutOthers.bodyPrefix")}{" "}
              <Link href="/privacy" className="text-basketball-orange hover:underline">
                {t("terms.sections.dataAboutOthers.privacyPolicyLink")}
              </Link>{" "}
              {t("terms.sections.dataAboutOthers.bodySuffix")}
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.acceptableUse.heading")}
            </h2>
            <p>{t("terms.sections.acceptableUse.intro")}</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              {acceptableUseItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.ip.heading")}
            </h2>
            <p>{t("terms.sections.ip.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.liability.heading")}
            </h2>
            <p>{t("terms.sections.liability.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.termination.heading")}
            </h2>
            <p>{t("terms.sections.termination.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.changes.heading")}
            </h2>
            <p>{t("terms.sections.changes.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.governingLaw.heading")}
            </h2>
            <p>{t("terms.sections.governingLaw.body")}</p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              {t("terms.sections.contact.heading")}
            </h2>
            <p>
              {t("terms.sections.contact.bodyPrefix")}{" "}
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
