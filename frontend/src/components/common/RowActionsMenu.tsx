import { useState, type MouseEvent, type ReactNode } from 'react'
import { Divider, IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { MoreVertRounded } from '@mui/icons-material'
export interface RowAction { label:string; icon?:ReactNode; onClick:()=>void; disabled?:boolean; hidden?:boolean; destructive?:boolean; dividerBefore?:boolean }
export function RowActionsMenu({ label, actions }: { label:string; actions:RowAction[] }) {
  const [anchor,setAnchor]=useState<HTMLElement|null>(null)
  const open=(event:MouseEvent<HTMLElement>)=>{event.stopPropagation();setAnchor(event.currentTarget)}
  const close=()=>setAnchor(null)
  return <><Tooltip title="Acciones"><IconButton aria-label={label} onClick={open} sx={{ width: 44, height: 44, position: 'relative', backgroundColor: 'transparent', '&:hover': { backgroundColor: 'transparent' }, '&::before': { content: '""', position: 'absolute', inset: 5, borderRadius: '10px', backgroundColor: 'transparent', transition: 'background-color .18s ease' }, '&:hover::before': { backgroundColor: theme => alpha(theme.palette.primary.main, 0.08) }, '&.Mui-focusVisible::before': { backgroundColor: theme => alpha(theme.palette.primary.main, 0.14) } }}><MoreVertRounded/></IconButton></Tooltip><Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} marginThreshold={8} slotProps={{ paper:{ sx:{ maxWidth:'calc(100vw - 16px)' } } }}>{actions.filter(action=>!action.hidden).map((action,index)=><span key={`${action.label}-${index}`}>{action.dividerBefore&&<Divider/>}<MenuItem disabled={action.disabled} sx={action.destructive?{color:'error.main'}:undefined} onClick={event=>{event.stopPropagation();close();action.onClick()}}>{action.icon&&<ListItemIcon sx={action.destructive?{color:'error.main'}:undefined}>{action.icon}</ListItemIcon>}{action.label}</MenuItem></span>)}</Menu></>
}
