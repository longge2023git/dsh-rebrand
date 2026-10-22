/**
 * Explicit gateway API-key step. The endpoint is pinned by the gateway provider
 * entry, so this editor only asks for the key; it intentionally has no account
 * sign-in child and never shows the official provider's credential path.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { onboardingReadiness } from './store.ts'
import { ProviderEditor } from './ProviderEditor.tsx'
import type { DeepSeekOnboardingInjected } from './DeepSeekOnboardingDialog.tsx'
import { OnboardingModal } from './OnboardingModal.tsx'
import styles from './DeepSeekOnboardingDialog.module.css'

/** Gateway step props: the settings shell owner plus the shared Models join. */
export type GatewayOnboardingDialogProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<DeepSeekOnboardingInjected>

/** Render the explicit gateway credential editor. */
export function GatewayOnboardingDialog(props: GatewayOnboardingDialogProps): ReactNode {
  const { complete, controller, useModels, operations, schema, t, explicit = false, track } = props
  const state = useModels(snapshot => snapshot)
  const readiness = onboardingReadiness(state, 'deepseek-gateway')

  useEffect(() => {
    if (state.status === 'idle') void controller.load()
  }, [controller, state.status])

  useEffect(() => {
    if (readiness.kind === 'provider-ready' && !explicit) complete()
  }, [complete, readiness.kind, explicit])

  if (!explicit && !props.automatic) return null
  if (readiness.kind === 'loading' || readiness.kind === 'adapter-absent' || readiness.kind === 'unavailable') return null

  const row = state.rows.find(candidate =>
    candidate.entry.provider === 'deepseek-gateway'
    && candidate.entry.settingsPath.length === 0)
  const namespace = row === undefined ? undefined : state.namespaces.get(row.entry.settingsNs)
  if (row === undefined || namespace === undefined) return null

  return (
    <OnboardingModal title={t('onboardingGatewayTitle')}>
      <p className={styles.description}>{t('onboardingGatewayDescription')}</p>
      <div className={styles.editor}>
        <ProviderEditor
          provider={row.entry.provider}
          displayName={row.entry.displayName}
          namespace={namespace}
          schema={schema}
          settingsPath={row.entry.settingsPath}
          operations={operations}
          t={t}
          readOnly={false}
          hideTitle
          credentialOnly
          onSubmitCredential={() => { track?.('api_key_save_click', {}) }}
          credentialRequired
          autoFocusCredential
          cancelLabelKey="onboardingLater"
          submitLabelKey="onboardingSave"
          submitBusyLabelKey="onboardingSaving"
          onClose={(changed) => { if (changed) void controller.load(); complete() }}
        />
      </div>
    </OnboardingModal>
  )
}
