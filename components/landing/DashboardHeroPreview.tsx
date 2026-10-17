'use client'

import React from 'react'
import {
  Wallet,
  Clock,
  BedDouble,
  Users,
  CheckCircle2,
  AlertCircle,
  FileText,
  TrendingUp,
  Share2,
  Calendar,
  Building2,
  Search,
  ArrowUpRight,
} from 'lucide-react'

export function DashboardHeroPreview() {
  return (
    <div className="relative w-full rounded-2xl sm:rounded-3xl border border-[#e2d5c3] bg-white shadow-[0_20px_50px_rgba(112,82,48,0.12)] overflow-hidden">
      {/* App Window Header / Top Bar */}
      <div className="flex items-center justify-between border-b border-[#eee4d7] bg-[#faf6f0] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[#ef4444]/80 inline-block" />
            <span className="size-2.5 rounded-full bg-[#f59e0b]/80 inline-block" />
            <span className="size-2.5 rounded-full bg-[#10b981]/80 inline-block" />
          </div>
          <div className="hidden xs:flex items-center gap-2 pl-2 border-l border-[#e5d8c7] text-xs font-semibold text-[#5c4a3b]">
            <Building2 className="size-3.5 text-[#9a7651]" />
            <span>GreenPark Heights · Tower A</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8c8b4] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#7c634d]">
            <span className="size-1.5 rounded-full bg-[#16a34a] animate-pulse" />
            <span>October 2026</span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-[#8b5a2b] px-2.5 py-1 text-[11px] font-semibold text-white shadow-2xs">
            + Log Rent
          </span>
        </div>
      </div>

      <div className="p-3 sm:p-5 space-y-3.5 sm:space-y-5 bg-[#fcfbfa]">
        {/* Metric Cards Grid (4 items) */}
        <div className="grid grid-cols-1 min-[340px]:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {/* 1. Monthly Rent Collected */}
          <div className="rounded-xl border border-[#eee4d7] bg-white p-3 sm:p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-[#857668]">
              <span className="text-[11px] font-medium">Monthly Rent Collected</span>
              <div className="grid size-6 place-items-center rounded-lg bg-[#f5ede3] text-[#9a7651]">
                <Wallet className="size-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-[#2C221E]">
                ₹1,84,500
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[#15803d]">
              <TrendingUp className="size-3" />
              <span>92% collected</span>
            </div>
          </div>

          {/* 2. Pending Dues */}
          <div className="rounded-xl border border-[#eee4d7] bg-white p-3 sm:p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-[#857668]">
              <span className="text-[11px] font-medium">Pending Dues</span>
              <div className="grid size-6 place-items-center rounded-lg bg-[#fff1f2] text-[#e11d48]">
                <Clock className="size-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-[#9f1239]">
                ₹24,000
              </span>
            </div>
            <div className="mt-1 text-[10px] text-[#857668]">
              4 tenants pending
            </div>
          </div>

          {/* 3. Occupied Beds */}
          <div className="rounded-xl border border-[#eee4d7] bg-white p-3 sm:p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-[#857668]">
              <span className="text-[11px] font-medium">Occupied Beds</span>
              <div className="grid size-6 place-items-center rounded-lg bg-[#f5ede3] text-[#9a7651]">
                <BedDouble className="size-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-[#2C221E]">
                28
              </span>
              <span className="text-xs text-[#857668]">/ 32</span>
            </div>
            <div className="mt-1 text-[10px] font-medium text-[#7c634d]">
              87.5% occupancy
            </div>
          </div>

          {/* 4. Active Tenants */}
          <div className="rounded-xl border border-[#eee4d7] bg-white p-3 sm:p-3.5 shadow-2xs">
            <div className="flex items-center justify-between text-[#857668]">
              <span className="text-[11px] font-medium">Active Tenants</span>
              <div className="grid size-6 place-items-center rounded-lg bg-[#f5ede3] text-[#9a7651]">
                <Users className="size-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-[#2C221E]">
                28
              </span>
            </div>
            <div className="mt-1 text-[10px] text-[#15803d] flex items-center gap-0.5">
              <CheckCircle2 className="size-3" />
              <span>100% verified</span>
            </div>
          </div>
        </div>

        {/* Split Section: Rent Overview Table (Left) + Recent Activity Panel (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 items-start">
          {/* Rent Overview Table (8 cols on lg) */}
          <div className="lg:col-span-8 rounded-xl border border-[#eee4d7] bg-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#f0e7dc]">
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-[#2C221E]">Rent Overview</h2>
                <p className="text-[10px] text-[#857668]">Current billing cycle entries</p>
              </div>
              <span className="text-[10px] font-semibold text-[#9a7651] bg-[#fbf6ef] px-2 py-0.5 rounded-md border border-[#eee4d7]">
                Live Ledger
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-xs mt-1" role="table" aria-label="Sample Rent Overview">
                <thead>
                  <tr className="text-[10.5px] font-medium text-[#8c7b6c] border-b border-[#f4ede3]">
                    <th className="py-2 pr-2">Tenant / Room</th>
                    <th className="py-2 px-2">Rent</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 pl-2 text-right">Receipt / Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f7f2ea]">
                  {/* Row 1: Paid */}
                  <tr className="text-[11.5px] hover:bg-[#faf7f2]/60 transition-colors">
                    <td className="py-2.5 pr-2">
                      <div className="font-semibold text-[#2C221E]">Rahul Sharma</div>
                      <div className="text-[10px] text-[#857668]">Room 102 · Bed A</div>
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-[#2C221E]">₹8,500</td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold text-[#15803d]">
                        <span className="size-1.5 rounded-full bg-[#16a34a]" />
                        Paid
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[#9a7651]">
                        <FileText className="size-3" />
                        <span>#1042</span>
                      </span>
                    </td>
                  </tr>

                  {/* Row 2: Due Soon */}
                  <tr className="text-[11.5px] hover:bg-[#faf7f2]/60 transition-colors">
                    <td className="py-2.5 pr-2">
                      <div className="font-semibold text-[#2C221E]">Priya Patel</div>
                      <div className="text-[10px] text-[#857668]">Room 204 · Bed B</div>
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-[#2C221E]">₹9,000</td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-bold text-[#b45309]">
                        <span className="size-1.5 rounded-full bg-[#f59e0b]" />
                        Due
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 text-right text-[10.5px] text-[#857668]">
                      Due in 3 days
                    </td>
                  </tr>

                  {/* Row 3: Overdue */}
                  <tr className="text-[11.5px] hover:bg-[#faf7f2]/60 transition-colors">
                    <td className="py-2.5 pr-2">
                      <div className="font-semibold text-[#2C221E]">Amit Verma</div>
                      <div className="text-[10px] text-[#857668]">Room 105 · Bed A</div>
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-[#9f1239]">₹8,500</td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2 py-0.5 text-[10px] font-bold text-[#b91c1c]">
                        <span className="size-1.5 rounded-full bg-[#ef4444]" />
                        Overdue
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 text-right text-[10.5px] font-medium text-[#b91c1c]">
                      5d late · Reminded
                    </td>
                  </tr>

                  {/* Row 4: Paid */}
                  <tr className="text-[11.5px] hover:bg-[#faf7f2]/60 transition-colors">
                    <td className="py-2.5 pr-2">
                      <div className="font-semibold text-[#2C221E]">Sneha Reddy</div>
                      <div className="text-[10px] text-[#857668]">Room 301 · Bed C</div>
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-[#2C221E]">₹7,500</td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold text-[#15803d]">
                        <span className="size-1.5 rounded-full bg-[#16a34a]" />
                        Paid
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[#9a7651]">
                        <FileText className="size-3" />
                        <span>#1043</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Activity Panel (4 cols on lg) */}
          <div className="lg:col-span-4 rounded-xl border border-[#eee4d7] bg-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#f0e7dc]">
              <h2 className="text-xs sm:text-sm font-bold text-[#2C221E]">Recent Activity</h2>
              <span className="text-[10px] text-[#857668]">Real-time</span>
            </div>

            <div className="mt-3 space-y-2.5 text-[11px]">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 size-1.5 rounded-full bg-[#16a34a] shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-[#2C221E]">₹8,500 UPI received</p>
                  <p className="text-[10px] text-[#857668]">Rahul Sharma · Room 102</p>
                  <span className="text-[9.5px] text-[#a19385]">12m ago</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-0.5 size-1.5 rounded-full bg-[#8b5a2b] shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-[#2C221E]">WhatsApp receipt sent</p>
                  <p className="text-[10px] text-[#857668]">Auto-delivered to Sneha R.</p>
                  <span className="text-[9.5px] text-[#a19385]">35m ago</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-0.5 size-1.5 rounded-full bg-[#f59e0b] shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-[#2C221E]">Rent reminder sent</p>
                  <p className="text-[10px] text-[#857668]">Priya Patel · Due in 3d</p>
                  <span className="text-[9.5px] text-[#a19385]">2h ago</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span className="mt-0.5 size-1.5 rounded-full bg-[#64748b] shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-[#2C221E]">Bed allocated</p>
                  <p className="text-[10px] text-[#857668]">Room 108 · Bed B</p>
                  <span className="text-[9.5px] text-[#a19385]">Yesterday</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardHeroPreview
