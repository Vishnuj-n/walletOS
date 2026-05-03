"use client"

import React, { useState } from "react"
import {
  Users,
  Search,
  Activity,
  ShieldCheck,
  CreditCard,
  Key,
  MoreHorizontal,
  RefreshCcw,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  Terminal,
  Database,
} from "lucide-react"

/* ------------------ Mock Data ------------------ */
const SYSTEM_METRICS = {
  totalLiability: "₹1,24,50,000",
  activeTenants: 42,
  transactions24h: 12504,
  apiSuccessRate: "99.98%",
}

const TENANTS = [
  {
    id: "tnt_01",
    name: "Zomato Rewards",
    email: "ops@zomato.com",
    wallets: { live: 1250, sandbox: 450 },
    status: "active",
  },
  {
    id: "tnt_02",
    name: "Uber Credits",
    email: "finance@uber.com",
    wallets: { live: 8400, sandbox: 1200 },
    status: "active",
  },
  {
    id: "tnt_03",
    name: "Nykaa Loyalty",
    email: "tech@nykaa.com",
    wallets: { live: 320, sandbox: 80 },
    status: "warning",
  },
]

const AUDIT_FEED = [
  {
    id: 1,
    action: "tenant.key_rotated",
    actor: "admin@walletos.io",
    target: "Zomato Rewards",
    time: "2 mins ago",
  },
  {
    id: 2,
    action: "wallet.frozen",
    actor: "support@uber.com",
    target: "wlt_9932",
    time: "15 mins ago",
  },
]

/* ------------------ Color Fix ------------------ */
const colorMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
}

/* ------------------ Components ------------------ */

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "blue",
}: any) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex justify-between mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        {trend && (
          <span className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-600">
            {trend}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500">{title}</p>
      <h3 className="text-lg font-bold text-slate-900">{value}</h3>
    </div>
  )
}

function NavItem({ icon: Icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
        active
          ? "bg-blue-600 text-white"
          : "text-slate-400 hover:bg-slate-800 hover:text-white"
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  )
}

function ActionButton({ icon: Icon, label }: any) {
  return (
    <button className="p-3 rounded-lg bg-white/10 hover:bg-white/20 flex flex-col items-center gap-1">
      <Icon size={16} />
      <span className="text-[10px]">{label}</span>
    </button>
  )
}

/* ------------------ Main ------------------ */

export default function DashboardUI() {
  const [activeTab, setActiveTab] = useState("overview")

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 text-white flex flex-col">
        <div className="p-5 font-bold text-lg">WalletOS Pro</div>

        <nav className="px-3 space-y-1">
          <NavItem
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
            icon={Activity}
            label="Overview"
          />
          <NavItem icon={Users} label="Tenants" />
          <NavItem icon={Search} label="Search" />
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-bold">Governance Console</h1>

          <button className="p-2 border rounded-lg hover:bg-slate-100">
            <RefreshCcw size={16} />
          </button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Liability"
            value={SYSTEM_METRICS.totalLiability}
            icon={CreditCard}
            trend="+12%"
          />
          <StatCard
            title="Active Tenants"
            value={SYSTEM_METRICS.activeTenants}
            icon={Users}
          />
          <StatCard
            title="Transactions"
            value={SYSTEM_METRICS.transactions24h}
            icon={Activity}
          />
          <StatCard
            title="API Success"
            value={SYSTEM_METRICS.apiSuccessRate}
            icon={ShieldCheck}
          />
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-4 flex justify-between items-center border-b">
            <h2 className="text-sm font-semibold">Tenants</h2>

            <button className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm">
              <Plus size={14} /> Add
            </button>
          </div>

          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 bg-slate-50">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3">Wallets</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>

            <tbody>
              {TENANTS.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="p-3">
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.id}</p>
                    </div>
                  </td>

                  <td className="p-3 text-center">
                    {t.wallets.live}/{t.wallets.sandbox}
                  </td>

                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded ${t.status === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {t.status}
                    </span>
                  </td>

                  <td className="p-3 text-right">
                    <MoreHorizontal size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Audit */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">Audit Logs</h2>

          <div className="space-y-3 text-xs">
            {AUDIT_FEED.map((log) => (
              <div key={log.id} className="flex justify-between">
                <div>
                  <p className="font-medium">{log.action}</p>
                  <p className="text-slate-500">
                    {log.actor} → {log.target}
                  </p>
                </div>
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock size={12} /> {log.time}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-blue-600 text-white p-5 rounded-xl">
          <h3 className="font-semibold mb-3">Quick Actions</h3>

          <div className="grid grid-cols-2 gap-2">
            <ActionButton icon={ShieldCheck} label="Freeze" />
            <ActionButton icon={RefreshCcw} label="Rebalance" />
            <ActionButton icon={Plus} label="Tenant" />
            <ActionButton icon={Key} label="Rotate Key" />
          </div>
        </div>
      </main>
    </div>
  )
}