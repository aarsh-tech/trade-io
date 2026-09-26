"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store";
import { Lock, User, Shield, Key, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useUser, use2FA } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const { updateProfile, isUpdatingProfile, changePassword, isChangingPassword } = useUser();
  const { setup2FA, isSettingUp, verify2FA, isVerifying, disable2FA, isDisabling } = use2FA();

  const [activeTab, setActiveTab] = useState<"profile" | "security">("profile");
  const [profileForm, setProfileForm] = useState({ name: user?.name || "" });

  useEffect(() => {
    if (user?.name) {
      setProfileForm({ name: user.name });
    }
  }, [user?.name]);

  const [passwordForm, setPasswordForm] = useState({ current: "", newPassword: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    newPassword: false,
    confirm: false,
  });

  const toggleShowPassword = (field: "current" | "newPassword" | "confirm") => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [setup2faCode, setSetup2faCode] = useState("");

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({ name: profileForm.name });
    } catch {
      // error handled in hook
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    try {
      await changePassword({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ current: "", newPassword: "", confirm: "" });
      setShowPasswords({ current: false, newPassword: false, confirm: false });
    } catch {
      // error handled in hook
    }
  };

  const onInit2FASetup = async () => {
    const res = await setup2FA();
    setQrCode(res.data.data.qrCode);
  };

  const onVerify2FASetup = async () => {
    await verify2FA(setup2faCode);
    setQrCode(null);
    updateUser({ twoFaEnabled: true });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-[fade-up_0.4s_ease_both]">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account settings, personal details, and two-factor authentication security
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-2">
          <button
            onClick={() => setActiveTab("profile")}
            className={cn(
              "w-full text-left px-4 py-2.5 rounded-lg font-medium border flex items-center gap-3 transition-all",
              activeTab === "profile"
                ? "bg-brand-subtle text-accent-foreground border-primary/30  font-semibold"
                : "text-foreground/75 border-transparent hover:bg-muted/50"
            )}
          >
            <User className="h-4 w-4 text-accent-foreground" /> Profile
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={cn(
              "w-full text-left px-4 py-2.5 rounded-lg font-medium border flex items-center gap-3 transition-all",
              activeTab === "security"
                ? "bg-brand-subtle text-accent-foreground border-primary/30  font-semibold"
                : "text-foreground/75 border-transparent hover:bg-muted/50"
            )}
          >
            <Lock className="h-4 w-4 text-accent-foreground" /> Security & 2FA
          </button>
        </div>

        <div className="md:col-span-2 space-y-6">

          {activeTab === "profile" && (
            <Card className="border-border/90 bg-card rounded-lg">
              <CardHeader>
                <CardTitle>Profile Details</CardTitle>
                <CardDescription>Update your personal information.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground/75">Full Name</label>
                    <input
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-foreground/75">Email Address</label>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                        <Lock className="h-3 w-3 text-muted-foreground" /> Locked
                      </span>
                    </div>
                    <input
                      type="email"
                      value={user?.email || ""}
                      disabled
                      readOnly
                      className="w-full h-10 px-3 rounded-lg border border-border bg-muted/90 text-muted-foreground font-mono text-sm cursor-not-allowed select-none focus:outline-none"
                    />
                    <p className="text-xs text-muted-foreground">Your account email address cannot be changed.</p>
                  </div>
                  <Button type="submit" className="bg-primary hover:bg-brand-hover text-primary-foreground" disabled={isUpdatingProfile}>
                    {isUpdatingProfile ? "Saving..." : "Save Changes"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === "security" && (
            <>
              <Card className="border-border/90 bg-card rounded-lg">
                <CardHeader>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>Ensure your account is using a long, random password to stay secure.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePasswordUpdate} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground/75">Current Password</label>
                      <div className="relative">
                        <input
                          type={showPasswords.current ? "text" : "password"}
                          value={passwordForm.current}
                          onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                          className="w-full h-10 pl-3 pr-10 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowPassword("current")}
                          className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground/75 focus:outline-none transition-colors"
                          aria-label={showPasswords.current ? "Hide current password" : "Show current password"}
                        >
                          {showPasswords.current ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-foreground/75">New Password</label>
                        <div className="relative">
                          <input
                            type={showPasswords.newPassword ? "text" : "password"}
                            value={passwordForm.newPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                            className="w-full h-10 pl-3 pr-10 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => toggleShowPassword("newPassword")}
                            className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground/75 focus:outline-none transition-colors"
                            aria-label={showPasswords.newPassword ? "Hide new password" : "Show new password"}
                          >
                            {showPasswords.newPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-foreground/75">Confirm Password</label>
                        <div className="relative">
                          <input
                            type={showPasswords.confirm ? "text" : "password"}
                            value={passwordForm.confirm}
                            onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                            className="w-full h-10 pl-3 pr-10 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => toggleShowPassword("confirm")}
                            className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground/75 focus:outline-none transition-colors"
                            aria-label={showPasswords.confirm ? "Hide confirm password" : "Show confirm password"}
                          >
                            {showPasswords.confirm ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    <Button type="submit" variant="outline" className="border-border hover:bg-muted/50 text-foreground/75 font-semibold" disabled={isChangingPassword}>
                      {isChangingPassword ? "Updating..." : "Update Password"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-accent-foreground" />
                    <CardTitle>Two-Factor Authentication</CardTitle>
                  </div>
                  <CardDescription>Add additional security to your account using 2FA.</CardDescription>
                </CardHeader>
                <CardContent>
                  {user?.twoFaEnabled ? (
                    <div className="bg-profit-subtle text-profit p-4 rounded-lg flex items-center justify-between border border-profit/30">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-profit-subtle flex items-center justify-center">
                          <Shield className="h-4 w-4 text-profit" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">2FA is Enabled</p>
                          <p className="text-xs opacity-80">Your account is well protected.</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="border-loss/30 text-loss hover:bg-loss-subtle hover:text-loss"
                        onClick={async () => {
                          if (confirm("Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.")) {
                            await disable2FA();
                            updateUser({ twoFaEnabled: false });
                          }
                        }}
                        disabled={isDisabling}
                      >
                        {isDisabling ? "Disabling..." : "Disable 2FA"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {!qrCode ? (
                        <Button onClick={onInit2FASetup} disabled={isSettingUp} className="bg-foreground hover:bg-foreground/90 text-background gap-2">
                          <Key className="h-4 w-4" /> {isSettingUp ? "Generating..." : "Setup 2FA"}
                        </Button>
                      ) : (
                        <div className="p-4 border border-border rounded-lg bg-muted/50 space-y-6">
                          <div className="text-center">
                            <p className="text-sm font-semibold text-foreground mb-2">1. Scan this QR Code with your Authenticator App</p>
                            <div className="flex justify-center p-4 bg-card rounded-lg border border-border mx-auto w-fit">
                              <img src={qrCode} alt="2FA QR Code" className="w-40 h-40" />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-sm font-semibold text-foreground text-center">2. Enter the 6-digit code</p>
                            <div className="flex gap-2 max-w-[240px] mx-auto">
                              <input
                                type="text"
                                placeholder="000000"
                                maxLength={6}
                                value={setup2faCode}
                                onChange={(e) => setSetup2faCode(e.target.value)}
                                className="w-full h-12 text-center text-xl tracking-[0.5em] rounded-lg border border-border focus:ring-2 focus:ring-primary focus:outline-none font-mono font-semibold text-foreground"
                              />
                            </div>
                            <Button onClick={onVerify2FASetup} disabled={isVerifying} className="w-full max-w-[240px] mx-auto block bg-primary hover:bg-brand-hover text-primary-foreground">
                              {isVerifying ? "Verifying..." : "Verify & Enable"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
