"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store";
import { Lock, User, Shield, Key } from "lucide-react";
import { toast } from "sonner";
import { useUser, use2FA } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const { updateProfile, isUpdatingProfile, changePassword, isChangingPassword } = useUser();
  const { setup2FA, isSettingUp, verify2FA, isVerifying } = use2FA();

  const [profileForm, setProfileForm] = useState({ name: user?.name || "", email: user?.email || "" });
  const [passwordForm, setPasswordForm] = useState({ current: "", newPassword: "", confirm: "" });
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [setup2faCode, setSetup2faCode] = useState("");

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(profileForm);
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
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-2">
          <button className="w-full text-left px-4 py-2.5 rounded-lg bg-blue-50 text-blue-700 font-medium border border-blue-100 flex items-center gap-3">
            <User className="h-4 w-4" /> Profile
          </button>
          <button className="w-full text-left px-4 py-2.5 rounded-lg text-slate-600 font-medium border border-transparent hover:bg-slate-50 flex items-center gap-3 transition">
            <Lock className="h-4 w-4" /> Security
          </button>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Full Name</label>
                  <input
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Email Address</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={isUpdatingProfile}>
                  {isUpdatingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Ensure your account is using a long, random password to stay secure.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Current Password</label>
                  <input
                    type="password"
                    value={passwordForm.current}
                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">New Password</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">Confirm Password</label>
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" variant="outline" className="border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold" disabled={isChangingPassword}>
                  {isChangingPassword ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <CardTitle>Two-Factor Authentication</CardTitle>
              </div>
              <CardDescription>Add additional security to your account using 2FA.</CardDescription>
            </CardHeader>
            <CardContent>
              {user?.twoFaEnabled ? (
                <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center justify-between border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-green-200 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-green-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">2FA is Enabled</p>
                      <p className="text-xs opacity-80">Your account is well protected.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {!qrCode ? (
                    <Button onClick={onInit2FASetup} disabled={isSettingUp} className="bg-slate-900 hover:bg-black text-white gap-2">
                      <Key className="h-4 w-4" /> {isSettingUp ? "Generating..." : "Setup 2FA"}
                    </Button>
                  ) : (
                    <div className="p-6 border border-slate-200 rounded-xl bg-slate-50 space-y-6">
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-900 mb-2">1. Scan this QR Code with your Authenticator App</p>
                        <div className="flex justify-center p-4 bg-white rounded-lg shadow-sm border border-slate-100 mx-auto w-fit">
                          <img src={qrCode} alt="2FA QR Code" className="w-40 h-40" />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-slate-900 text-center">2. Enter the 6-digit code</p>
                        <div className="flex gap-2 max-w-[240px] mx-auto">
                          <input
                            type="text"
                            placeholder="000000"
                            maxLength={6}
                            value={setup2faCode}
                            onChange={(e) => setSetup2faCode(e.target.value)}
                            className="w-full h-12 text-center text-xl tracking-[0.5em] rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono font-bold text-slate-900"
                          />
                        </div>
                        <Button onClick={onVerify2FASetup} disabled={isVerifying} className="w-full max-w-[240px] mx-auto block bg-blue-600 hover:bg-blue-700 text-white">
                          {isVerifying ? "Verifying..." : "Verify & Enable"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
