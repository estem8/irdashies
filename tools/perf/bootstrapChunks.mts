/** Run the userData side effect before shared storage chunks are evaluated. */
export const perfStartupChunk = (id: string): string | undefined =>
  id.replaceAll('\\', '/').endsWith('/app/perfUserData.ts')
    ? 'perf-user-data'
    : undefined;
