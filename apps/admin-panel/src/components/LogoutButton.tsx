"use client";

export default function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-red-800/40 transition"
    >
      로그아웃
    </button>
  );
}
