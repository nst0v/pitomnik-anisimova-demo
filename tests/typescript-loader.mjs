import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { transformWithOxc } from 'vite'

// Keep the audit runnable on Node builds without built-in TypeScript support.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error
    const url = new URL(`${specifier}.ts`, context.parentURL)
    await readFile(url)
    return { url: url.href, shortCircuit: true }
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.json')) {
    return { format: 'module', source: `export default ${await readFile(fileURLToPath(url), 'utf8')}`, shortCircuit: true }
  }
  if (!url.endsWith('.ts')) return nextLoad(url, context)
  const source = await readFile(fileURLToPath(url), 'utf8')
  return {
    format: 'module',
    source: (await transformWithOxc(source, fileURLToPath(url))).code,
    shortCircuit: true,
  }
}
