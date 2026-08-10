import fs from 'fs'
import path from 'path'
import { IncomingMessage, ServerResponse } from 'http'

type JsonResponse = Record<string, unknown>

export type UiRouteDependencies = {
  host: string
  uiDirectory: string
  bootstrapCss: string
  currentSystemUserAvailable: boolean
  getConfigurationSchemaScript: () => string
  getGitHubDefaultsResponse: () => JsonResponse
  saveSetupOptions: (payload: Record<string, unknown>) => JsonResponse
  getConfigurationSchemaResponse: () => JsonResponse
  getSessionResponse: () => JsonResponse
  getCurrentSystemUser: () => unknown
  verifyGitHubConnection: (payload: Record<string, unknown>) => Promise<void>
  getGitHubConnectionResponse: () => JsonResponse
  saveEnvironmentSelection: (payload: Record<string, unknown>) => Promise<JsonResponse>
  getEnvironmentSelectionResponse: (selection: JsonResponse) => JsonResponse
  previewEnvironment: (payload: Record<string, unknown>) => Promise<JsonResponse>
  saveConfigurationScreen: (
    screenId: string,
    payload: Record<string, unknown>
  ) => JsonResponse
  getConfigurationResponse: () => unknown
  getHelmUpdates: () => unknown
  saveInfrastructureConfig: (payload: Record<string, unknown>) => JsonResponse
  getInventoryValues: (payload: JsonResponse) => unknown
  saveApplicationConfig: (payload: Record<string, unknown>) => JsonResponse
  getChartValues: (payload: JsonResponse) => unknown
  saveAdvancedConfig: (payload: Record<string, unknown>) => unknown
  saveDependenciesConfig: (payload: Record<string, unknown>) => unknown
  assertReadyToFinalize: () => void
  getReviewPlan: () => JsonResponse
  getValuesSecretsPath: () => string
  finalizeSetup: () => Promise<JsonResponse>
  resetConfiguratorSession: () => void
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonResponse
) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(JSON.stringify(payload))
}

function sendFile(
  response: ServerResponse,
  filePath: string,
  contentType: string,
  cacheControl = 'no-store'
) {
  response.writeHead(200, {
    'content-type': `${contentType}; charset=utf-8`,
    'cache-control': cacheControl
  })
  response.end(fs.readFileSync(filePath))
}

function sendDownload(
  response: ServerResponse,
  filePath: string,
  filename: string
) {
  response.writeHead(200, {
    'content-type': 'application/x-yaml; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store'
  })
  response.end(fs.readFileSync(filePath))
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function readJsonBody(request: IncomingMessage) {
  const body = await readRequestBody(request)
  return JSON.parse(body || '{}') as Record<string, unknown>
}

function sendUiFile(
  response: ServerResponse,
  dependencies: UiRouteDependencies,
  filename: string,
  contentType: string
) {
  sendFile(response, path.join(dependencies.uiDirectory, filename), contentType)
}

export function createUiRequestHandler(dependencies: UiRouteDependencies) {
  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    try {
      const method = request.method || 'GET'
      const url = new URL(request.url || '/', `http://${dependencies.host}`)

      if (method === 'GET' && url.pathname === '/') {
        sendUiFile(response, dependencies, 'index.html', 'text/html')
        return
      }

      if (method === 'GET' && url.pathname === '/ui/bootstrap.min.css') {
        sendFile(
          response,
          dependencies.bootstrapCss,
          'text/css',
          'public, max-age=86400'
        )
        return
      }

      if (method === 'GET' && url.pathname === '/ui/configuration-schema.js') {
        response.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store'
        })
        response.end(dependencies.getConfigurationSchemaScript())
        return
      }

      const uiFile = url.pathname.match(/^\/ui\/([a-z0-9-]+\.(?:css|js))$/)
      if (method === 'GET' && uiFile) {
        sendUiFile(
          response,
          dependencies,
          uiFile[1],
          uiFile[1].endsWith('.css') ? 'text/css' : 'text/javascript'
        )
        return
      }

      if (method === 'GET' && url.pathname === '/api/github/defaults') {
        sendJson(response, 200, dependencies.getGitHubDefaultsResponse())
        return
      }

      if (method === 'POST' && url.pathname === '/api/setup-options') {
        sendJson(
          response,
          200,
          dependencies.saveSetupOptions(await readJsonBody(request))
        )
        return
      }

      if (method === 'GET' && url.pathname === '/api/configuration-schema') {
        sendJson(response, 200, dependencies.getConfigurationSchemaResponse())
        return
      }

      if (method === 'GET' && url.pathname === '/api/session') {
        sendJson(response, 200, dependencies.getSessionResponse())
        return
      }

      if (method === 'GET' && url.pathname === '/api/current-user') {
        if (!dependencies.currentSystemUserAvailable) {
          sendJson(response, 404, {
            error: 'The current system user is not available in container mode.'
          })
          return
        }

        sendJson(response, 200, {
          user: dependencies.getCurrentSystemUser()
        })
        return
      }

      if (method === 'POST' && url.pathname === '/api/github/connect') {
        await dependencies.verifyGitHubConnection(await readJsonBody(request))
        sendJson(response, 200, dependencies.getGitHubConnectionResponse())
        return
      }

      if (method === 'POST' && url.pathname === '/api/environment-selection') {
        const selection = await dependencies.saveEnvironmentSelection(
          await readJsonBody(request)
        )
        sendJson(
          response,
          200,
          dependencies.getEnvironmentSelectionResponse(selection)
        )
        return
      }

      if (method === 'POST' && url.pathname === '/api/environment-preview') {
        sendJson(
          response,
          200,
          await dependencies.previewEnvironment(await readJsonBody(request))
        )
        return
      }

      const configurationRoute = url.pathname.match(/^\/api\/configuration\/([^/]+)$/)
      if (method === 'POST' && configurationRoute) {
        const screen = dependencies.saveConfigurationScreen(
          decodeURIComponent(configurationRoute[1]),
          await readJsonBody(request)
        )

        sendJson(response, 200, {
          saved: true,
          screen,
          configuration: dependencies.getConfigurationResponse(),
          helmUpdates: dependencies.getHelmUpdates()
        })
        return
      }

      if (method === 'POST' && url.pathname === '/api/infrastructure') {
        const infrastructure = dependencies.saveInfrastructureConfig(
          await readJsonBody(request)
        )

        sendJson(response, 200, {
          saved: true,
          infrastructure,
          inventoryValues: dependencies.getInventoryValues(infrastructure)
        })
        return
      }

      if (method === 'POST' && url.pathname === '/api/application') {
        const application = dependencies.saveApplicationConfig(
          await readJsonBody(request)
        )

        sendJson(response, 200, {
          saved: true,
          application,
          chartValues: dependencies.getChartValues(application)
        })
        return
      }

      if (method === 'POST' && url.pathname === '/api/advanced') {
        const advanced = dependencies.saveAdvancedConfig(await readJsonBody(request))

        sendJson(response, 200, {
          saved: true,
          advanced,
          helmUpdates: dependencies.getHelmUpdates()
        })
        return
      }

      if (method === 'POST' && url.pathname === '/api/dependencies') {
        const dependenciesResponse = dependencies.saveDependenciesConfig(
          await readJsonBody(request)
        )

        sendJson(response, 200, {
          saved: true,
          dependencies: dependenciesResponse,
          helmUpdates: dependencies.getHelmUpdates()
        })
        return
      }

      if (method === 'GET' && url.pathname === '/api/review') {
        dependencies.assertReadyToFinalize()
        sendJson(response, 200, dependencies.getReviewPlan())
        return
      }

      if (method === 'GET' && url.pathname === '/api/finalize/values-secrets') {
        const valuesSecretsPath = dependencies.getValuesSecretsPath()
        if (!valuesSecretsPath || !fs.existsSync(valuesSecretsPath)) {
          sendJson(response, 404, {
            error: 'No generated values.secrets.yaml file is available.'
          })
          return
        }

        sendDownload(response, valuesSecretsPath, 'values.secrets.yaml')
        return
      }

      if (method === 'POST' && url.pathname === '/api/finalize') {
        sendJson(response, 200, {
          finalized: true,
          ...(await dependencies.finalizeSetup())
        })
        return
      }

      if (method === 'POST' && url.pathname === '/api/restart') {
        dependencies.resetConfiguratorSession()
        sendJson(response, 200, { restarted: true })
        return
      }

      sendJson(response, 404, { error: 'Not found' })
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : 'Unexpected error'
      })
    }
  }
}
