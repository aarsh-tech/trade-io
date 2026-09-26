"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuthStore } from "@/store";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import {
  ShieldCheck,
  Users,
  UserCheck,
  Radio,
  RefreshCw,
  KeyRound,
  LogOut,
  Trash2,
  Lock,
  UserPlus,
  Shield,
  Check,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  isActive: boolean;
  twoFaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
  brokerAccountsCount: number;
  strategiesCount: number;
  hasActiveSession: boolean;
  lastActiveAt: string | null;
}

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalAdmins: number;
  activeSessions: number;
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalAdmins: 0,
    activeSessions: 0,
  });
  const [users, setUsers] = useState<AdminUser[]>([]);

  // Filters
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "USER">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Modals & Actions
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "USER" as "USER" | "ADMIN",
  });
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    name: string;
    password?: string;
  } | null>(null);

  // Reset Password Modal
  const [resetModalUser, setResetModalUser] = useState<AdminUser | null>(null);
  const [customNewPass, setCustomNewPass] = useState("");
  const [generatedPassResult, setGeneratedPassResult] = useState<string | null>(null);

  // Confirm Action Dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
    variant?: "default" | "destructive";
    confirmText?: string;
  }>({
    open: false,
    title: "",
    description: "",
    action: async () => {},
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function fetchUsers() {
    try {
      setRefreshing(true);
      const res = await adminApi.listUsers();
      if (res.data?.success && res.data?.data) {
        setStats(res.data.data.stats || { totalUsers: 0, activeUsers: 0, totalAdmins: 0, activeSessions: 0 });
        setUsers(res.data.data.users || []);
      }
    } catch (err: any) {
      toast.error("Failed to load users", {
        description: err?.response?.data?.message || err.message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // Action: Toggle Status
  async function handleToggleStatus(targetUser: AdminUser) {
    const nextStatus = !targetUser.isActive;
    const isSelf = targetUser.id === currentUser?.id;
    if (isSelf && !nextStatus) {
      toast.error("You cannot deactivate your own admin account");
      return;
    }

    setConfirmDialog({
      open: true,
      title: nextStatus ? `Activate ${targetUser.name}'s account?` : `Suspend ${targetUser.name}'s account?`,
      description: nextStatus
        ? "The user will regain access to login and execute algorithmic trades."
        : "The user will be immediately logged out of all active devices and blocked from logging in.",
      variant: nextStatus ? "default" : "destructive",
      confirmText: nextStatus ? "Activate Account" : "Suspend & Revoke Access",
      action: async () => {
        try {
          await adminApi.updateStatus(targetUser.id, nextStatus);
          toast.success(nextStatus ? "Account activated" : "Account suspended");
          fetchUsers();
        } catch (err: any) {
          toast.error("Failed to update status", {
            description: err?.response?.data?.message || err.message,
          });
        }
      },
    });
  }

  // Action: Toggle Role
  async function handleToggleRole(targetUser: AdminUser) {
    const nextRole = targetUser.role === "ADMIN" ? "USER" : "ADMIN";
    const isSelf = targetUser.id === currentUser?.id;
    if (isSelf && nextRole !== "ADMIN") {
      toast.error("You cannot demote your own admin account");
      return;
    }

    setConfirmDialog({
      open: true,
      title: nextRole === "ADMIN" ? `Promote ${targetUser.name} to Administrator?` : `Demote ${targetUser.name} to Trader?`,
      description: nextRole === "ADMIN"
        ? "This user will gain full privileges to provision users, reset passwords, and view system stats."
        : "This user will lose administrative privileges and have standard trader access.",
      variant: "default",
      confirmText: nextRole === "ADMIN" ? "Promote to Admin" : "Demote to Trader",
      action: async () => {
        try {
          await adminApi.updateRole(targetUser.id, nextRole);
          toast.success(`Role updated to ${nextRole}`);
          fetchUsers();
        } catch (err: any) {
          toast.error("Failed to update role", {
            description: err?.response?.data?.message || err.message,
          });
        }
      },
    });
  }

  // Action: Force Logout
  async function handleForceLogout(targetUser: AdminUser) {
    setConfirmDialog({
      open: true,
      title: `Terminate all active sessions for ${targetUser.name}?`,
      description: "This will invalidate all active refresh tokens. The user will be required to log in again.",
      variant: "destructive",
      confirmText: "Force Logout",
      action: async () => {
        try {
          await adminApi.revokeSessions(targetUser.id);
          toast.success("Active sessions terminated");
          fetchUsers();
        } catch (err: any) {
          toast.error("Failed to revoke sessions", {
            description: err?.response?.data?.message || err.message,
          });
        }
      },
    });
  }

  // Action: Delete User
  async function handleDeleteUser(targetUser: AdminUser) {
    const isSelf = targetUser.id === currentUser?.id;
    if (isSelf) {
      toast.error("You cannot delete your own admin account");
      return;
    }

    setConfirmDialog({
      open: true,
      title: `Delete ${targetUser.name}'s account permanently?`,
      description: "This will permanently remove their user record, broker credentials, and trading strategies. This action CANNOT be undone.",
      variant: "destructive",
      confirmText: "Delete Account",
      action: async () => {
        try {
          await adminApi.deleteUser(targetUser.id);
          toast.success("User account deleted");
          fetchUsers();
        } catch (err: any) {
          toast.error("Failed to delete user", {
            description: err?.response?.data?.message || err.message,
          });
        }
      },
    });
  }

  // Action: Create User Submit
  async function handleCreateUserSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim()) {
      toast.error("Name and email are required");
      return;
    }

    try {
      const res = await adminApi.createUser({
        name: createForm.name.trim(),
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password.trim() || undefined,
        role: createForm.role,
      });

      if (res.data?.success) {
        toast.success("User account provisioned successfully!");
        setCreatedCredentials({
          email: res.data.data.user.email,
          name: res.data.data.user.name,
          password: res.data.data.temporaryPassword,
        });
        setCreateForm({ name: "", email: "", password: "", role: "USER" });
        fetchUsers();
      }
    } catch (err: any) {
      toast.error("Failed to create user", {
        description: err?.response?.data?.message || err.message,
      });
    }
  }

  // Action: Reset Password Submit
  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resetModalUser) return;

    try {
      const res = await adminApi.resetPassword(
        resetModalUser.id,
        customNewPass.trim() || undefined
      );
      if (res.data?.success) {
        toast.success("Password reset successfully");
        setGeneratedPassResult(res.data.data.newPassword);
        setCustomNewPass("");
        fetchUsers();
      }
    } catch (err: any) {
      toast.error("Failed to reset password", {
        description: err?.response?.data?.message || err.message,
      });
    }
  }

  // Filtered dataset for DataTable
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && u.isActive) ||
        (statusFilter === "INACTIVE" && !u.isActive);
      return matchesRole && matchesStatus;
    });
  }, [users, roleFilter, statusFilter]);

  // Standard TanStack DataTable Columns Definition
  const columns: ColumnDef<AdminUser>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="User Details" />
        ),
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.id === currentUser?.id;
          return (
            <div className="flex items-center gap-3">
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold text-xs shrink-0  ${
                  u.role === "ADMIN"
                    ? "bg-signal-subtle text-signal border border-signal/30"
                    : "bg-brand-subtle text-accent-foreground border border-primary/30"
                }`}
              >
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground truncate">{u.name}</span>
                  {isSelf && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-muted text-foreground/75 border border-border">
                      YOU
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground block truncate font-mono">
                  {u.email}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "role",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Role" />
        ),
        cell: ({ row }) => {
          const role = row.getValue("role") as string;
          return role === "ADMIN" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-signal-subtle text-signal border border-signal/30">
              <Shield className="h-3 w-3" />
              ADMIN
            </span>
          ) : (
            <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-foreground/75 border border-border">
              TRADER
            </span>
          );
        },
      },
      {
        accessorKey: "isActive",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Account Status" />
        ),
        cell: ({ row }) => {
          const isActive = row.getValue("isActive") as boolean;
          return isActive ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-profit bg-profit-subtle px-2 py-0.5 rounded-full border border-profit/30">
              <span className="h-1.5 w-1.5 rounded-full bg-profit" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-loss bg-loss-subtle px-2 py-0.5 rounded-full border border-loss/30">
              <span className="h-1.5 w-1.5 rounded-full bg-loss" />
              Suspended
            </span>
          );
        },
      },
      {
        accessorKey: "hasActiveSession",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Live Session" />
        ),
        cell: ({ row }) => {
          const u = row.original;
          return u.hasActiveSession ? (
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-warn bg-warn-subtle px-2 py-0.5 rounded-full border border-warn/30">
                <span className="h-1.5 w-1.5 rounded-full bg-warn animate-ping" />
                Online
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {u.sessionCount} active session{u.sessionCount > 1 ? "s" : ""}
              </span>
            </div>
          ) : (
            <div>
              <span className="text-[11px] font-medium text-muted-foreground">Offline</span>
              {u.lastActiveAt && (
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Last seen {new Date(u.lastActiveAt).toLocaleDateString()}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "resources",
        header: "Resources",
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex items-center gap-2 text-[11px] text-foreground/75">
              <span className="bg-muted px-2 py-0.5 rounded border border-border">
                {u.brokerAccountsCount} Broker{u.brokerAccountsCount !== 1 ? "s" : ""}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded border border-border">
                {u.strategiesCount} Strat{u.strategiesCount !== 1 ? "s" : ""}
              </span>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.id === currentUser?.id;
          return (
            <div className="flex items-center justify-end gap-1.5">
              {/* Toggle Status */}
              <button
                type="button"
                onClick={() => handleToggleStatus(u)}
                disabled={isSelf}
                className={`p-1.5 rounded-lg border transition-colors ${
                  u.isActive
                    ? "hover:bg-warn-subtle hover:text-warn border-border text-foreground/75"
                    : "hover:bg-profit-subtle hover:text-profit border-border text-foreground/75"
                } ${isSelf ? "opacity-30 cursor-not-allowed" : ""}`}
                title={u.isActive ? "Suspend Access" : "Activate Access"}
              >
                <Lock className="h-3.5 w-3.5" />
              </button>

              {/* Reset Password */}
              <button
                type="button"
                onClick={() => {
                  setResetModalUser(u);
                  setCustomNewPass("");
                  setGeneratedPassResult(null);
                }}
                className="p-1.5 rounded-lg border border-border hover:bg-signal-subtle hover:text-signal text-foreground/75 transition-colors"
                title="Reset Password"
              >
                <KeyRound className="h-3.5 w-3.5" />
              </button>

              {/* Force Logout */}
              <button
                type="button"
                onClick={() => handleForceLogout(u)}
                className="p-1.5 rounded-lg border border-border hover:bg-warn-subtle hover:text-warn text-foreground/75 transition-colors"
                title="Terminate Active Sessions"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>

              {/* Toggle Role */}
              <button
                type="button"
                onClick={() => handleToggleRole(u)}
                disabled={isSelf}
                className={`p-1.5 rounded-lg border border-border hover:bg-brand-subtle hover:text-accent-foreground text-foreground/75 transition-colors ${
                  isSelf ? "opacity-30 cursor-not-allowed" : ""
                }`}
                title={u.role === "ADMIN" ? "Demote to Trader" : "Promote to Admin"}
              >
                <Shield className="h-3.5 w-3.5" />
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={() => handleDeleteUser(u)}
                disabled={isSelf}
                className={`p-1.5 rounded-lg border border-border hover:bg-loss-subtle hover:text-loss text-foreground/75 transition-colors ${
                  isSelf ? "opacity-30 cursor-not-allowed" : ""
                }`}
                title="Delete Account"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      },
    ],
    [currentUser]
  );

  // Non-admin guard
  if (!loading && currentUser?.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <div className="h-16 w-16 rounded-lg bg-loss-subtle border border-loss/30 flex items-center justify-center text-loss mb-4">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground mb-2">Administrator Access Required</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          This portal is restricted to system administrators. Your account does not have permission to manage user credentials or access controls.
        </p>
        <Link
          href="/dashboard"
          className="px-4 py-2 bg-primary hover:bg-brand-hover text-primary-foreground text-sm font-semibold rounded-lg transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-signal text-on-signal shadow-md">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                  User & Access Management
                </h1>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-signal-subtle text-signal border border-signal/30">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Provision new client accounts, monitor live sessions, and manage authorization levels.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={fetchUsers}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted/50 text-foreground/75 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-signal" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreatedCredentials(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-signal hover:bg-signal/90 text-on-signal shadow-md transition-all active:scale-98"
          >
            <UserPlus className="h-4 w-4" />
            <span>Provision User</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Users */}
        <div className="bg-card rounded-lg border border-border/80 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Accounts</span>
            <div className="p-2 rounded-lg bg-brand-subtle text-accent-foreground border border-primary/30">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-semibold text-foreground">
              {loading ? "..." : stats.totalUsers}
            </span>
            <span className="text-xs text-muted-foreground">Registered</span>
          </div>
        </div>

        {/* Active Accounts */}
        <div className="bg-card rounded-lg border border-border/80 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Users</span>
            <div className="p-2 rounded-lg bg-profit-subtle text-profit border border-profit/30">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-semibold text-profit">
              {loading ? "..." : stats.activeUsers}
            </span>
            <span className="text-xs text-muted-foreground">Allowed Login</span>
          </div>
        </div>

        {/* Live Active Sessions */}
        <div className="bg-card rounded-lg border border-border/80 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Sessions</span>
            <div className="p-2 rounded-lg bg-warn-subtle text-warn border border-warn/30">
              <Radio className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-semibold text-warn">
              {loading ? "..." : stats.activeSessions}
            </span>
            <span className="text-xs text-muted-foreground">Online Now</span>
          </div>
        </div>

        {/* Administrators */}
        <div className="bg-card rounded-lg border border-border/80 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Admins</span>
            <div className="p-2 rounded-lg bg-signal-subtle text-signal border border-signal/30">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-semibold text-signal">
              {loading ? "..." : stats.totalAdmins}
            </span>
            <span className="text-xs text-muted-foreground">Full Privileges</span>
          </div>
        </div>
      </div>

      {/* Standard TanStack DataTable */}
      <div className="bg-card rounded-lg border border-border/80 p-4">
        <DataTable
          columns={columns}
          data={filteredUsers}
          searchKey="name"
          searchPlaceholder="Search users by name..."
          isLoading={loading}
          pageSize={10}
          emptyMessage="No registered users found matching your filters."
          toolbarExtra={
            <div className="flex items-center gap-2 overflow-x-auto">
              {/* Role Filter */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setRoleFilter("ALL")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    roleFilter === "ALL" ? "bg-card text-foreground " : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All Roles
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter("ADMIN")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    roleFilter === "ADMIN" ? "bg-signal text-on-signal " : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Admins
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter("USER")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    roleFilter === "USER" ? "bg-card text-foreground " : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Traders
                </button>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === "ALL" ? "bg-card text-foreground " : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All Status
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("ACTIVE")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === "ACTIVE" ? "bg-profit text-on-profit " : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("INACTIVE")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === "INACTIVE" ? "bg-loss text-on-loss " : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Suspended
                </button>
              </div>
            </div>
          }
        />
      </div>

      {/* ─── Modal 1: Provision User Dialog ─── */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 text-signal mb-1">
              <UserPlus className="h-5 w-5" />
              <DialogTitle className="text-lg font-semibold text-foreground">Provision New Account</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Create an authorized account. If you leave the password blank, the system will generate a secure random password.
            </DialogDescription>
          </DialogHeader>

          {createdCredentials ? (
            <div className="space-y-4 py-3">
              <div className="p-4 rounded-lg bg-profit-subtle border border-profit/80 space-y-2.5">
                <div className="flex items-center gap-2 text-profit font-semibold text-sm">
                  <Check className="h-4 w-4 text-profit" />
                  Account Ready to Deliver!
                </div>
                <p className="text-xs text-profit">
                  Provide these credentials to the user. They can log in immediately at <code className="font-mono bg-profit-subtle/70 px-1 py-0.5 rounded">/login</code>.
                </p>

                <div className="bg-card p-3 rounded-lg border border-profit/30 text-xs font-mono space-y-1.5 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-semibold text-foreground">{createdCredentials.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Password:</span>
                    <span className="font-semibold text-signal bg-signal-subtle px-2 py-0.5 rounded border border-signal/30">
                      {createdCredentials.password}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `Login URL: http://localhost:3000/login\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`,
                      "new-user"
                    )
                  }
                  className="w-full mt-2 py-2 px-3 bg-profit hover:bg-profit/90 text-on-profit font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedKey === "new-user" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === "new-user" ? "Copied to Clipboard!" : "Copy User Credentials"}</span>
                </button>
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreatedCredentials(null);
                  }}
                  className="w-full py-2 bg-muted hover:bg-border text-foreground font-semibold text-xs rounded-lg transition-colors"
                >
                  Done
                </button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateUserSubmit} className="space-y-4 py-2">
              <div>
                <label className="block text-xs font-semibold text-foreground/75 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-signal/20 focus:border-signal"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground/75 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="trader@domain.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-signal/20 focus:border-signal"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground/75 mb-1">
                  Initial Password <span className="font-normal text-muted-foreground">(Optional - auto-generated if blank)</span>
                </label>
                <input
                  type="text"
                  placeholder="Leave empty for auto-generated password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-signal/20 focus:border-signal"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground/75 mb-1">Initial Role</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as "USER" | "ADMIN" })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-signal/20 focus:border-signal"
                >
                  <option value="USER">TRADER (Standard user with algo & broker tools)</option>
                  <option value="ADMIN">ADMINISTRATOR (Full user management rights)</option>
                </select>
              </div>

              <DialogFooter className="pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-foreground/75 hover:bg-muted rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-signal hover:bg-signal/90 text-on-signal rounded-lg transition-colors"
                >
                  Create & Generate Access
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Modal 2: Reset Password Dialog ─── */}
      <Dialog open={Boolean(resetModalUser)} onOpenChange={(open) => !open && setResetModalUser(null)}>
        <DialogContent className="sm:max-w-md p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 text-signal mb-1">
              <KeyRound className="h-5 w-5" />
              <DialogTitle className="text-lg font-semibold text-foreground">Reset User Password</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Reset credentials for <strong className="text-foreground">{resetModalUser?.email}</strong>. This will immediately terminate all their active sessions.
            </DialogDescription>
          </DialogHeader>

          {generatedPassResult ? (
            <div className="space-y-4 py-3">
              <div className="p-4 rounded-lg bg-signal-subtle border border-signal/30 space-y-2">
                <p className="text-xs font-semibold text-signal">
                  New Password Generated Successfully:
                </p>
                <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-signal/30 font-mono text-sm font-semibold text-signal">
                  <span>{generatedPassResult}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedPassResult, "reset-pass")}
                    className="p-1.5 hover:bg-signal-subtle rounded text-signal transition-colors"
                    title="Copy"
                  >
                    {copiedKey === "reset-pass" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => {
                    setResetModalUser(null);
                    setGeneratedPassResult(null);
                  }}
                  className="w-full py-2 bg-muted hover:bg-border text-foreground font-semibold text-xs rounded-lg transition-colors"
                >
                  Close
                </button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleResetPasswordSubmit} className="space-y-4 py-2">
              <div>
                <label className="block text-xs font-semibold text-foreground/75 mb-1">
                  New Password <span className="font-normal text-muted-foreground">(Optional - auto-generated if blank)</span>
                </label>
                <input
                  type="text"
                  placeholder="Leave empty to auto-generate"
                  value={customNewPass}
                  onChange={(e) => setCustomNewPass(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-signal/20 focus:border-signal"
                />
              </div>

              <DialogFooter className="pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-foreground/75 hover:bg-muted rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-signal hover:bg-signal/90 text-on-signal rounded-lg transition-colors"
                >
                  Confirm & Reset
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Confirm Dialog ─── */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        onConfirm={confirmDialog.action}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant={confirmDialog.variant}
        confirmText={confirmDialog.confirmText}
      />
    </div>
  );
}
