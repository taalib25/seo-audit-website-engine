import { createFileRoute } from "@tanstack/react-router";
import { DemoAuditPage } from "./audit.$id";

export const Route = createFileRoute("/demo")({ component: DemoRoute });

function DemoRoute() {
  return import.meta.env.DEV ? <DemoAuditPage /> : <main className="mx-auto max-w-xl px-6 py-20"><h1 className="text-2xl font-semibold">Demo unavailable</h1><p className="mt-2 text-[var(--muted)]">The live simulation is available in development mode.</p></main>;
}
