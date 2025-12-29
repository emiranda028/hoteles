// app/page.tsx
import { ClientErrorBoundary } from "./components/ClientErrorBoundary";
import DashboardClient from "./components/DashboardClient";

export default function Page() {
  return (
    <ClientErrorBoundary>
      <main style={{ padding: "1.25rem", maxWidth: 1200, margin: "0 auto" }}>
        <DashboardClient />
      </main>
    </ClientErrorBoundary>
  );
}
