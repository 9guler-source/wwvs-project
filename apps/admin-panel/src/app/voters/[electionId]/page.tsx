"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

interface ParsedError {
  row: number;
  name: string;
  phone: string;
  reason: string;
}

interface UploadResult {
  total: number;
  success: number;
  errors: ParsedError[];
}

interface Voter {
  id: string;
  name: string;
  created_at: string;
}

interface Election {
  id: string;
  title: string;
  status: string;
}

export default function VotersPage() {
  const router = useRouter();
  const params = useParams<{ electionId: string }>();
  const electionId = params.electionId;

  const [election, setElection] = useState<Election | null>(null);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [voterCount, setVoterCount] = useState(0);
  const [loadingPage, setLoadingPage] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchVoters = useCallback(async () => {
    const res = await fetch(`/api/admin/voters/${electionId}`);
    if (res.ok) {
      const data = await res.json();
      setVoters(data.voters ?? []);
      setVoterCount(data.count ?? 0);
    }
  }, [electionId]);

  useEffect(() => {
    async function init() {
      const [elRes] = await Promise.all([
        fetch(`/api/admin/elections`).then((r) => r.json()),
        fetchVoters(),
      ]);
      const found = (elRes as Election[]).find((e) => e.id === electionId);
      setElection(found ?? null);
      setLoadingPage(false);
    }
    init();
  }, [electionId, fetchVoters]);

  function handleFileSelect(f: File | null) {
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setUploadError("xlsx 또는 xls 파일만 업로드 가능합니다.");
      return;
    }
    setFile(f);
    setUploadResult(null);
    setUploadError("");
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave() {
    setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFileSelect(e.dataTransfer.files[0] ?? null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/voters/${electionId}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadResult(data);
        setFile(null);
        await fetchVoters();
      } else {
        setUploadError(data.error ?? "업로드 실패");
      }
    } catch {
      setUploadError("서버 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/voters/${electionId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setShowDeleteConfirm(false);
        await fetchVoters();
      } else {
        alert(data.error ?? "삭제 실패");
      }
    } catch {
      alert("서버 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  const canDelete = election?.status === "pending";

  if (loadingPage) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F1923" }}>
        <p className="text-slate-400">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0F1923" }}>
      {/* Header */}
      <nav className="border-b border-slate-700" style={{ background: "#0d1720" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => router.push("/elections")}
            className="text-slate-400 hover:text-white transition text-sm"
          >
            ← 선거관리
          </button>
          <div>
            <span className="font-bold text-white">선거인 명부</span>
            {election && (
              <span className="ml-2 text-slate-400 text-sm">{election.title}</span>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* 파일 업로드 영역 */}
        <div className="rounded-xl border border-slate-700 p-6" style={{ background: "#162030" }}>
          <h2 className="text-lg font-semibold text-white mb-4">명부 파일 업로드</h2>

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition ${
              dragging
                ? "border-blue-400 bg-blue-500/10"
                : "border-slate-600 hover:border-slate-400"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div>
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-slate-400 text-sm mt-1">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-slate-300 font-medium">
                  xlsx 파일을 드래그하거나 클릭하여 선택
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  A열: 이름 / B열: 전화번호
                </p>
              </div>
            )}
          </div>

          {uploadError && (
            <p className="mt-3 text-sm text-red-400">{uploadError}</p>
          )}

          {file && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="mt-4 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: "#2E5CA8" }}
            >
              {uploading ? "업로드 중..." : "업로드 확정"}
            </button>
          )}
        </div>

        {/* 업로드 결과 미리보기 */}
        {uploadResult && (
          <div className="rounded-xl border border-slate-700 p-6" style={{ background: "#162030" }}>
            <h2 className="text-lg font-semibold text-white mb-4">업로드 결과</h2>
            <div className="flex gap-6 mb-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-400">{uploadResult.success}</p>
                <p className="text-xs text-slate-400 mt-1">성공</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-red-400">{uploadResult.errors.length}</p>
                <p className="text-xs text-slate-400 mt-1">오류</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-300">{uploadResult.total}</p>
                <p className="text-xs text-slate-400 mt-1">전체</p>
              </div>
            </div>

            {uploadResult.errors.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 pr-4">행</th>
                      <th className="pb-2 pr-4">이름</th>
                      <th className="pb-2 pr-4">전화번호</th>
                      <th className="pb-2">오류 사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.errors.map((e, i) => (
                      <tr key={i} className="border-b border-slate-800 text-red-400">
                        <td className="py-1.5 pr-4">{e.row}</td>
                        <td className="py-1.5 pr-4">{e.name || "—"}</td>
                        <td className="py-1.5 pr-4 font-mono text-xs">{e.phone || "—"}</td>
                        <td className="py-1.5">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 현재 등록된 명부 */}
        <div className="rounded-xl border border-slate-700 p-6" style={{ background: "#162030" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              현재 등록된 명부
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {voterCount}명
              </span>
            </h2>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={!canDelete || voterCount === 0}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-red-400 border border-red-800 hover:bg-red-900/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              명부 전체 삭제
            </button>
          </div>

          {!canDelete && (
            <p className="text-xs text-slate-500 mb-3">※ 선거 상태가 대기(pending)일 때만 삭제 가능합니다.</p>
          )}

          {voters.length === 0 ? (
            <p className="text-slate-500 text-sm">등록된 선거인이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto">
              {voters.map((v) => (
                <div
                  key={v.id}
                  className="px-3 py-1.5 rounded-lg text-sm text-slate-200 bg-slate-800/60 truncate"
                >
                  {v.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="w-full max-w-sm rounded-2xl p-6 border border-slate-700"
            style={{ background: "#162030" }}
          >
            <h2 className="text-lg font-bold text-white mb-2">명부 전체 삭제</h2>
            <p className="text-slate-300 text-sm mb-6">
              선거인 명부 전체({voterCount}명)를 삭제하시겠습니까?
              <br />
              <span className="text-red-400 font-semibold">이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 border border-slate-600 hover:bg-slate-700 transition"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
