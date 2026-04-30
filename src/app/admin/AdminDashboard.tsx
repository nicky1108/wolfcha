"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Coins,
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase, type Session } from "@/lib/supabase";

type AdminOverview = {
  admin: {
    email: string;
    configuredAdminCount: number;
    localDevFallback: boolean;
  };
  summary: {
    users: number;
    totalCredits: number;
    completedSessions: number;
    paymentCount: number;
    totalRevenueCents: number;
    redemptionCodeCount: number;
    redeemedCodes: number;
  };
  users: Array<{
    id: string;
    email: string;
    credits: number;
    referralCode: string;
    totalReferrals: number;
    createdAt: string;
    updatedAt: string;
  }>;
  payments: Array<{
    id: string;
    userId: string;
    email: string;
    orderId: string | null;
    providerTradeId: string | null;
    amountCents: number;
    currency: string;
    quantity: number;
    status: string;
    createdAt: string;
  }>;
  redemptionCodes: Array<{
    id: string;
    code: string;
    creditsAmount: number;
    isRedeemed: boolean;
    redeemedBy: string | null;
    redeemedEmail: string;
    redeemedAt: string | null;
    createdAt: string;
  }>;
  recentSessions: Array<{
    id: string;
    userId: string;
    email: string;
    completed: boolean;
    winner: "wolf" | "villager" | null;
    difficulty: string | null;
    modelUsed: string | null;
    usedCustomKey: boolean;
    aiCallsCount: number;
    createdAt: string;
    endedAt: string | null;
  }>;
  warnings: string[];
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amountCents: number, currency: string): string {
  const normalizedCurrency = currency.toUpperCase();
  const amount = amountCents / 100;
  if (normalizedCurrency === "CNY") return `¥${amount.toFixed(2)}`;
  return `${normalizedCurrency} ${amount.toFixed(2)}`;
}

function shortId(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-md p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-[var(--text-primary)]">{value}</p>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">{detail}</p>
        </div>
        <div className="rounded-md border border-[var(--border-color)] bg-[var(--color-accent-bg)] p-2 text-[var(--color-gold-dark)]">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  );
}

const UsersIcon = UserRound;

export function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [query, setQuery] = useState("");
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>({});
  const [generateCount, setGenerateCount] = useState("10");
  const [generateCredits, setGenerateCredits] = useState("5");
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async (accessToken: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/overview", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as Partial<AdminOverview> & { error?: string };
      if (!response.ok) {
        setOverview(null);
        setError(data.error || `Admin API error: ${response.status}`);
        return;
      }
      setOverview(data as AdminOverview);
    } catch {
      setError("无法连接管理接口");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setIsAuthLoading(false);
      if (data.session?.access_token) {
        void fetchOverview(data.session.access_token);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.access_token) {
        void fetchOverview(nextSession.access_token);
      } else {
        setOverview(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchOverview]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!overview || !normalizedQuery) return overview?.users ?? [];
    return overview.users.filter((user) => {
      return (
        user.email.toLowerCase().includes(normalizedQuery) ||
        user.id.toLowerCase().includes(normalizedQuery) ||
        user.referralCode.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [overview, query]);

  const authHeaders = useCallback(() => {
    if (!session?.access_token) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }, [session]);

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setIsSigningIn(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSigningIn(false);
    if (signInError || !data.session) {
      setError(signInError?.message || "登录失败");
      return;
    }
    setSession(data.session);
    await fetchOverview(data.session.access_token);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setOverview(null);
    setPassword("");
  };

  const refresh = async () => {
    if (session?.access_token) await fetchOverview(session.access_token);
  };

  const updateCredits = async (userId: string, payload: { credits?: number; delta?: number }) => {
    const headers = authHeaders();
    if (!headers) return;
    setBusyAction(`credits:${userId}`);
    try {
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId, ...payload }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error || "更新局数失败");
        return;
      }
      toast.success("局数已更新");
      await refresh();
    } finally {
      setBusyAction(null);
    }
  };

  const generateRedemptionCodes = async () => {
    const headers = authHeaders();
    if (!headers) return;
    setBusyAction("generate-codes");
    try {
      const response = await fetch("/api/admin/redemption-codes", {
        method: "POST",
        headers,
        body: JSON.stringify({
          count: Number(generateCount),
          creditsAmount: Number(generateCredits),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { codes?: string[]; error?: string };
      if (!response.ok || !data.codes) {
        toast.error(data.error || "生成兑换码失败");
        return;
      }
      setGeneratedCodes(data.codes);
      toast.success(`已生成 ${data.codes.length} 个兑换码`);
      await refresh();
    } finally {
      setBusyAction(null);
    }
  };

  const copyGeneratedCodes = async () => {
    if (!generatedCodes.length) return;
    await navigator.clipboard.writeText(generatedCodes.join("\n"));
    toast.success("兑换码已复制");
  };

  if (isAuthLoading) {
    return (
      <main className="min-h-screen bg-[var(--bg-main)] px-4 py-10 text-[var(--text-primary)]">
        <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center">
          <Loader2 className="animate-spin text-[var(--color-accent)]" size={28} />
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[var(--bg-main)] px-4 py-10 text-[var(--text-primary)]">
        <section className="mx-auto grid min-h-[70vh] max-w-6xl items-center">
          <Card className="mx-auto w-full max-w-md rounded-md p-6 shadow-[var(--shadow-md)]">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-md bg-[var(--color-accent-bg)] p-2 text-[var(--color-gold-dark)]">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Wolfcha Admin</h1>
                <p className="text-sm text-[var(--text-muted)]">使用管理员邮箱登录</p>
              </div>
            </div>
            <div className="space-y-3">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                autoComplete="email"
              />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleSignIn();
                }}
              />
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <Button className="w-full" onClick={() => void handleSignIn()} disabled={isSigningIn}>
                {isSigningIn ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
                登录后台
              </Button>
            </div>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-main)] px-4 py-6 text-[var(--text-primary)] md:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 border-b border-[var(--border-color)] pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-[var(--color-accent-bg)] p-2 text-[var(--color-gold-dark)]">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold leading-tight">Wolfcha Admin</h1>
                <p className="text-sm text-[var(--text-muted)]">
                  当前账号：{overview?.admin.email || session.user.email || "-"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin" : ""} size={16} />
              刷新
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
              <LogOut size={16} />
              退出
            </Button>
          </div>
        </header>

        {error && (
          <Card className="rounded-md border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-4 text-sm text-[var(--color-danger)]">
            {error === "Forbidden"
              ? "当前账号不在管理员白名单。请在服务端环境变量 ADMIN_EMAILS 中配置管理员邮箱。"
              : error}
          </Card>
        )}

        {overview && (
          <>
            {overview.warnings.length > 0 && (
              <Card className="rounded-md border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-4 text-sm text-[var(--color-warning)]">
                {overview.warnings.join("；")}
              </Card>
            )}

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={UsersIcon}
                label="用户数"
                value={String(overview.summary.users)}
                detail={`总剩余 ${overview.summary.totalCredits} 局`}
              />
              <StatCard
                icon={BadgeCheck}
                label="完成对局"
                value={String(overview.summary.completedSessions)}
                detail={`${overview.recentSessions.length} 条最近记录`}
              />
              <StatCard
                icon={CreditCard}
                label="支付订单"
                value={String(overview.summary.paymentCount)}
                detail={formatMoney(overview.summary.totalRevenueCents, "cny")}
              />
              <StatCard
                icon={Ticket}
                label="兑换码"
                value={`${overview.summary.redeemedCodes}/${overview.summary.redemptionCodeCount}`}
                detail="已兑换 / 总生成"
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="rounded-md p-4">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">用户局数</h2>
                    <p className="text-sm text-[var(--text-muted)]">搜索用户，快速加减或设置剩余局数。</p>
                  </div>
                  <div className="relative w-full md:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="邮箱 / 用户 ID / 邀请码"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] text-left text-xs uppercase text-[var(--text-muted)]">
                        <th className="py-2 pr-4 font-medium">用户</th>
                        <th className="py-2 pr-4 font-medium">剩余局数</th>
                        <th className="py-2 pr-4 font-medium">邀请码</th>
                        <th className="py-2 pr-4 font-medium">更新时间</th>
                        <th className="py-2 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => {
                        const draft = creditDrafts[user.id] ?? String(user.credits);
                        const busy = busyAction === `credits:${user.id}`;
                        return (
                          <tr key={user.id} className="border-b border-[var(--border-color)]/70">
                            <td className="py-3 pr-4">
                              <div className="font-medium">{user.email || "No email"}</div>
                              <div className="text-xs text-[var(--text-muted)]">{user.id}</div>
                            </td>
                            <td className="py-3 pr-4">
                              <span className="text-lg font-semibold">{user.credits}</span>
                            </td>
                            <td className="py-3 pr-4">
                              <div>{user.referralCode}</div>
                              <div className="text-xs text-[var(--text-muted)]">{user.totalReferrals} referrals</div>
                            </td>
                            <td className="py-3 pr-4 text-[var(--text-secondary)]">{formatDate(user.updatedAt)}</td>
                            <td className="py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button variant="outline" size="sm" disabled={busy} onClick={() => void updateCredits(user.id, { delta: 10 })}>
                                  +10
                                </Button>
                                <Button variant="outline" size="sm" disabled={busy} onClick={() => void updateCredits(user.id, { delta: -1 })}>
                                  -1
                                </Button>
                                <Input
                                  type="number"
                                  min={0}
                                  value={draft}
                                  onChange={(event) => setCreditDrafts((prev) => ({ ...prev, [user.id]: event.target.value }))}
                                  className="h-8 w-24"
                                />
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => void updateCredits(user.id, { credits: Number(draft) })}
                                >
                                  {busy ? <Loader2 className="animate-spin" size={14} /> : <Coins size={14} />}
                                  设置
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="rounded-md p-4">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">生成兑换码</h2>
                  <p className="text-sm text-[var(--text-muted)]">直接写入 redemption_codes 表。</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs text-[var(--text-muted)]">数量</span>
                    <Input type="number" min={1} max={500} value={generateCount} onChange={(event) => setGenerateCount(event.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-xs text-[var(--text-muted)]">每码局数</span>
                    <Input type="number" min={1} max={1000} value={generateCredits} onChange={(event) => setGenerateCredits(event.target.value)} />
                  </label>
                </div>
                <Button className="mt-3 w-full" onClick={() => void generateRedemptionCodes()} disabled={busyAction === "generate-codes"}>
                  {busyAction === "generate-codes" ? <Loader2 className="animate-spin" size={16} /> : <Ticket size={16} />}
                  生成兑换码
                </Button>
                {generatedCodes.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">刚生成的兑换码</p>
                      <Button variant="ghost" size="sm" onClick={() => void copyGeneratedCodes()}>
                        <Copy size={14} />
                        复制
                      </Button>
                    </div>
                    <pre className="max-h-56 overflow-auto rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-xs leading-5">
                      {generatedCodes.join("\n")}
                    </pre>
                  </div>
                )}
              </Card>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <Card className="rounded-md p-4">
                <h2 className="mb-4 text-lg font-semibold">最近支付</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] text-left text-xs uppercase text-[var(--text-muted)]">
                        <th className="py-2 pr-4 font-medium">订单</th>
                        <th className="py-2 pr-4 font-medium">用户</th>
                        <th className="py-2 pr-4 font-medium">金额</th>
                        <th className="py-2 pr-4 font-medium">局数</th>
                        <th className="py-2 pr-4 font-medium">状态</th>
                        <th className="py-2 font-medium">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.payments.map((payment) => (
                        <tr key={payment.id} className="border-b border-[var(--border-color)]/70">
                          <td className="py-3 pr-4">
                            <div>{shortId(payment.orderId)}</div>
                            <div className="text-xs text-[var(--text-muted)]">{shortId(payment.providerTradeId)}</div>
                          </td>
                          <td className="py-3 pr-4">{payment.email || shortId(payment.userId)}</td>
                          <td className="py-3 pr-4">{formatMoney(payment.amountCents, payment.currency)}</td>
                          <td className="py-3 pr-4">{payment.quantity}</td>
                          <td className="py-3 pr-4">
                            <Badge variant={payment.status === "completed" ? "success" : "secondary"}>{payment.status}</Badge>
                          </td>
                          <td className="py-3">{formatDate(payment.createdAt)}</td>
                        </tr>
                      ))}
                      {overview.payments.length === 0 && (
                        <tr>
                          <td className="py-6 text-[var(--text-muted)]" colSpan={6}>暂无支付记录</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="rounded-md p-4">
                <h2 className="mb-4 text-lg font-semibold">最近兑换码</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] text-left text-xs uppercase text-[var(--text-muted)]">
                        <th className="py-2 pr-4 font-medium">兑换码</th>
                        <th className="py-2 pr-4 font-medium">局数</th>
                        <th className="py-2 pr-4 font-medium">状态</th>
                        <th className="py-2 pr-4 font-medium">兑换用户</th>
                        <th className="py-2 font-medium">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.redemptionCodes.map((code) => (
                        <tr key={code.id} className="border-b border-[var(--border-color)]/70">
                          <td className="py-3 pr-4 font-medium">{code.code}</td>
                          <td className="py-3 pr-4">{code.creditsAmount}</td>
                          <td className="py-3 pr-4">
                            <Badge variant={code.isRedeemed ? "secondary" : "outline"}>
                              {code.isRedeemed ? "已兑换" : "未兑换"}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4">{code.redeemedEmail || shortId(code.redeemedBy)}</td>
                          <td className="py-3">{formatDate(code.redeemedAt || code.createdAt)}</td>
                        </tr>
                      ))}
                      {overview.redemptionCodes.length === 0 && (
                        <tr>
                          <td className="py-6 text-[var(--text-muted)]" colSpan={5}>暂无兑换码</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
