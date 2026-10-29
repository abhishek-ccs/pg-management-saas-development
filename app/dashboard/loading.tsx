import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton'

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#faf8f5] p-6">
      <DashboardSkeleton />
    </div>
  )
}
