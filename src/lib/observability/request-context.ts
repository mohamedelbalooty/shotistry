import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

export interface RequestContext {
  requestId: string;
  traceId?: string;
  workspaceId?: string;
  userId?: string;
  deployEnv?: string;
  ipAddress?: string;
  path?: string;
  method?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: Partial<RequestContext>,
  fn: () => T
): T {
  const resolvedContext: RequestContext = {
    requestId: context.requestId ?? `req-${crypto.randomUUID()}`,
    traceId: context.traceId ?? `tr-${crypto.randomBytes(8).toString('hex')}`,
    deployEnv: context.deployEnv ?? process.env.SHOTISTRY_DEPLOY_ENV ?? process.env.NODE_ENV ?? 'development',
    ...context,
  };

  return asyncLocalStorage.run(resolvedContext, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getRequestId(): string {
  return asyncLocalStorage.getStore()?.requestId ?? 'system';
}

export function updateRequestContext(fields: Partial<RequestContext>): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    Object.assign(store, fields);
  }
}
