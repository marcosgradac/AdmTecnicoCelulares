import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Box, Button, Card, CardContent, CssBaseline, ThemeProvider, Typography} from '@mui/material'
import {createAppTheme} from '../src/theme/theme'
import {MobileCarousel} from '../src/components/common/MobileCarousel'
import '../src/styles/global.scss'
function Fixture(){const [dark,setDark]=useState(false),[clicks,setClicks]=useState(0),[single,setSingle]=useState(false);document.documentElement.dataset.theme=dark?'dark':'light';return <ThemeProvider theme={createAppTheme(dark?'dark':'light')}><CssBaseline/><Box p={2}>
<Button onClick={()=>setDark(v=>!v)}>Cambiar tema</Button><Button onClick={()=>setSingle(v=>!v)}>Filtrar tarjetas</Button><Typography component="p">Acciones: {clicks}</Typography>
<MobileCarousel label="Métricas de prueba" desktopSx={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:1.5}}>{(single?[1]:[1,2,3,4]).map(n=><Card key={n} data-card={n} sx={{height:'100%'}}><CardContent><Typography>Tarjeta {n}</Typography><Typography>{n===2?'Contenido más largo para comparar alturas de las tarjetas.':'Contenido de prueba'}</Typography><Button onClick={()=>setClicks(v=>v+1)}>Acción {n}</Button></CardContent></Card>)}</MobileCarousel>
<Box height={1800}>Recorrido vertical de prueba</Box></Box></ThemeProvider>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
