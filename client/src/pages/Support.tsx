import { Link } from "wouter";
import BrandMark from "@/components/BrandMark";

const CONTACT_EMAIL = "luis.barrionuevo0308@gmail.com";

// Exists mainly so the App Store / Play Store listings have a real, working
// Support URL to point at (Apple rejects a bare mailto: link there).
export default function Support() {
  return (
    <main className="min-h-screen bg-rail p-4 py-10">
      <div className="w-full max-w-2xl mx-auto bg-card rounded-lg shadow-2xl p-8 fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 basketball-orange rounded-lg flex items-center justify-center mb-4">
            <BrandMark className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">
            Support
          </h1>
        </div>

        <div className="text-sm text-foreground space-y-5 leading-relaxed">
          <p>
            Need help with Coach Hub, found a bug, or have a question about your
            account or billing? Email us and we'll get back to you as soon as we
            can:
          </p>
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
              Common questions
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>How do I upgrade or cancel my plan?</strong> Open the
                sidebar in the app and tap your plan badge — that takes you to
                Stripe's checkout or billing portal, where you can upgrade,
                change payment details, or cancel anytime.
              </li>
              <li>
                <strong>How do I delete my account?</strong> Email us from the
                address on your account and we'll delete it, along with your
                team, player, and session data, within 30 days.
              </li>
              <li>
                <strong>What's included in the free plan?</strong> 1 team, up
                to 15 players, and the full built-in exercise library.
              </li>
            </ul>
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
