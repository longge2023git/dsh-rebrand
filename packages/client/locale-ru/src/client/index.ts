/**
 * Russian language pack: registers the `ru` locale and the dictionaries this
 * fork needs, all sourced from the pinned upstream tag in `dicts.ts`.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'

import { RU_NAMESPACE_DICTS } from './dictionaries.ts'

/** Required service: the shared locale registry owns languages and dictionaries. */
export const inject = ['locale']

/** Language name written in Russian, shown in the Language row. */
const RUSSIAN_LABEL = 'Русский'

/**
 * Register Russian and its dictionaries as owned effects, so disposing the
 * plugin removes the language and frees each namespace's `ru` slot.
 * @param ctx - Client root context carrying the locale service.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.addLanguage({ id: 'ru', label: RUSSIAN_LABEL, fallback: 'en' }),
    'locale-ru: language definition',
  )
  for (const [namespace, dict] of Object.entries(RU_NAMESPACE_DICTS)) {
    ctx.effect(() => ctx.locale.register(namespace, 'ru', dict), `locale-ru: ${namespace} dictionary`)
  }
}
