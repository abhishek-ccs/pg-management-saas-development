/**
 * Enterprise Structured Logging Utility
 * Ensures consistent JSON log formatting across server, edge, and client environments.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
  error?: {
    name?: string
    message?: string
    stack?: string
  }
}

function formatLog(level: LogLevel, message: string, context?: Record<string, unknown>, error?: unknown): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  }

  if (context && Object.keys(context).length > 0) {
    entry.context = context
  }

  if (error instanceof Error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }
  } else if (error) {
    entry.error = {
      message: String(error),
    }
  }

  return entry
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(JSON.stringify(formatLog('debug', message, context)))
    }
  },

  info(message: string, context?: Record<string, unknown>) {
    console.info(JSON.stringify(formatLog('info', message, context)))
  },

  warn(message: string, context?: Record<string, unknown>, error?: unknown) {
    console.warn(JSON.stringify(formatLog('warn', message, context, error)))
  },

  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    console.error(JSON.stringify(formatLog('error', message, context, error)))
  },
}
