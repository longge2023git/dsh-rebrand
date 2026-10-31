/** Merged Russian dictionaries: generated upstream copy plus the fork's own keys. */

import type { LocaleDict } from '@deepseek-ai/dsh-client-locale/client'

import { RU_DICTS } from './dicts.ts'
import { RU_OVERRIDES } from './overrides.ts'

/** Namespace to the dictionary this pack registers, overrides applied last. */
export const RU_NAMESPACE_DICTS: Readonly<Record<string, LocaleDict>> = Object.fromEntries(
  Object.entries(RU_DICTS).map(([namespace, dict]) => [
    namespace,
    { ...dict, ...(RU_OVERRIDES[namespace] ?? {}) },
  ]),
)
