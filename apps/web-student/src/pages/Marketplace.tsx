// Marketplace landing page — collapses the four marketplace routes into
// a single hub surfaced from the sidebar.
//
// Each card links to the existing dedicated page; those routes are
// preserved so deep-links continue to work.

import { Link } from "react-router-dom";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface MarketplaceCard {
  title: string;
  body: string;
  href: string;
  cta: string;
}

const CARDS: MarketplaceCard[] = [
  {
    title: "Find a tutor",
    body: "Browse expert tutors by exam, subject, and price.",
    href: "/tutors",
    cta: "Browse tutors",
  },
  {
    title: "Courses",
    body: "Curated video + reading courses published by educators.",
    href: "/courses",
    cta: "Browse courses",
  },
  {
    title: "My bookings",
    body: "Upcoming + past tutor sessions you've booked.",
    href: "/bookings",
    cta: "View bookings",
  },
  {
    title: "My purchases",
    body: "Access courses you've enrolled in.",
    href: "/courses-mine",
    cta: "View purchases",
  },
];

export function Marketplace() {
  return (
    <VidyaShell
      crumbs="MARKETPLACE"
      title="Marketplace"
      subtitle="Tutors, courses, and your purchases"
    >
      <div className="vidya-grid-2">
        {CARDS.map((card) => (
          <section key={card.href} className="vidya-card-block">
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">{card.title}</h2>
            </div>
            <p style={{ color: "var(--ink-3)", fontSize: 14, margin: "0 0 var(--sp-4, 16px)" }}>
              {card.body}
            </p>
            <Link to={card.href} className="vidya-shell__chip">
              {card.cta} →
            </Link>
          </section>
        ))}
      </div>
    </VidyaShell>
  );
}
