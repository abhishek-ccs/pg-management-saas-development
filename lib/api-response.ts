import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'CONFLICT'
  | 'PAYMENT_REQUIRED'
  | 'INTERNAL_ERROR'

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  timestamp: string
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: ApiErrorCode
    message: string
    details?: unknown
  }
  timestamp: string
}

export function apiSuccess<T>(data: T, status: number = 200, headers: HeadersInit = {}): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    },
    { status, headers }
  )
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number = 400,
  details?: unknown,
  headers: HeadersInit = {}
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
      timestamp: new Date().toISOString(),
    },
    { status, headers }
  )
}
