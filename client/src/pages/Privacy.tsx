import { Link } from "wouter";
import BrandMark from "@/components/BrandMark";

const LAST_UPDATED = "August 4, 2026";
const CONTACT_EMAIL = "luis.barrionuevo0308@gmail.com";

export default function Privacy() {
  return (
    <main className="min-h-screen bg-rail p-4 py-10">
      <div className="w-full max-w-2xl mx-auto bg-card rounded-lg shadow-2xl p-8 fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-sm">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-content text-sm text-foreground space-y-5 leading-relaxed">
          <p>
            Coach Hub is operated by Luis Barrionuevo, an individual based in Spain (the
            "controller", "we", "us"). This policy explains what personal data we collect
            through the app, why, and what rights you have over it under the EU/Spanish
            data protection framework (GDPR and LOPDGDD).
          </p>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              1. Data we collect
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account data:</strong> the email address and password you sign up with. Passwords are hashed (bcrypt) before storage — we never store or can recover your plain-text password.</li>
              <li><strong>Team, player, and session data you enter:</strong> team names, player names/positions/status, training session details (date, time, duration, notes, exercises used), attendance records, and any custom exercises you create.</li>
              <li><strong>Billing data:</strong> if you subscribe to the paid plan, payment is processed by Stripe. We never see or store your card details — we only keep a Stripe customer/subscription ID to know which plan your account is on.</li>
              <li><strong>Technical data:</strong> a session cookie that keeps you logged in (deleted automatically after 30 days of inactivity), and server logs (e.g. IP address) used only for security purposes such as rate-limiting login attempts.</li>
            </ul>
            <p className="mt-2">
              We do not run any advertising or third-party analytics/tracking in the app.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              2. Why we process this data
            </h2>
            <p>
              Account, team, and billing data are processed to perform the contract with
              you (provide the service you signed up for, per GDPR Art. 6.1.b). Security
              logs (rate-limiting, abuse prevention) are processed under our legitimate
              interest (Art. 6.1.f). We do not use your data for marketing and do not sell
              it to third parties.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              3. Player data and minors
            </h2>
            <p>
              Coach Hub accounts are created and controlled by the coach, who must be an
              adult (18+). Players do not create accounts or log in themselves — the coach
              enters and manages their roster. Player rosters commonly include minors. If
              you enter data about players under 18, you are responsible for having a
              legitimate basis to do so (e.g. your role as coach/club and, where required,
              consent from a parent or guardian) and for keeping that data accurate and
              deleting it when it's no longer needed. Coach Hub does not direct the service
              at children and does not knowingly allow minors to register their own accounts.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              4. Who we share data with
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Stripe</strong> (payment processing) — only if you subscribe to the paid plan.</li>
              <li><strong>Render</strong> (application hosting and database infrastructure) — processes all data on our behalf to run the service.</li>
            </ul>
            <p className="mt-2">
              Both act as processors under our instructions; neither is authorized to use
              your data for their own purposes. We do not share your data with anyone else,
              and we don't sell it.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              5. International transfers
            </h2>
            <p>
              Stripe and Render may process data on infrastructure located outside the
              European Economic Area (primarily the United States). Where that happens,
              it relies on the safeguards each provider has in place (such as Standard
              Contractual Clauses) to ensure an adequate level of protection.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              6. How long we keep your data
            </h2>
            <p>
              We keep your data for as long as your account is active. If you ask us to
              delete your account, we will erase your account, team, player, session, and
              billing-reference data within 30 days, except where we're legally required
              to keep records for longer (e.g. tax obligations tied to payments).
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              7. Security
            </h2>
            <p>
              Passwords are hashed with bcrypt and never stored in plain text. All traffic
              between the app and our servers is encrypted (HTTPS). Access to production
              data is limited to what's needed to operate the service.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              8. Your rights
            </h2>
            <p>
              Under GDPR you can request access to, correction of, deletion of, or export
              of your data, and you can object to or ask us to limit certain processing.
              To exercise any of these rights, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-basketball-orange hover:underline">
                {CONTACT_EMAIL}
              </a>
              . You also have the right to lodge a complaint with the Spanish Data
              Protection Agency (
              <a href="https://www.aepd.es" target="_blank" rel="noreferrer" className="text-basketball-orange hover:underline">
                aepd.es
              </a>
              ).
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              9. Cookies
            </h2>
            <p>
              We only use one cookie: a technical session cookie required to keep you
              logged in. It's strictly necessary for the app to function, so it doesn't
              require consent under EU cookie rules. We don't use marketing, advertising,
              or third-party analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              10. Changes to this policy
            </h2>
            <p>
              If we make material changes to this policy, we'll update the "last updated"
              date above and, where the change is significant, notify you in the app.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              11. Contact
            </h2>
            <p>
              Questions about this policy or your data? Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-basketball-orange hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        <p className="text-center text-sm mt-8">
          <Link href="/" className="text-basketball-orange font-medium hover:underline">
            Back to Coach Hub
          </Link>
        </p>
      </div>
    </main>
  );
}
