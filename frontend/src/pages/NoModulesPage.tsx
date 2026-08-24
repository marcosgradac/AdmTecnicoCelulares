import { LockOutlined } from '@mui/icons-material'
import { Paper, Typography } from '@mui/material'
export function NoModulesPage(){return <Paper sx={{p:5,textAlign:'center',borderRadius:4}}><LockOutlined color="primary" sx={{fontSize:44}}/><Typography variant="h5" fontWeight={900} mt={1}>No tenés módulos habilitados</Typography><Typography color="text.secondary" mt={1}>Pedile al propietario del negocio que habilite al menos un permiso para tu cuenta.</Typography></Paper>}
