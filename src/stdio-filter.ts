export function setupStdioFiltering(): void {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  console.log = (...args: unknown[]) => { console.error(...args); };

  process.stdout.write = function(chunk: string | Uint8Array, ...args: never[]): boolean {
    const message = chunk.toString();
    if (message.startsWith('{') || /^[\r\n]+$/.test(message)) {
      return originalStdoutWrite(chunk, ...args);
    }
    return true;
  } as typeof process.stdout.write;

  // Diagnostic output belongs on stderr; leave console.error intact.
}
