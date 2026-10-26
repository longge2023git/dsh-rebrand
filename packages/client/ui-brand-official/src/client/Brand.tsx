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

/** Host props for the conversation hero mark (the declaring package owns the type). */
interface HeroBrandMarkProps {
  /** Square edge in px. */
  size: number
  /** Positioning class supplied by the hero. */
  className?: string | undefined
}

/**
 * Render the mascot in the conversation hero, replacing the animated fish fallback.
 * @param props - Hero-supplied size and class.
 * @returns the vv-worker mascot.
 */
export function OfficialHeroBrandMark({ size, className }: HeroBrandMarkProps) {
  return <VvWorkerMark size={size} className={className} />
}
