import { createClient } from "@/lib/supabaseAdmin";
import Nav from "@/components/Nav";

function formatKST(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const modeBadge: Record<string, { label: string; cls: string }> = {
  simulation: { label: "시뮬레이션", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  production: { label: "실제투표", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: "대기", cls: "bg-slate-600/50 text-slate-400 border-slate-600" },
  open:    { label: "진행중", cls: "bg-green-500/20 text-green-400 border-green-500/30" },
  closed:  { label: "종료", cls: "bg-slate-700/60 text-slate-500 border-slate-700" },
};

export default async function ElectionsPage() {
  const supabase = createClient();
  const { data: elections } = await supabase
    .from("elections")
    .select("id, title, status, mode, opens_at, closes_at")
    .order("created_at", { ascending: false });

  const list = elections ?? [];

  return (
    <div className="min-h-screen" style={{ background: "#0F1923" }}>
      <Nav active="elections" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">선거 관리</h1>
          <a
            href="/elections/new"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: "#2E5CA8" }}
          >
            + 새 선거 만들기
          </a>
        </div>

        {list.length === 0 ? (
          <div className="rounded-xl p-12 border border-slate-700 text-center text-slate-400" style={{ background: "#162030" }}>
            등록된 선거가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((e) => {
              const mode = modeBadge[e.mode] ?? modeBadge.simulation;
              const stat = statusBadge[e.status] ?? statusBadge.pending;
              return (
                <div
                  key={e.id}
                  className="rounded-xl p-5 border border-slate-700 flex flex-col sm:flex-row sm:items-center gap-3"
                  style={{ background: "#162030" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{e.title}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatKST(e.opens_at)} ~ {formatKST(e.closes_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${mode.cls}`}>
                      {mode.label}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stat.cls}`}>
                      {stat.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
