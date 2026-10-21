import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOwnerEntitlements } from '@/lib/subscription'

export const runtime = 'nodejs'

/**
 * GET /api/properties
 * Returns the authenticated customer's properties along with their authoritative entitlement.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 })
    }

    const [entitlement, { data: properties, error: propErr }] = await Promise.all([
      getOwnerEntitlements(supabase, user.id),
      supabase
        .from('properties')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true }),
    ])

    if (propErr) {
      return NextResponse.json({ error: propErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      entitlement,
      properties: properties || [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error.' }, { status: 500 })
  }
}

/**
 * POST /api/properties
 * Creates a new property if the customer's subscription entitlement permits it.
 * Strictly blocks requests exceeding the plan's property limit (HTTP 403).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const name = body.name?.trim()

    if (!name) {
      return NextResponse.json({ error: 'Property name is required.' }, { status: 400 })
    }

    // Server-side Authoritative Entitlement Verification
    const entitlement = await getOwnerEntitlements(supabase, user.id)
    if (!entitlement.canCreateProperty) {
      return NextResponse.json(
        {
          error:
            entitlement.reason ||
            `Your subscription allows up to ${entitlement.maxProperties} properties. Please upgrade your plan for additional capacity.`,
          code: 'PROPERTY_LIMIT_REACHED',
          entitlement,
        },
        { status: 403 }
      )
    }

    const insertPayload: Record<string, any> = {
      owner_id: user.id,
      name,
      address: body.address?.trim() || null,
      contact_number: body.contact?.trim() || body.contact_number?.trim() || null,
      city: body.city?.trim() || null,
      rules: body.rules || null,
      upi_id: body.upiId?.trim() || body.upi_id?.trim() || null,
      payment_link: body.paymentLink?.trim() || body.payment_link?.trim() || null,
      upi_qr_url: body.qrCodeUrl?.trim() || body.upi_qr_url?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { data: newProp, error: insertErr } = await supabase
      .from('properties')
      .insert(insertPayload)
      .select('id,name,address,contact_number,city,rules,upi_id,payment_link,upi_qr_url')
      .single()

    if (insertErr) {
      if (insertErr.code === 'P0002' || insertErr.message?.includes('Property limit reached')) {
        return NextResponse.json(
          {
            error:
              `Property limit reached. Your subscription includes up to ${entitlement.maxProperties} properties. Please upgrade your plan to add more properties.`,
            code: 'PROPERTY_LIMIT_REACHED',
          },
          { status: 403 }
        )
      }
      if (insertErr.message?.includes('uq_properties_owner') || insertErr.code === '23505') {
        return NextResponse.json(
          {
            error:
              'Legacy database constraint "uq_properties_owner" detected. Please execute migration 20261021000001_fix_multi_property_constraint.sql to allow multiple properties.',
            code: 'LEGACY_CONSTRAINT_ERROR',
          },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    const updatedEntitlement = {
      ...entitlement,
      activePropertyCount: entitlement.activePropertyCount + 1,
      remainingPropertySlots: Math.max(0, entitlement.remainingPropertySlots - 1),
      canCreateProperty: entitlement.activePropertyCount + 1 < entitlement.maxProperties,
      isOverLimit: entitlement.activePropertyCount + 1 > entitlement.maxProperties,
    }

    return NextResponse.json(
      {
        success: true,
        property: newProp,
        entitlement: updatedEntitlement,
      },
      { status: 201 }
    )
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error.' }, { status: 500 })
  }
}
