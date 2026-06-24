import { createClient } from "@/lib/supabaseAdmin";
import Nav from "@/components/Nav";
import ModeToggleSection from "@/components/ModeToggleSection";

async function getSystemData() {
  const supabase = createClient();

  const [configRes, logsRes] = await Promise.all([
    supabase
      .from("system_config")
      .select("value")
      .eq("key", "simulation_mode")
      .single(),
    supabase
      .from("admin_logs")
      .select("id, action, detail, created_at")
      .eq("action", "mode_change")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const mode: "simulation" | "production" =
    configRes.data?.value === "true" ? "simulation" : "production";
  const logs = logsRes.data ?? [];

  return { mode, logs };
}

export default async function SystemPage() {
  const { mode, logs } = await getSystemData();

  return (
    <div className="min-h-screen" style={{ background: "#0F1923" }}>
      <Nav active="system" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">시스템 설정</h1>
        <ModeToggleSection initialMode={mode} logs={logs} />
      </main>
    </div>
  );
}
