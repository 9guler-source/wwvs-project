import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseAdmin";

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("system_config")
    .select("value, updated_at")
    .eq("key", "simulation_mode")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mode = data.value === "true" ? "simulation" : "production";
  return NextResponse.json({ mode, updated_at: data.updated_at });
}

export async function POST(req: NextRequest) {
  const { mode } = await req.json() as { mode: "simulation" | "production" };

  if (mode !== "simulation" && mode !== "production") {
    return NextResponse.json({ error: "유효하지 않은 mode 값입니다." }, { status: 400 });
  }

  const supabase = createClient();
  const value = mode === "simulation" ? "true" : "false";

  const { error: updateErr } = await supabase
    .from("system_config")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", "simulation_mode");

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabase.from("admin_logs").insert({
    action: "mode_change",
    detail: { to: mode },
  });

  // 3개 서버에 캐시 초기화 브로드캐스트
  const servers = [
    process.env.AUTH_SERVER_URL,
    process.env.OPS_SERVER_URL,
    process.env.COUNT_SERVER_URL,
  ].filter(Boolean);

  const broadcastResults = await Promise.allSettled(
    servers.map((url) =>
      fetch(`${url}/api/internal/reload-config`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SERVER_INTER_SECRET}`,
          'Content-Type': 'application/json',
        },
      }).then((r) => ({ url, ok: r.ok, status: r.status }))
    )
  );

  const broadcast = broadcastResults.map((r) =>
    r.status === 'fulfilled' ? r.value : { url: 'unknown', ok: false, error: String(r.reason) }
  );

  return NextResponse.json({ success: true, mode, broadcast });
}
