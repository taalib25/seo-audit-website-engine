import { createFileRoute } from "@tanstack/react-router";
import { secureResponse } from "../server/security";
export const Route = createFileRoute("/sitemap.xml")({ server: { handlers: { GET: ({ request }) => {
  const origin = new URL(request.url).origin;
  return secureResponse(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
} } } });
