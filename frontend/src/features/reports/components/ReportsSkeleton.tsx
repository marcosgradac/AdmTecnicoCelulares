import { Card, CardContent, Grid, Skeleton, Stack } from '@mui/material'

export function ReportsSkeleton() {
  return <Stack spacing={2} aria-label="Cargando estadísticas">
    <Grid container spacing={1.5}>{Array.from({ length: 8 }, (_, index) => <Grid key={index} size={{ xs: 6, lg: 3 }}><Card><CardContent><Skeleton width="55%"/><Skeleton height={44} width="75%"/></CardContent></Card></Grid>)}</Grid>
    <Grid container spacing={2}><Grid size={{ xs: 12, lg: 8 }}><Card><CardContent><Skeleton width="35%"/><Skeleton variant="rounded" height={280} sx={{ mt: 2 }}/></CardContent></Card></Grid><Grid size={{ xs: 12, lg: 4 }}><Card><CardContent><Skeleton width="55%"/><Skeleton height={240}/></CardContent></Card></Grid></Grid>
  </Stack>
}
