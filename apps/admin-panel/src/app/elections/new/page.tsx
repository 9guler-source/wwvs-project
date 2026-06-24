"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewElectionPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"simulation" | "production">("simulation");
  const [options, setOptions] = useState(["", ""]);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function addOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateOption(i: number, val: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const filled = options.filter((o) => o.trim());
    if (filled.length < 2) {
      setError("투표 항목을 최소 2개 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/elections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          mode,
          options: filled,
          opens_at: new Date(opensAt).toISOString(),
          closes_at: new Date(closesAt).toISOString(),
        }),
      });

      if (res.ok) {
        router.push("/elections");
      } else {
        const data = await res.json();
        setError(data.error ?? "오류가 발생했습니다.");
      }
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#0F1923" }}>
      {/* Minimal header */}
      <nav className="border-b border-slate-700" style={{ background: "#0d1720" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          <a href="/elections" className="text-slate-400 hover:text-white transition text-sm">
            ← 선거관리
          </a>
          <span className="font-bold text-white">새 선거 만들기</span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 선거 제목 */}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">선거 제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800 text-white border border-slate-600 focus:outline-none focus:border-blue-500 transition"
              placeholder="예) 2025년 1학기 학생회장 선거"
            />
          </div>

          {/* 선거 설명 */}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">선거 설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800 text-white border border-slate-600 focus:outline-none focus:border-blue-500 transition resize-none"
              placeholder="선거에 대한 설명을 입력하세요"
            />
          </div>

          {/* 투표 모드 */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">투표 모드 *</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="simulation"
                  checked={mode === "simulation"}
                  onChange={() => setMode("simulation")}
                  className="accent-blue-500"
                />
                <span className="text-sm text-slate-200">
                  시뮬레이션
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    테스트용
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="production"
                  checked={mode === "production"}
                  onChange={() => setMode("production")}
                  className="accent-red-500"
                />
                <span className="text-sm text-slate-200">
                  실제투표
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                    실전
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* 투표 항목 */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">투표 항목 * (최소 2개)</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 text-white border border-slate-600 focus:outline-none focus:border-blue-500 transition"
                    placeholder={`항목 ${i + 1}`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="px-3 py-2 rounded-lg text-red-400 hover:bg-red-900/30 transition text-sm"
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition"
            >
              + 항목 추가
            </button>
          </div>

          {/* 투표 기간 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">투표 시작 (KST) *</label>
              <input
                type="datetime-local"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800 text-white border border-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">투표 종료 (KST) *</label>
              <input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800 text-white border border-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <a
              href="/elections"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 border border-slate-600 hover:bg-slate-700 transition"
            >
              취소
            </a>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "#2E5CA8" }}
            >
              {loading ? "생성 중..." : "선거 만들기"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
