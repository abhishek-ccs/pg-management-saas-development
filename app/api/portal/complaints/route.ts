import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/tenant-access'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST: Lodge a new maintenance or service complaint from Resident Portal
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getTenantSession()

    if (!session || !session.tenantId || !session.ownerId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Session has expired or is invalid.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const body = await request.json()
    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim()
    const rawPriority = String(body.priority || 'Medium').trim()

    if (!title || title.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Please provide a clear issue summary (minimum 3 characters).' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (title.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Issue summary cannot exceed 200 characters.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const priority: 'High' | 'Medium' | 'Low' =
      rawPriority === 'High' ? 'High' : rawPriority === 'Low' ? 'Low' : 'Medium'

    const admin = await createAdminClient()

    // Query tenant to verify identity and link property
    const { data: tenant, error: tenantErr } = await admin
      .from('tenants')
      .select('id, full_name, property_id')
      .eq('id', session.tenantId)
      .eq('owner_id', session.ownerId)
      .maybeSingle()

    if (tenantErr || !tenant) {
      return NextResponse.json(
        { success: false, error: 'Resident record could not be verified.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const { data: complaint, error: insertErr } = await admin
      .from('complaints')
      .insert({
        owner_id: session.ownerId,
        tenant_id: session.tenantId,
        property_id: tenant.property_id || null,
        tenant: tenant.full_name,
        title,
        description: description || null,
        priority,
        status: 'Open',
      })
      .select('id, title, description, priority, status, resolved_at, created_at, updated_at')
      .single()

    if (insertErr || !complaint) {
      return NextResponse.json(
        { success: false, error: insertErr?.message || 'Database error while registering complaint.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Complaint ticket submitted successfully to property management.',
        complaint: {
          id: complaint.id,
          title: complaint.title,
          description: complaint.description || '',
          priority: complaint.priority,
          status: complaint.status,
          resolvedAt: complaint.resolved_at || null,
          createdAt: complaint.created_at,
          updatedAt: complaint.updated_at,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    )
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while logging complaint.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

/**
 * PATCH: Update complaint (e.g. resident marks ticket as resolved or updates remarks)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getTenantSession()

    if (!session || !session.tenantId || !session.ownerId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Session has expired or is invalid.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const body = await request.json()
    const complaintId = String(body.id || '').trim()
    const newStatus = body.status ? String(body.status).trim() : null
    const additionalNotes = body.description ? String(body.description).trim() : null

    if (!complaintId) {
      return NextResponse.json(
        { success: false, error: 'Complaint ID is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const admin = await createAdminClient()

    // Strictly verify ownership and cross-tenant barrier
    const { data: existing, error: findErr } = await admin
      .from('complaints')
      .select('id, tenant_id, status, description')
      .eq('id', complaintId)
      .eq('owner_id', session.ownerId)
      .maybeSingle()

    if (findErr || !existing) {
      return NextResponse.json(
        { success: false, error: 'Ticket not found or unauthorized.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Verify this complaint belongs strictly to this resident
    if (existing.tenant_id && existing.tenant_id !== session.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: You can only update your own tickets.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (newStatus && ['Open', 'In progress', 'Resolved'].includes(newStatus)) {
      updatePayload.status = newStatus
      if (newStatus === 'Resolved') {
        updatePayload.resolved_at = new Date().toISOString()
      } else {
        updatePayload.resolved_at = null
      }
    }

    if (additionalNotes) {
      updatePayload.description = existing.description
        ? `${existing.description}\n[Resident Update]: ${additionalNotes}`
        : additionalNotes
    }

    const { data: updated, error: updateErr } = await admin
      .from('complaints')
      .update(updatePayload)
      .eq('id', complaintId)
      .select('id, title, description, priority, status, resolved_at, created_at, updated_at')
      .single()

    if (updateErr || !updated) {
      return NextResponse.json(
        { success: false, error: updateErr?.message || 'Failed to update complaint.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Complaint updated successfully.',
      complaint: {
        id: updated.id,
        title: updated.title,
        description: updated.description || '',
        priority: updated.priority,
        status: updated.status,
        resolvedAt: updated.resolved_at || null,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while updating complaint.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
