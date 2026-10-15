import { useId, useState, type ReactNode } from 'react';
import { Box, Tab, Tabs, useMediaQuery, useTheme } from '@mui/material';
export function MobileChartTabs({ financial, states, areas }: {
    financial: ReactNode;
    states?: ReactNode;
    areas?: ReactNode;
}) {
    const mobile = useMediaQuery(useTheme().breakpoints.down('md')), [selected, setSelected] = useState('cash'), id = useId();
    if (!mobile)
        return <>{financial}</>;
    const entries = [{ key: 'cash', label: 'Ingresos/Egresos', panel: financial }, ...(states ? [{ key: 'states', label: 'Estados', panel: states }] : []), ...(areas ? [{ key: 'areas', label: 'Áreas', panel: areas }] : [])];
    const active = entries.some(e => e.key === selected) ? selected : 'cash';
    return <Box minWidth={0}><Tabs value={active} onChange={(_, value: string) => setSelected(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Gráficos del dashboard" sx={{ mb: 1, '& .MuiTab-root': { minHeight: 44, px: 1.5, minWidth: 0 }, '& .MuiTabs-scrollButtons': { width: 44 } }}>{entries.map(e => <Tab key={e.key} value={e.key} label={e.label} id={`${id}-${e.key}-tab`} aria-controls={`${id}-${e.key}-panel`}/>)}</Tabs>{entries.map(e => e.key === active ? <Box key={e.key} role="tabpanel" id={`${id}-${e.key}-panel`} aria-labelledby={`${id}-${e.key}-tab`}>{e.panel}</Box> : null)}</Box>;
}
