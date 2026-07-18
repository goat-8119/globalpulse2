import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db";

const CreateWatchlistSchema = z.object({
  name: z.string().min(1).max(200),
  indicatorIds: z.array(z.number().int().positive()).max(100),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateWatchlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO watchlists (name, indicator_ids)
    VALUES (${parsed.data.name}, ${parsed.data.indicatorIds})
    RETURNING id, name, indicator_ids
  `;

  return NextResponse.json({ watchlist: rows[0] }, { status: 201 });
}

export async function GET() {
  const sql = getSql();
  const rows = await sql`SELECT id, name, indicator_ids FROM watchlists ORDER BY id DESC`;
  return NextResponse.json({ watchlists: rows });
}
