import type { DashboardSummary } from "@hub/shared";
import {
  BarChart3,
  Bell,
  CalendarDays,
  FileText,
  Flag,
  History,
  IdCard,
  Inbox,
  LayoutGrid,
  Link2,
  ListChecks,
  Mail,
  Sparkles,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: (summary: DashboardSummary) => number;
}

export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "ภาพรวม",
    items: [
      { href: "/", label: "ภาพรวม", icon: LayoutGrid },
      { href: "/notifications", label: "การแจ้งเตือน", icon: Bell, count: (s) => s.unreadNotifications },
    ],
  },
  {
    label: "บัญชี",
    items: [
      { href: "/owners", label: "เจ้าของบัญชี", icon: Users },
      { href: "/mailboxes", label: "เมล", icon: Mail },
      { href: "/accounts", label: "บัญชีแพลตฟอร์ม", icon: IdCard },
      { href: "/pages", label: "Page", icon: Flag },
      { href: "/onboarding", label: "Checklist สมัคร", icon: ListChecks, count: (s) => s.actions.overdueTasks },
      { href: "/inbox", label: "อีเมลรอตรวจ", icon: Inbox, count: (s) => s.actions.inboxNeedsReview },
    ],
  },
  {
    label: "คอนเทนต์",
    items: [
      { href: "/page-kits", label: "Page Kit", icon: Sparkles },
      { href: "/content", label: "คอนเทนต์", icon: FileText },
      { href: "/schedule", label: "คิวโพสต์", icon: CalendarDays, count: (s) => s.actions.postsNeedingAttention },
    ],
  },
  {
    label: "รายงาน",
    items: [
      { href: "/reports", label: "Report", icon: BarChart3 },
      { href: "/activity", label: "ประวัติการแก้ไข", icon: History },
    ],
  },
  {
    label: "ตั้งค่า",
    items: [
      { href: "/connections", label: "การเชื่อมต่อ", icon: Link2, count: (s) => s.actions.connectionsNeedingReauth },
      { href: "/users", label: "ผู้ใช้ระบบ", icon: UserCog },
    ],
  },
];
