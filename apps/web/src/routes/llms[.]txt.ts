import { createFileRoute } from "@tanstack/react-router";
import { secureResponse } from "../server/security";
export const Route = createFileRoute("/llms.txt")({ server: { handlers: { GET: () => secureResponse("# Signal / Audit\n\nAudit website readiness across SEO, answer engines (AEO), and generative search (GEO).\n\n- [Home](/): Start an audit\n- [Sample report](/audit/demo): Explore a sample report\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } }) } } });
