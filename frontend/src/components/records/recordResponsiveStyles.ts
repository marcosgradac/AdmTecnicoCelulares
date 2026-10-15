import type { SxProps, Theme } from '@mui/material'

/** Route-local density preserves shared cards and desktop tables. */
export const compactRecordContentSx: SxProps<Theme> = theme => ({
  [theme.breakpoints.down('md')]: {
    p: 1.5,
    '&:last-child': { pb: 1.5 },
    '& > .MuiStack-root:has(.MuiTextField-root)': { p: 1, mb: 1.5, gap: 1 },
    '& article': { p: 1.5 },
    '& article > .MuiBox-root:last-child': { pt: 1, mt: 1, gap: 1 },
  },
})
