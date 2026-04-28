import { PhaseTwoStub } from "../components/PhaseTwoStub";

export function Users() {
  return (
    <PhaseTwoStub
      topbarTitle="Users"
      pillLabel="◈ ADMIN USER MANAGEMENT"
      heroTitle="Search · suspend · ban · impersonate"
      heroSubtitle={
        <>
          Per <code>docs/ui/03_AdminPortal/02_users.html</code> + the README's
          security spec — every user-management action requires a written
          reason and writes an audit row before the side-effect runs. The
          15-minute read-only impersonation flow logs the actor + reason to
          the audit trail; the impersonated user is <strong>not</strong>{" "}
          notified (per BRD ADM-REQ-05).
        </>
      }
      capabilities={[
        {
          icon: "🔍",
          title: "Search & filter",
          body: "by email · role · institution · status",
        },
        {
          icon: "⏸",
          title: "Suspend / ban",
          body: "written reason mandatory · reversible · auditable",
        },
        {
          icon: "🪪",
          title: "Impersonate",
          body: "15-min read-only JWT · every session logged",
        },
        {
          icon: "🛡",
          title: "Admin grants",
          body: "PLATFORM admins cannot modify each other (BRD)",
        },
      ]}
      serviceNote="Backed by the auth-service's user table + the institution-service's per-tenant scope. The list endpoint is /api/v1/admin/users; suspend/ban are PUT /api/v1/admin/users/{id}/status with a reason field. Phase 2 wires both into the React table component."
      primaryCta={{ label: "Manage flags meanwhile", to: "/flags" }}
    />
  );
}
