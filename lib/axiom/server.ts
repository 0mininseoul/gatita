import 'server-only'

import { Axiom } from '@axiomhq/js'
import { AxiomJSTransport, ConsoleTransport, Logger, LogLevel, type Transport } from '@axiomhq/logging'

type RouteHandler<TContext = unknown> = (
  request: Request,
  context: TContext,
) => Response | Promise<Response>

const serviceName = process.env.AXIOM_SERVICE_NAME || 'gatita'
const dataset = process.env.AXIOM_DATASET
const token = process.env.AXIOM_TOKEN

const transports: [Transport, ...Transport[]] = [
  new ConsoleTransport({
    prettyPrint: process.env.NODE_ENV !== 'production',
    logLevel: process.env.NODE_ENV === 'production' ? LogLevel.warn : LogLevel.info,
  }),
]

if (token && dataset) {
  transports.push(
    new AxiomJSTransport({
      axiom: new Axiom({
        token,
        onError(error) {
          console.error('Axiom ingest error:', error)
        },
      }),
      dataset,
      logLevel: LogLevel.info,
    }),
  )
}

export const logger = new Logger({
  transports,
  logLevel: LogLevel.info,
})

function getRoutePath(request: Request) {
  try {
    return new URL(request.url).pathname
  } catch {
    return 'unknown'
  }
}

function getErrorFields(error: unknown) {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    }
  }

  return {
    errorName: 'UnknownError',
    errorMessage: String(error),
  }
}

export function withAxiomRoute<TContext = unknown>(handler: RouteHandler<TContext>) {
  return async (request: Request, context: TContext) => {
    const startedAt = Date.now()
    const route = getRoutePath(request)

    try {
      const response = await handler(request, context)
      const durationMs = Date.now() - startedAt
      const level = response.status >= 500 ? LogLevel.error : response.status >= 400 ? LogLevel.warn : LogLevel.info

      logger.log(level, 'api.request', {
        service: serviceName,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
        route,
        method: request.method,
        statusCode: response.status,
        durationMs,
      })
      await logger.flush()

      return response
    } catch (error) {
      logger.error('api.error', {
        service: serviceName,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
        route,
        method: request.method,
        statusCode: 500,
        durationMs: Date.now() - startedAt,
        ...getErrorFields(error),
      })
      await logger.flush()

      throw error
    }
  }
}
