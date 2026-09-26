import {
  Activity,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Layers,
  Plug,
  ScanSearch,
  Settings,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a small "Live" marker next to the label. */
  live?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Single source for the sidebar, the mobile "More" sheet and the top-bar page title. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Trade",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/positions", label: "Positions", icon: Activity },
      { href: "/orders", label: "Orders", icon: ClipboardList },
      { href: "/portfolio", label: "Portfolio", icon: Wallet },
    ],
  },
  {
    title: "Automate",
    items: [
      { href: "/strategies", label: "Strategies", icon: TrendingUp },
      { href: "/brokers", label: "Brokers", icon: Plug },
    ],
  },
  {
    title: "Discover",
    items: [
      { href: "/live-screener", label: "OHL Screener", icon: ScanSearch, live: true },
      { href: "/swing-scanner", label: "Swing Scanner", icon: Layers },
      { href: "/intraday-picks", label: "Intraday Picks", icon: Zap },
    ],
  },
  {
    title: "Reports",
    items: [
      { href: "/ledger", label: "P&L Ledger", icon: BookOpen },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ADMIN_NAV: NavItem[] = [{ href: "/admin/users", label: "User Access", icon: ShieldCheck }];

/** Tabs pinned to the mobile bottom bar; everything else lives in the "More" sheet. */
export const MOBILE_PRIMARY_HREFS = ["/dashboard", "/strategies", "/positions", "/orders"];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/strategies/new", title: "New Strategy" },
  { prefix: "/brokers/callback", title: "Broker Login" },
  ...NAV_GROUPS.flatMap((g) => g.items).map((i) => ({ prefix: i.href, title: i.label })),
  ...ADMIN_NAV.map((i) => ({ prefix: i.href, title: i.label })),
  { prefix: "/admin", title: "Admin" },
];

export function pageTitleFor(pathname: string) {
  return PAGE_TITLES.find((p) => isActivePath(pathname, p.prefix))?.title ?? "";
}

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
