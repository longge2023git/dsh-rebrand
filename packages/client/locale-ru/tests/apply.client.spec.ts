/** Language-pack registration: the ru definition, every namespace, and cleanup. */

import { describe, expect, it, vi } from 'vitest'

import { apply, inject } from '../src/client/index.ts'
import { RU_NAMESPACE_DICTS } from '../src/client/dictionaries.ts'

/** Minimal ctx that records effects and can dispose them in reverse order. */
function bench() {
  const disposers: (() => void)[] = []
  const addLanguage = vi.fn((_language: { id: string; label: string; fallback: string }) => () => {})
  const register = vi.fn((_namespace: string, _locale: string, _dict: Record<string, string>) => () => {})
  const ctx = {
    effect: (run: () => (() => void) | undefined) => {
      const dispose = run()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    locale: { addLanguage, register },
  }
  return { ctx, addLanguage, register, disposers }
}

describe('Russian language pack', () => {
  it('declares the locale service and registers Russian through it', () => {
    const b = bench()
    apply(b.ctx as never)

    expect(inject).toEqual(['locale'])
    expect(b.addLanguage).toHaveBeenCalledTimes(1)
    expect(b.addLanguage).toHaveBeenCalledWith({ id: 'ru', label: 'Русский', fallback: 'en' })

    expect(b.register).toHaveBeenCalledTimes(Object.keys(RU_NAMESPACE_DICTS).length)
    for (const namespace of Object.keys(RU_NAMESPACE_DICTS)) {
      expect(b.register).toHaveBeenCalledWith(namespace, 'ru', RU_NAMESPACE_DICTS[namespace])
    }
  })

  it('registers concrete Russian copy, including fork-owned keys', () => {
    const b = bench()
    apply(b.ctx as never)
    const dictionaries = b.register.mock.calls.map(call => call[2])

    expect(dictionaries.flatMap(dict => Object.values(dict))).toContain('Новая сессия')
    expect(RU_NAMESPACE_DICTS['settings.account']?.['gatewayApiKey']).toBe('Использовать API-ключ шлюза')
    expect(RU_NAMESPACE_DICTS['pluginManager']?.['previewAlt']).toBe('Предпросмотр функции {name}')
  })

  it('keeps every registration disposable', () => {
    const b = bench()
    apply(b.ctx as never)
    expect(b.disposers).toHaveLength(1 + Object.keys(RU_NAMESPACE_DICTS).length)
    for (const dispose of b.disposers) expect(() => { dispose() }).not.toThrow()
  })
})
