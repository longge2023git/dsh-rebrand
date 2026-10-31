/**
 * Russian copy for namespaces whose upstream dictionary lacks a key this fork
 * still renders. Regeneration overwrites `dicts.ts`, not this file, so entries
 * here survive upstream refreshes and disappear once upstream translates the
 * same key.
 */

/** Manual translations keyed by namespace, then by the English dictionary's key. */
export const RU_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'deliverables': {
    'presented.directoryOpened': 'Запрошено открытие папки с файлом',
    'presented.opened': 'Открытие запрошено',
    'presented.revealed': 'Запрошен показ в файловом менеджере',
  },
  'plan': {
    'preview.historyUnavailable': 'История сеанса недоступна',
  },
  'pluginManager': {
    'previewAlt': 'Предпросмотр функции {name}',
    'previewUnavailable': 'Не удалось показать предпросмотр функции',
  },
  'settings.account': {
    'gatewayApiKey': 'Использовать API-ключ шлюза',
  },
  'settings.models': {
    'onboardingGatewayDescription': 'Введите API-ключ, выданный вашим шлюзом DSH. Запросы остаются на эндпоинте шлюза.',
    'onboardingGatewayTitle': 'Использование API-ключа шлюза',
  },
  'question': {
    'reply.close': 'Закрыть подробности вопроса',
    'reply.open': 'Открыть подробности вопроса',
  },
}
