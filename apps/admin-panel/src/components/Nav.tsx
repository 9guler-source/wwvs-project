import LogoutButton from "./LogoutButton";

type NavPage = "dashboard" | "elections" | "system";

export default function Nav({ active }: { active: NavPage }) {
  const links: { href: string; label: string; key: NavPage }[] = [
    { href: "/", label: "대시보드", key: "dashboard" },
    { href: "/elections", label: "선거관리", key: "elections" },
    { href: "/system", label: "시스템설정", key: "system" },
  ];

  return (
    <nav className="border-b border-slate-700" style={{ background: "#0d1720" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <span className="font-bold text-white text-lg">WWVS Admin</span>
            <div className="flex gap-1">
              {links.map((link) =>
                active === link.key ? (
                  <a
                    key={link.key}
                    href={link.href}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
                    style={{ background: "#2E5CA8" }}
                  >
                    {link.label}
                  </a>
                ) : (
                  <a
                    key={link.key}
                    href={link.href}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition"
                  >
                    {link.label}
                  </a>
                )
              )}
            </div>
          </div>
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
