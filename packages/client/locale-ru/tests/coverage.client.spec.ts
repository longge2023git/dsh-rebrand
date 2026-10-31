/// <reference types="vite/client" />
/** Coverage gate for the generated Russian dictionaries. */

import { describe, expect, it } from 'vitest'

import { RU_NAMESPACE_DICTS } from '../src/client/dictionaries.ts'
import { RU_SOURCES } from '../src/client/dicts.ts'

type DictionaryModule = Record<string, Record<string, string>>

const modules = import.meta.glob<DictionaryModule>('../../*/src/client/**/*locale*.ts')

/**
 * Resolve a repository-relative dictionary path to its glob loader.
 * @param file - repository path.
 * @returns loader, or undefined when the glob misses it.
 */
function loaderFor(file: string): (() => Promise<DictionaryModule>) | undefined {
  const suffix = `/${file.replace(/^packages\/client\//u, '')}`
  const key = Object.keys(modules).find(candidate => candidate.endsWith(suffix))
  return key === undefined ? undefined : modules[key]
}

/** Collect `{name}` placeholders in a message. @param value - dictionary text. @returns sorted placeholder names. */
function placeholders(value: string): string {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map(match => match[1]!).sort().join(',')
}

describe('Russian dictionary coverage', () => {
  it('maps every namespace to its dictionary module', () => {
    expect(Object.keys(RU_SOURCES).length).toBe(Object.keys(RU_NAMESPACE_DICTS).length)
    for (const [namespace, source] of Object.entries(RU_SOURCES)) {
      expect(loaderFor(source.file), namespace).toBeDefined()
    }
  })

  it('translates every English key with the same placeholders', async () => {
    const missing: string[] = []
    const placeholderDrift: string[] = []
    for (const [namespace, source] of Object.entries(RU_SOURCES)) {
      const module = await loaderFor(source.file)!()
      const english = module[source.en] ?? {}
      const russian = RU_NAMESPACE_DICTS[namespace] ?? {}
      for (const [key, value] of Object.entries(english)) {
        const translated = russian[key]
        if (translated === undefined) {
          missing.push(`${namespace}:${key}`)
          continue
        }
        if (placeholders(value) !== placeholders(translated)) placeholderDrift.push(`${namespace}:${key}`)
      }
    }
    expect(missing).toEqual([])
    expect(placeholderDrift).toEqual([])
  })

  it('retires the pack once the dictionaries ship Russian in-tree', async () => {
    const landed: string[] = []
    for (const source of Object.values(RU_SOURCES)) {
      const module = await loaderFor(source.file)!()
      const russianName = source.en === 'en' ? 'ru' : source.en.replace(/En$/u, 'Ru')
      if (russianName in module) landed.push(`${source.file} exports ${russianName}`)
    }
    expect(landed, 'upstream dictionaries now carry Russian: delete packages/client/locale-ru').toEqual([])
  })
})
