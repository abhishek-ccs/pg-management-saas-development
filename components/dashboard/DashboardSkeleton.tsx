export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading dashboard records">
      {/* Overview Top Bar Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-xl bg-[#ebe4da]" />
          <div className="h-4 w-72 rounded-lg bg-[#f0e9df]" />
        </div>
        <div className="flex gap-2.5">
          <div className="h-10 w-28 rounded-xl bg-[#ebe4da]" />
          <div className="h-10 w-32 rounded-xl bg-[#dccfbf]" />
        </div>
      </div>

      {/* 4 Stat Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-[#ebe4da] bg-white p-4 sm:p-5 lg:p-6 shadow-sm space-y-3 min-w-0">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-[#f0e9df]" />
              <div className="size-8 rounded-xl bg-[#ebe4da]" />
            </div>
            <div className="h-8 w-36 rounded-lg bg-[#ebe4da]" />
            <div className="h-3 w-28 rounded bg-[#f5ede3]" />
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="rounded-2xl border border-[#ebe4da] bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#f2ede4] pb-4">
          <div className="h-5 w-44 rounded-lg bg-[#ebe4da]" />
          <div className="h-8 w-24 rounded-lg bg-[#f0e9df]" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between py-2.5 border-b border-[#faf7f2]">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-[#f0e9df]" />
                <div className="space-y-1.5">
                  <div className="h-4 w-36 rounded bg-[#ebe4da]" />
                  <div className="h-3 w-24 rounded bg-[#f5ede3]" />
                </div>
              </div>
              <div className="h-5 w-20 rounded bg-[#f0e9df]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
