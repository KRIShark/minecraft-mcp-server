import test from 'ava';
import { setupStdioFiltering } from '../src/stdio-filter.js';

test('allows JSON messages to pass through', (t) => {
  const originalWrite = process.stdout.write;
  let capturedOutput = '';
  
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedOutput += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  
  setupStdioFiltering();
  
  const jsonMessage = '{"jsonrpc":"2.0","id":1,"method":"test"}';
  process.stdout.write(jsonMessage);
  
  t.is(capturedOutput, jsonMessage);
  
  process.stdout.write = originalWrite;
});

test('filters timestamp log messages from protocol stdout', (t) => {
  const originalWrite = process.stdout.write;
  let capturedOutput = '';
  
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedOutput += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  
  setupStdioFiltering();
  
  const logMessage = '2025-11-05T19:45:29.842Z [minecraft] [mcp-server] [info] Bot connected\n';
  process.stdout.write(logMessage);
  
  t.is(capturedOutput, '');
  
  process.stdout.write = originalWrite;
});

test('allows newline-only messages to pass through', (t) => {
  const originalWrite = process.stdout.write;
  let capturedOutput = '';
  
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedOutput += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  
  setupStdioFiltering();
  
  process.stdout.write('\n');
  process.stdout.write('\r\n');
  
  t.is(capturedOutput, '\n\r\n');
  
  process.stdout.write = originalWrite;
});

test('filters out random debug messages', (t) => {
  const originalWrite = process.stdout.write;
  let capturedOutput = '';
  
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedOutput += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  
  setupStdioFiltering();
  
  process.stdout.write('Minecraft bot debug message');
  process.stdout.write('Some random output');
  
  t.is(capturedOutput, '');
  
  process.stdout.write = originalWrite;
});

test('filters minecraft-protodef library output', (t) => {
  const originalWrite = process.stdout.write;
  let capturedOutput = '';
  
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedOutput += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  
  setupStdioFiltering();
  
  process.stdout.write('Loading minecraft protocol version 1.20.4');
  process.stdout.write('[protodef] Packet received');
  
  t.is(capturedOutput, '');
  
  process.stdout.write = originalWrite;
});

test('allows JSON while filtering other messages', (t) => {
  const originalWrite = process.stdout.write;
  let capturedOutput = '';
  
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedOutput += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  
  setupStdioFiltering();
  
  process.stdout.write('Random message');
  process.stdout.write('{"jsonrpc":"2.0","result":"success"}');
  process.stdout.write('More random output');
  
  t.is(capturedOutput, '{"jsonrpc":"2.0","result":"success"}');
  
  process.stdout.write = originalWrite;
});

test('keeps console.error available', (t) => {
  const originalError = console.error;
  setupStdioFiltering();
  t.is(console.error, originalError);
});

test('console.error remains available for diagnostics', (t) => {
  const originalError = console.error;
  
  setupStdioFiltering();
  
  t.is(console.error, originalError);
  
  console.error = originalError;
});
