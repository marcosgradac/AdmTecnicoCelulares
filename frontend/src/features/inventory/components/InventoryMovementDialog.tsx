import { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material'
import { CurrencyField } from '../../../components/common/CurrencyField'
import { IntegerField } from '../../../components/common/IntegerField'
import type { InventoryItem, InventoryMovementInput } from '../types/inventory.types'

const options: Array<{value:InventoryMovementInput['type'];label:string;subtract:boolean}>=[{value:'purchase',label:'Entrada de mercadería',subtract:false},{value:'manual_entry',label:'Entrada manual',subtract:false},{value:'adjustment_in',label:'Ajuste positivo',subtract:false},{value:'adjustment_out',label:'Ajuste negativo',subtract:true},{value:'return',label:'Devolución',subtract:false},{value:'damaged',label:'Producto dañado',subtract:true}]
export function InventoryMovementDialog({open,item,saving,onClose,onSave}:{open:boolean;item:InventoryItem;saving:boolean;onClose:()=>void;onSave:(input:InventoryMovementInput)=>Promise<void>}) {
  const [form,setForm]=useState<InventoryMovementInput>({type:'purchase',quantity:1,unitCost:item.purchaseCost,supplier:item.supplier??'',notes:''})
  const option=options.find(o=>o.value===form.type)??options[0]
  const invalid=form.quantity<=0||!Number.isInteger(form.quantity)||!form.notes.trim()||(option.subtract&&form.quantity>item.currentStock)
  return <Dialog open={open} onClose={()=>!saving&&onClose()} fullWidth maxWidth="xs"><DialogTitle>Registrar movimiento</DialogTitle><DialogContent><Stack spacing={2} mt={1}>
    <Alert severity={option.subtract?'warning':'info'}>Stock actual: {item.currentStock}{option.subtract?' · Esta operación restará existencias.':''}</Alert>
    <TextField select label="Tipo" value={form.type} onChange={e=>setForm(v=>({...v,type:e.target.value as InventoryMovementInput['type']}))}>{options.map(o=><MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
    <IntegerField label="Cantidad" value={form.quantity} min={1} onValueChange={quantity=>setForm(v=>({...v,quantity}))}/>
    {form.type==='purchase'&&<><CurrencyField label="Costo unitario" value={form.unitCost??0} onValueChange={unitCost=>setForm(v=>({...v,unitCost}))}/><TextField label="Proveedor" value={form.supplier??''} onChange={e=>setForm(v=>({...v,supplier:e.target.value}))}/></>}
    <TextField required multiline minRows={2} label="Motivo / observación" value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/>
  </Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancelar</Button><Button color={option.subtract?'error':'primary'} variant="contained" disabled={saving||invalid} onClick={()=>void onSave(form)}>{saving?'Guardando…':'Confirmar'}</Button></DialogActions></Dialog>
}
