import { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, TextField } from '@mui/material'
import { inventoryCategories } from '../utils/inventoryCategories'
import type { InventoryItem, InventoryItemInput } from '../types/inventory.types'
import { CurrencyField } from '../../../components/common/CurrencyField'
import { IntegerField } from '../../../components/common/IntegerField'

const empty: InventoryItemInput = { sku:'', name:'', category:'otro', brand:'', compatibleModels:[], quality:'', supplier:'', purchaseCost:0, salePrice:0, currentStock:0, minimumStock:0, notes:'' }
export function InventoryForm({ open, item, saving, onClose, onSave }: { open:boolean; item?:InventoryItem|null; saving:boolean; onClose:()=>void; onSave:(value:InventoryItemInput)=>Promise<void> }) {
  const [form,setForm]=useState<InventoryItemInput>(empty); const [models,setModels]=useState('')
  useEffect(()=>{const next=item?{sku:item.sku,name:item.name,category:item.category,brand:item.brand,compatibleModels:item.compatibleModels,quality:item.quality,supplier:item.supplier,purchaseCost:item.purchaseCost,salePrice:item.salePrice,currentStock:item.currentStock,minimumStock:item.minimumStock,notes:item.notes}:empty;setForm(next);setModels(next.compatibleModels.join(', '))},[item,open])
  const field=<K extends keyof InventoryItemInput>(key:K,value:InventoryItemInput[K])=>setForm(current=>({...current,[key]:value}))
  const valid=form.name.trim().length>=2&&form.purchaseCost>=0&&form.currentStock>=0&&form.minimumStock>=0&&(form.salePrice??0)>=0
  return <Dialog open={open} onClose={()=>!saving&&onClose()} fullWidth maxWidth="md"><DialogTitle>{item?'Editar repuesto':'Nuevo repuesto'}</DialogTitle><DialogContent><Grid container spacing={2} mt={0.5}>
    <Grid size={{xs:12,sm:4}}><TextField fullWidth label="SKU" value={form.sku??''} onChange={e=>field('sku',e.target.value)}/></Grid><Grid size={{xs:12,sm:8}}><TextField required fullWidth label="Nombre" value={form.name} onChange={e=>field('name',e.target.value)}/></Grid>
    <Grid size={{xs:12,sm:4}}><TextField required select fullWidth label="Categoría" value={form.category} onChange={e=>field('category',e.target.value as InventoryItemInput['category'])}>{inventoryCategories.map(c=><MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}</TextField></Grid><Grid size={{xs:12,sm:4}}><TextField fullWidth label="Marca" value={form.brand??''} onChange={e=>field('brand',e.target.value)}/></Grid><Grid size={{xs:12,sm:4}}><TextField fullWidth label="Calidad" value={form.quality??''} onChange={e=>field('quality',e.target.value)}/></Grid>
    <Grid size={12}><TextField fullWidth label="Modelos compatibles" value={models} helperText="Separados por comas, por ejemplo: iPhone 11, iPhone 12" onChange={e=>{setModels(e.target.value);field('compatibleModels',e.target.value.split(',').map(v=>v.trim()).filter(Boolean))}}/></Grid>
    <Grid size={{xs:12,sm:6}}><TextField fullWidth label="Proveedor" value={form.supplier??''} onChange={e=>field('supplier',e.target.value)}/></Grid><Grid size={{xs:6,sm:3}}><CurrencyField label="Costo de compra" value={form.purchaseCost} onValueChange={value=>field('purchaseCost',value)}/></Grid><Grid size={{xs:6,sm:3}}><CurrencyField label="Precio sugerido" value={form.salePrice??0} onValueChange={value=>field('salePrice',value)}/></Grid>
    {!item&&<Grid size={{xs:6,sm:3}}><IntegerField label="Stock inicial" value={form.currentStock} min={0} onValueChange={value=>field('currentStock',value)}/></Grid>}<Grid size={{xs:6,sm:3}}><IntegerField label="Stock mínimo" value={form.minimumStock} min={0} onValueChange={value=>field('minimumStock',value)}/></Grid><Grid size={12}><TextField fullWidth multiline minRows={2} label="Notas" value={form.notes??''} onChange={e=>field('notes',e.target.value)}/></Grid>
  </Grid></DialogContent><DialogActions><Button disabled={saving} onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={saving||!valid} onClick={()=>void onSave(form)}>{saving?'Guardando…':'Guardar'}</Button></DialogActions></Dialog>
}
