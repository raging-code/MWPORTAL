export async function onRequest(context: any) {
  const url = new URL(context.request.url)
  const workerUrl = 'https://mwportal-worker.mwcrewportal.workers.dev'

  const targetUrl = workerUrl + url.pathname + url.search

  const request = new Request(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: ['GET', 'HEAD'].includes(context.request.method)
      ? undefined
      : context.request.body,
  })

  return fetch(request)
}