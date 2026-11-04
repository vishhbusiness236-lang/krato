import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { scanId, useful, comment, contact } = await req.json();

    if (!["yes", "somewhat", "no"].includes(useful)) {
      return NextResponse.json({ error: "Pick an option" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.from("report_feedback").insert({
      scan_id: typeof scanId === "string" ? scanId.slice(0, 100) : null,
      useful,
      comment: typeof comment === "string" ? comment.slice(0, 1000) : null,
      contact: typeof contact === "string" ? contact.slice(0, 200) : null,
    });

    if (error) {
      return NextResponse.json({ error: "Something went wrong, try again" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}