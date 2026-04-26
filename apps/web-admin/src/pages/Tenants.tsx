import { PhaseTwoStub } from "../components/PhaseTwoStub";

export function Tenants() {
  return (
    <PhaseTwoStub
      topbarTitle="Institutions"
      pillLabel="◈ INSTITUTIONS · B2B"
      heroTitle="Schools · coaching centres · billing"
      heroSubtitle={
        <>
          Per <code>docs/ui/03_AdminPortal/08_institutions.html</code> + the
          README — institutions are the B2B tenant model: each has billing
          contact, plan tier, seat count, and an institution-admin who can
          manage students + assignments. Per-tenant feature-flag overrides
          are already live; institution CRUD is the missing piece.
        </>
      }
      capabilities={[
        {
          icon: "🏛",
          title: "Browse 142+ institutions",
          body: "name · plan · seats · students · MRR",
        },
        {
          icon: "➕",
          title: "Create",
          body: "plan · seats · billing contact · admin assignment",
        },
        {
          icon: "💳",
          title: "Billing",
          body: "Stripe integration · subscription lifecycle",
        },
        {
          icon: "🚩",
          title: "Per-tenant flags",
          body: "already wired — see Feature flags",
        },
      ]}
      serviceNote="Backed by the institution-service. Schema covers name, plan, seats, billing contact, and primary admin. CRUD endpoints land alongside the Stripe Checkout integration in Phase 2."
      primaryCta={{ label: "Manage feature flags", to: "/flags" }}
    />
  );
}
