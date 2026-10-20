/** DSH model-listing projection. */
import type { ModelConfig } from './config.ts'

/** Build the `/models` body DSH's account route expects. */
export function modelListing(models: readonly ModelConfig[]): unknown {
  return {
    data: models.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      input_modalities: model.image === true ? ['text', 'image'] : ['text'],
      output_modalities: ['text'],
      ...model.context_window === undefined ? {} : { context_window: model.context_window },
      ...model.max_output_tokens === undefined ? {} : { max_output_tokens: model.max_output_tokens },
      api_capabilities: { anthropic_messages: { system_prompt_update: 'leading-only' } },
      client_requirements: { 'deepseek-harness': { min_version: '0.2.0' } },
    })),
  }
}

/** Map an exposed model id to the id sent upstream. */
export function upstreamModel(models: readonly ModelConfig[], id: string): string {
  return models.find((model) => model.id === id)?.upstream ?? id
}
