import { describe, expect, it } from "vitest";
import { geoCitations } from "../../../src/checks/geo/index.ts";
import { page, runPage } from "../../helpers.ts";

const CLAIMS = [
  "Warehouse robots move pallets across the floor every single day.",
  "Modern grippers rely on pneumatic actuators to hold heavy loads.",
  "Operators program routes through a warehouse control dashboard.",
  "Maintenance crews replace worn suction cups on a fixed schedule.",
  "Gripper sensors detect slipping before a payload reaches the ground.",
  "Fleet managers track idle time to balance throughput across aisles.",
  "Safety cages keep human pickers away from fast moving machinery.",
  "Battery packs are swapped at charging stations during long shifts.",
  "Software updates arrive over the air without stopping the whole fleet.",
  "Downtime costs fall when predictive maintenance catches failures early.",
];

const prose = (extra: string[]) =>
  `<html><body><main><h1>Warehouse robots</h1><p>${[...CLAIMS, ...extra].join(" ")}</p></main></body></html>`;

describe("geo.citations", () => {
  it("passes when enough claims cite a source", async () => {
    const html = prose([
      "According to the 2026 robotics report, gripper reliability improved.",
      "According to the same study, downtime fell by a fifth.",
    ]);
    const r = await runPage(geoCitations, page(html));
    expect(r.status).toBe("pass");
    expect(r.score).toBeGreaterThanOrEqual(0.8);
  });

  it("warns with partial attribution", async () => {
    const html = prose(["According to the 2026 robotics report, gripper reliability improved."]);
    const r = await runPage(geoCitations, page(html));
    expect(r.status).toBe("warn");
  });

  it("fails without any attribution", async () => {
    const r = await runPage(geoCitations, page(prose([])));
    expect(r.status).toBe("fail");
    expect(r.fix?.snippetLang).toBe("markdown");
  });

  it("skips pages without enough prose", async () => {
    const r = await runPage(geoCitations, page("<html><body><main><p>Short.</p></main></body></html>"));
    expect(r.status).toBe("skip");
  });
});
