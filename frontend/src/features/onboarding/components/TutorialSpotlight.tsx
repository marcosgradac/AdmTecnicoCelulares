import { Box } from '@mui/material'
import styles from '../styles/onboarding.module.scss'

export function TutorialSpotlight({ rect, pulse }: { rect: DOMRect | null; pulse?: boolean }) {
  return rect ? <Box className={`${styles.spotlight} ${pulse ? styles.pulse : ''}`} sx={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }} /> : <Box className={styles.dim} />
}
