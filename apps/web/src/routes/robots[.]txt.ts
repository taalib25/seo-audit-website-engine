import { createFileRoute } from "@tanstack/react-router";
import { secureResponse } from "../server/security";
export const Route = createFileRoute("/robots.txt")({ server: { handlers: { GET: () => secureResponse("User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } }) } } });
