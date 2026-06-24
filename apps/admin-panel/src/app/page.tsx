import { createClient } from "@/lib/supabaseAdmin";
import Nav from "@/components/Nav";

async function getDashboardData() {
  const supabase = createClient();

  const [configRes, electionsRes] = await Promise.all([
    supabase
      .from("system_config")
      .select("value")
      .eq("key", "simulation_mode")
      .single(),
    supabase.from("elections").select("id, status"),
  ]);

  const simulationMode = configRes.data?.value === "true";
  const elections = electionsRes.data ?? [];
  const activeCount = elections.filter((e) => e.status === "open").length;

  return { simulationMode, totalElections: elections.length, activeCount };
}

export default async function DashboardPage() {
  const { simulationMode, totalElections, activeCount } = await getDashboardData();

  return (
    <div className="min-h-screen" style={{ background: "#0F1923" }}>
      <Nav active="dashboard" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">대시보드</h1>
          {simulationMode ? (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
              시뮬레이션 모드 ON
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
              실제투표 모드 ON
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl p-6 border border-slate-700" style={{ background: "#162030" }}>
            <p className="text-sm text-slate-400 mb-1">진행중인 선거</p>
            <p className="text-4xl font-bold text-white">{activeCount}</p>
            <p className="text-xs text-slate-500 mt-1">status = open</p>
          </div>

          <div className="rounded-xl p-6 border border-slate-700" style={{ background: "#162030" }}>
            <p className="text-sm text-slate-400 mb-1">전체 선거 수</p>
            <p className="text-4xl font-bold text-white">{totalElections}</p>
            <p className="text-xs text-slate-500 mt-1">elections 테이블 전체</p>
          </div>
        </div>
      </main>
    </div>
  );
}
