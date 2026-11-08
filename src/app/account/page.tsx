'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { Country, WorkspaceRole } from '../../lib/types';
import {
  Shield,
  Laptop,
  Trash2,
  LogOut,
  KeyRound,
  Building2,
  Plus,
  Users,
  CheckCircle,
  AlertCircle,
  Mail,
} from 'lucide-react';

interface DeviceSessionItem {
  id: string;
  activeWorkspaceId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastActivityAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface WorkspaceMemberItem {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  workspaceRole: WorkspaceRole;
  createdAt: string;
}

interface WorkspaceInviteItem {
  id: string;
  invitedEmail: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
}

export default function AccountPage() {
  const {
    isAuthenticated,
    isAuthLoading,
    user,
    activeWorkspace,
    workspaceRole,
    workspaces,
    authorizedFetch,
    refreshSession,
    switchWorkspace,
    t,
  } = useApp();
  const router = useRouter();

  const [sessions, setSessions] = useState<DeviceSessionItem[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberItem[]>([]);
  const [invites, setInvites] = useState<WorkspaceInviteItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  // Change email form
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [changeEmailPassword, setChangeEmailPassword] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  // Create workspace form
  const [newWsName, setNewWsName] = useState('');
  const [newWsCountry, setNewWsCountry] = useState<Country>('SA');

  // Password update form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Invite member form
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');

  const canManageMembers = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';

  const loadAccountDetails = useCallback(async () => {
    if (!isAuthenticated) return;

    const sessRes = await authorizedFetch('/api/auth/sessions');
    if (sessRes.ok) {
      const sData = await sessRes.json();
      setSessions(Array.isArray(sData.sessions) ? sData.sessions : []);
    }

    if (activeWorkspace && canManageMembers) {
      const memRes = await authorizedFetch(
        `/api/workspaces/${activeWorkspace.workspaceId}/members`
      );
      if (memRes.ok) {
        const mData = await memRes.json();
        setMembers(Array.isArray(mData.members) ? mData.members : []);
        setInvites(Array.isArray(mData.invites) ? mData.invites : []);
      }
    } else {
      setMembers([]);
      setInvites([]);
    }
  }, [isAuthenticated, authorizedFetch, activeWorkspace, canManageMembers]);

  useEffect(() => {
    void loadAccountDetails();
  }, [loadAccountDetails]);

  const handleRevokeOne = async (sessionId: string) => {
    setError(null);
    setNotice(null);
    const res = await authorizedFetch(`/api/auth/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to revoke session');
      return;
    }
    if (data.revokedCurrentSession) {
      await refreshSession();
      router.push('/login');
      return;
    }
    setNotice('Session revoked.');
    await loadAccountDetails();
  };

  const handleRevokeAll = async () => {
    setError(null);
    const res = await authorizedFetch('/api/auth/sessions/revoke-all', {
      method: 'POST',
    });
    if (res.ok) {
      await refreshSession();
      router.push('/login');
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const res = await authorizedFetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newWsName, country: newWsCountry }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to create workspace');
      return;
    }
    setNewWsName('');
    setNotice(`Created workspace "${data.workspace.workspaceName}" (0 trial credits).`);
    await switchWorkspace(data.workspace.workspaceId);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const res = await authorizedFetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to update password');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setNotice('Password updated cleanly. All previous sessions have been revoked.');
    await refreshSession();
    await loadAccountDetails();
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    setError(null);
    setNotice(null);
    const res = await authorizedFetch(
      `/api/workspaces/${activeWorkspace.workspaceId}/members`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail, role: memberRole }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to update member');
      return;
    }
    setMemberEmail('');
    if (data.status === 'INVITED') {
      setNotice(`تم إرسال دعوة بالبريد الإلكتروني إلى ${memberEmail} بصلاحية ${memberRole}.`);
    } else {
      setNotice(`Member ${memberEmail} assigned role ${memberRole}.`);
    }
    await loadAccountDetails();
  };

  const handleResendVerification = async () => {
    setIsResending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authorizedFetch('/api/auth/verify-email/resend', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to resend verification email');
        return;
      }
      setNotice(
        data.alreadyVerified
          ? 'البريد الإلكتروني مؤكد بالفعل.'
          : 'تم إرسال رابط تأكيد جديد إلى بريدك الإلكتروني بنجاح.'
      );
    } catch {
      setError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setIsResending(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChangingEmail(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authorizedFetch('/api/auth/email/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newEmail: newEmailAddress.trim(),
          password: changeEmailPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to request email change');
        return;
      }
      setNewEmailAddress('');
      setChangeEmailPassword('');
      setNotice(
        'تم إرسال رابط تأكيد إلى البريد الجديد وإشعار أمني إلى بريدك الحالي.'
      );
    } catch {
      setError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!activeWorkspace) return;
    setError(null);
    setNotice(null);
    try {
      const res = await authorizedFetch(
        `/api/workspaces/${activeWorkspace.workspaceId}/invites/${inviteId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to revoke invite');
        return;
      }
      setNotice('تم إلغاء الدعوة بنجاح.');
      await loadAccountDetails();
    } catch {
      setError('حدث خطأ في الاتصال بالخادم.');
    }
  };

  if (isAuthLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400 text-sm">
        Loading session...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-8 space-y-4">
          <Shield className="w-10 h-10 text-brand-400 mx-auto" />
          <h1 className="text-xl font-bold text-white">{t.authRequiredTitle}</h1>
          <p className="text-xs text-gray-400">{t.authRequiredStudioDesc}</p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              href="/login?next=/account"
              className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-xs font-bold"
            >
              {t.navLogin}
            </Link>
            <Link
              href="/register"
              className="px-5 py-2.5 rounded-xl bg-dark-800 text-gray-200 border border-dark-700 text-xs font-bold"
            >
              {t.navRegister}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-dark-800">
        <div>
          <h1 className="text-2xl font-extrabold text-white">{t.accountTitle}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mt-2">
            <span>{user.email}</span>
            <span>·</span>
            <span>Platform Role: <span className="font-mono text-brand-400">{user.role}</span></span>
            <span>·</span>
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-[11px]">
                <CheckCircle className="w-3 h-3" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold text-[11px]">
                  <AlertCircle className="w-3 h-3" />
                  Unverified
                </span>
                <button
                  type="button"
                  onClick={() => void handleResendVerification()}
                  disabled={isResending}
                  className="px-2.5 py-0.5 rounded bg-brand-500/20 hover:bg-brand-500/30 border border-brand-500/40 text-brand-300 text-[11px] font-medium transition-colors"
                >
                  {isResending ? 'Sending...' : 'Resend link'}
                </button>
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleRevokeAll()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{t.revokeAllSessions}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Workspaces & Create Additional Workspace */}
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-brand-400" />
            <span>{t.activeWorkspaceLabel}</span>
          </h2>

          {workspaces.length === 0 ? (
            <p className="text-xs text-gray-500">
              No merchant workspaces assigned to this account ({user.role}).
            </p>
          ) : (
            <div className="space-y-2">
              {workspaces.map((ws) => {
                const isActive = activeWorkspace?.workspaceId === ws.workspaceId;
                return (
                  <div
                    key={ws.workspaceId}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                      isActive
                        ? 'bg-brand-500/10 border-brand-500/40'
                        : 'bg-dark-950 border-dark-800'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white">{ws.workspaceName}</div>
                      <div className="text-gray-400">
                        Role: {ws.role} · {ws.planTier} · {ws.availableCredits} {t.credits} (
                        {ws.currency})
                      </div>
                    </div>
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => void switchWorkspace(ws.workspaceId)}
                        className="px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-brand-500 text-white font-semibold"
                      >
                        Switch
                      </button>
                    ) : (
                      <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                        Active
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={handleCreateWorkspace} className="pt-4 border-t border-dark-800 space-y-3">
            <h3 className="text-xs font-bold text-gray-300">{t.createWorkspaceTitle}</h3>
            <div className="flex gap-2">
              <input
                type="text"
                required
                minLength={2}
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder={t.workspaceNameLabel}
                className="flex-1 px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white focus:outline-none focus:border-brand-500"
              />
              <select
                value={newWsCountry}
                onChange={(e) => setNewWsCountry(e.target.value as Country)}
                className="px-2.5 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white"
              >
                <option value="SA">SAR</option>
                <option value="EG">EGP</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-dark-800 hover:bg-brand-500 text-white text-xs font-bold border border-dark-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.createWorkspaceBtn}</span>
            </button>
          </form>
        </div>

        {/* Active Device Sessions */}
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Laptop className="w-4 h-4 text-brand-400" />
            <span>
              {t.activeSessionsTitle} ({sessions.length})
            </span>
          </h2>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate flex items-center gap-2">
                    <span className="truncate">{s.userAgent || 'Browser Session'}</span>
                    {s.isCurrent && (
                      <span className="px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 text-[10px]">
                        {t.currentDeviceBadge}
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500">
                    IP: {s.ipAddress || 'unknown'} · Last active:{' '}
                    {new Date(s.lastActivityAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevokeOne(s.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-dark-800 hover:bg-rose-500/20 text-gray-300 hover:text-rose-300 border border-dark-700 shrink-0"
                  title={t.revokeSession}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Workspace Members (OWNER / ADMIN only) */}
        {activeWorkspace && canManageMembers && (
          <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-400" />
              <span>{t.membersTitle}</span>
            </h2>

            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.membershipId}
                  className="p-2.5 rounded-lg bg-dark-950 border border-dark-800 flex items-center justify-between text-xs"
                >
                  <span className="text-gray-200">{m.email}</span>
                  <span className="px-2 py-0.5 rounded bg-dark-800 text-brand-300 font-mono">
                    {m.workspaceRole}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleInviteMember} className="pt-3 border-t border-dark-800 flex gap-2">
              <input
                type="email"
                required
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="teammate@brand.sa"
                className="flex-1 px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white"
              />
              <select
                value={memberRole}
                onChange={(e) =>
                  setMemberRole(e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')
                }
                className="px-2 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white"
              >
                {workspaceRole === 'OWNER' && <option value="ADMIN">ADMIN</option>}
                <option value="MEMBER">MEMBER</option>
                <option value="VIEWER">VIEWER</option>
              </select>
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-bold"
              >
                Add
              </button>
            </form>

            {invites.length > 0 && (
              <div className="pt-3 border-t border-dark-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400">
                  {t.pendingInvitesTitle || 'Pending Invitations:'}
                </span>
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2 rounded-lg bg-dark-950/60 border border-dark-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="truncate text-gray-300">
                      <span>{inv.invitedEmail}</span>
                      <span className="ms-2 px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-mono text-[10px]">
                        {inv.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevokeInvite(inv.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Change Email Address */}
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Mail className="w-4 h-4 text-brand-400" />
            <span>تغيير البريد الإلكتروني / Change Email</span>
          </h2>
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <input
              type="email"
              required
              value={newEmailAddress}
              onChange={(e) => setNewEmailAddress(e.target.value)}
              placeholder="new.email@example.com"
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white"
            />
            <input
              type="password"
              required
              value={changeEmailPassword}
              onChange={(e) => setChangeEmailPassword(e.target.value)}
              placeholder={t.currentPasswordLabel}
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white"
            />
            <button
              type="submit"
              disabled={isChangingEmail}
              className="w-full py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 text-white font-bold text-xs transition-colors"
            >
              {isChangingEmail ? 'Submitting...' : 'طلب تغيير البريد / Request Email Change'}
            </button>
          </form>
        </div>

        {/* Password Rotation */}
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-brand-400" />
            <span>{t.changePasswordTitle}</span>
          </h2>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t.currentPasswordLabel}
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white"
            />
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.newPasswordLabel}
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-xs"
            >
              {t.updatePasswordBtn}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
