import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseAdmin";

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("elections")
    .select("id, title, status, mode, opens_at, closes_at, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { title, description, mode, options, opens_at, closes_at } = await req.json();

  if (!title || !mode || !Array.isArray(options) || options.length < 2 || !opens_at || !closes_at) {
    return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }

  const supabase = createClient();

  const { data: election, error: elErr } = await supabase
    .from("elections")
    .insert({ title, description, mode, opens_at, closes_at, status: "pending" })
    .select()
    .single();

  if (elErr) return NextResponse.json({ error: elErr.message }, { status: 500 });

  const ballotRows = (options as string[]).map((option_text, i) => ({
    election_id: election.id,
    option_text,
    display_order: i + 1,
  }));

  const { error: optErr } = await supabase.from("ballot_options").insert(ballotRows);
  if (optErr) return NextResponse.json({ error: optErr.message }, { status: 500 });

  await supabase.from("admin_logs").insert({
    action: "election_create",
    detail: { title, mode },
  });

  return NextResponse.json(election, { status: 201 });
}
