import { VvWorkerMark } from './VvWorkerMark.tsx'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the branded mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the vv-worker mascot.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <VvWorkerMark size={size} />
}

/**
 * Render the branded name without its independently slotted mark.
 * @returns the vv-worker wordmark.
 */
export function OfficialBrandName() {
  return <span aria-hidden="true" style={{ whiteSpace: 'nowrap' }}>vv-worker</span>
}
