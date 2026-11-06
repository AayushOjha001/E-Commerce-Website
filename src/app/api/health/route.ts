import { NextResponse } from "next/server";

import { getHealth } from "@/server/services/health";

// A health probe must never be prerendered or cached — it has to reflect the
// state of the database at request time.
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getHealth();

  // 503 when the DB is unreachable, so load balancers and `docker healthcheck`
  // can act on the status code rather than parsing the body.
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
  });
}
