"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Log {
  id: string;
  action: string;
  detail: { to?: string } | null;
  created_at: string;
}

interface Props {
  initialMode: "simulation" | "production";
  logs: Log[];
}

export default function ModeToggleSection({ initialMode, logs }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"simulation" | "production">(initialMode);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const nextMode: "simulation" | "production" =
    mode === "simulation" ? "production" : "simulation";

  async function doSwitch() {
    setLoading(true);
    setError("");
    const modeValue = nextMode;
    try {
      const res = await fetch("/api/admin/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: modeValue }),
      });
      const data = await res.json();
      if (res.ok) {
        setMode(modeValue);
        setShowConfirm(false);
        router.refresh();
      } else {
        setError(data.error ?? "오류가 발생했습니다.");
      }
    } catch (e) {
      console.error("mode switch error:", e);
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <>
      <div className="rounded-xl p-6 border border-slate-700 mb-4" style={{ background: "#162030" }}>
        <p className="text-sm text-slate-400 mb-3">현재 모드</p>
        <div className="flex items-center gap-3 mb-6">
          {mode === "simulation" ? (
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-500 text-white">
              시뮬레이션 모드 ON
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-600 text-white">
              실제투표 모드 ON
            </span>
          )}
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition ${
            mode === "simulation"
              ? "bg-red-600 hover:bg-red-700"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {mode === "simulation" ? "실제투표 모드로 전환" : "시뮬레이션 모드로 전환"}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>

      <div className="rounded-xl p-6 border border-slate-700" style={{ background: "#162030" }}>
        <p className="text-sm text-slate-400 mb-3">최근 모드 변경 이력</p>
        {logs.length === 0 ? (
          <p className="text-slate-500 text-sm">변경 이력이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-500 text-xs w-36 flex-shrink-0">
                  {formatKST(log.created_at)}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  log.detail?.to === "simulation"
                    ? "bg-blue-500 text-white"
                    : "bg-red-600 text-white"
                }`}>
                  {log.detail?.to === "simulation" ? "시뮬레이션" : "실제투표"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl p-6 border border-slate-700" style={{ background: "#162030" }}>
            <h2 className="text-lg font-bold text-white mb-2">모드 전환 확인</h2>
            <p className="text-slate-300 text-sm mb-6">
              {nextMode === "simulation"
                ? "시뮬레이션 모드로 전환하시겠습니까?"
                : "실제투표 모드로 전환하시겠습니까?"}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 border border-slate-600 hover:bg-slate-700 transition"
              >
                취소
              </button>
              <button
                onClick={doSwitch}
                disabled={loading}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 ${
                  nextMode === "production"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {loading ? "전환 중..." : "전환"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
