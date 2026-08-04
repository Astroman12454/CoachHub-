import { Link } from "wouter";
import BrandMark from "@/components/BrandMark";

const LAST_UPDATED = "August 4, 2026";
const CONTACT_EMAIL = "luis.barrionuevo0308@gmail.com";

export default function Terms() {
  return (
    <main className="min-h-screen bg-rail p-4 py-10">
      <div className="w-full max-w-2xl mx-auto bg-card rounded-lg shadow-2xl p-8 fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">
            Terms of Use
          </h1>
          <p className="text-muted-foreground text-sm">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-content text-sm text-foreground space-y-5 leading-relaxed">
          <p>
            These terms govern your use of Coach Hub, operated by Luis Barrionuevo, an
            individual based in Spain ("we", "us"). By creating an account you agree to
            them. If you don't agree, don't use the app.
          </p>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              1. The service
            </h2>
            <p>
              Coach Hub helps amateur basketball coaches manage a team: rosters, training
              sessions, an exercise library, and attendance tracking.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              2. Accounts
            </h2>
            <p>
              You must be at least 18 years old to create an account — Coach Hub accounts
              are for coaches, not for the players themselves. You're responsible for
              keeping your login credentials secure and for all activity under your
              account. Let us know right away if you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              3. Plans and payment
            </h2>
            <p>
              The free plan is limited to 1 team, up to 15 players, and the built-in
              exercise library (no custom exercises). The paid plan removes those limits
              and lets you create custom exercises, billed monthly through Stripe.
            </p>
            <p className="mt-2">
              You can cancel anytime from the billing portal in the app; your paid plan
              stays active until the end of the period you already paid for. Except where
              the law gives you a right to a refund, payments already made are
              non-refundable.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              4. Data you enter about others
            </h2>
            <p>
              When you add players, sessions, or attendance records, you're entering data
              about real people — often minors. You're responsible for having a legitimate
              basis to enter that data (your role as coach or club, and any parental/
              guardian consent required in your context) and for keeping it accurate and
              up to date. See our{" "}
              <Link href="/privacy" className="text-basketball-orange hover:underline">
                Privacy Policy
              </Link>{" "}
              for how we handle it.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              5. Acceptable use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>Use the service for anything illegal or that infringes someone else's rights.</li>
              <li>Enter data about a person without a legitimate basis to do so.</li>
              <li>Attempt to bypass rate limits, access other accounts' data, or otherwise probe/attack the service's security.</li>
              <li>Resell or provide the service to third parties without our agreement.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              6. Intellectual property
            </h2>
            <p>
              The app, its design, and the built-in exercise library belong to us. You
              keep ownership of the team/player/session data you enter; you grant us the
              limited right to store and process it solely to provide the service to you.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              7. Availability and liability
            </h2>
            <p>
              We do our best to keep Coach Hub available and your data safe, but the
              service is provided "as is," without guaranteeing uninterrupted availability.
              To the maximum extent permitted by law, we're not liable for indirect
              damages or lost data resulting from outages, bugs, or third-party service
              failures (e.g. our hosting or payment provider). Nothing here limits
              liability where the law doesn't allow it to be limited, or affects the
              statutory rights you have as a consumer.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              8. Suspension and termination
            </h2>
            <p>
              You can stop using the service and delete your account at any time by
              emailing us. We may suspend or terminate accounts that violate these terms,
              with notice where reasonably possible.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              9. Changes to these terms
            </h2>
            <p>
              We may update these terms as the app evolves. We'll update the "last
              updated" date above, and if a change is material we'll let you know in the
              app.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              10. Governing law
            </h2>
            <p>
              These terms are governed by Spanish law. Any dispute will be submitted to
              the Spanish courts, without prejudice to any right you have as a consumer
              to bring a claim before the courts of your own place of residence under
              applicable consumer protection law.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold uppercase tracking-tight text-base mb-2">
              11. Contact
            </h2>
            <p>
              Questions about these terms? Email{" "}
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
