const assert = require('node:assert/strict')
const { harness } = require('./equipment-sales.cjs')
const device = { id:'d', brand:'Samsung', model:'A54', status:'SOLD', version:3, purchasePrice:100, repairExpenses:20, totalCost:120, estimatedSalePrice:180, estimatedProfit:60, actualSalePrice:110, realizedProfit:-10, saleCostBasis:120, salePaymentMethod:'CASH', soldAt:'2026-10-01T12:00:00Z', createdAt:'2026-09-01T12:00:00Z', updatedAt:'2026-10-01T12:00:00Z' }
const collect = (node, predicate, found = []) => { if (!node || typeof node !== 'object') return found; if (predicate(node)) found.push(node); for (const value of Object.values(node)) collect(value, predicate, found); return found }
async function main() {
  for (const status of ['PURCHASED','REPAIRING','READY_FOR_SALE','SOLD']) for (const allowed of [true,false]) for (const mobile of [true,false]) {
    let viewed=0, removed=0
    const list=harness('EquipmentDeviceList.tsx','EquipmentDeviceList',{ devices:[{...device,status}], canManage:allowed, canSell:allowed, canDelete:allowed, mobile, onView(){viewed++}, onDelete(){removed++} })
    await list.settle()
    const actions=list.find(n=>n.type==='RowActionsMenu').props.actions
    assert.equal(actions.some(a=>a.label==='Eliminar equipo'),allowed)
    assert.equal(actions.some(a=>a.label==='Editar equipo'),allowed&&status!=='SOLD')
    assert.equal(actions.some(a=>a.label==='Registrar venta'),allowed&&status==='READY_FOR_SALE')
    assert.ok(actions.every(a=>!a.disabled))
    actions.find(a=>a.label==='Ver detalles').onClick(); assert.equal(viewed,1)
    if(allowed){ const action=actions.find(a=>a.label==='Eliminar equipo'); assert.ok(action.destructive&&action.dividerBefore); action.onClick(); assert.equal(removed,1) }
    if(!mobile) assert.equal(collect(list.root(),n=>n.type==='TableHead')[0].props.children.props.children.length,5)
    else assert.equal(collect(list.root(),n=>n.type==='RecordField').length,2)
  }
  let calls=0, finish, deleted=0, closed=0
  const dialog=harness('EquipmentDialogs.tsx','EquipmentDeleteDialog',{device,canDelete:true,onClose(){closed++},onDeleted(){deleted++},onRefresh(){}})
  dialog.services.deleteEquipment=async(id,version)=>{calls++;assert.equal(version,3);return new Promise(resolve=>finish=resolve)}
  await dialog.settle()
  const button=()=>dialog.find(n=>n.type==='Button'&&n.props.color==='error').props
  assert.equal(button().disabled,true); button().onClick();assert.equal(calls,0)
  dialog.find(n=>n.type==='Checkbox').props.onChange({},true); await dialog.settle()
  button().onClick();button().onClick();await dialog.settle();assert.equal(calls,1)
  dialog.root().props.onClose?.();assert.equal(closed,0);assert.equal(dialog.root().props.disableEscapeKeyDown,true)
  finish();await dialog.settle();assert.equal(deleted,1)
  for(const status of [403,404,409,500]){
    let count=0, refresh=0
    const view=harness('EquipmentDialogs.tsx','EquipmentDeleteDialog',{device,canDelete:true,onClose(){},onDeleted(){},onRefresh(){refresh++}})
    view.services.deleteEquipment=async()=>{count++;throw {isAxiosError:true,response:{status,data:{}}}}
    await view.settle();view.find(n=>n.type==='Checkbox').props.onChange({},true);await view.settle()
    view.find(n=>n.type==='Button'&&n.props.color==='error').props.onClick();await view.settle()
    assert.ok(view.find(n=>n.type==='Alert'&&n.props.severity==='error'))
    const action=view.find(n=>n.type==='Button'&&n.props.color==='error').props
    assert.equal(action.disabled,status!==500)
    if(status===500){action.onClick();await view.settle();assert.equal(count,2)}else{action.onClick();await view.settle();assert.equal(count,1)}
    if(status===404||status===409){view.find(n=>n.type==='Button'&&n.props.children==='Cerrar y actualizar listado').props.onClick();assert.equal(refresh,1)}
  }
  const denied=harness('EquipmentDialogs.tsx','EquipmentDeleteDialog',{device,canDelete:false,onClose(){},onDeleted(){},onRefresh(){}});await denied.settle();assert.equal(denied.find(n=>n.type==='Button'&&n.props.color==='error').props.disabled,true)
  for(const profit of [-10,0,10]){
    const view=harness('EquipmentDialogs.tsx','EquipmentDetailsDialog',{device,onClose(){}})
    view.services.getEquipmentDetail=async()=>({device:{...device,realizedProfit:profit},movements:[{id:'m',type:'EXPENSE',amount:100,method:null,description:'Compra',createdAt:device.createdAt,resaleKind:'PURCHASE',resaleVersion:1}]})
    await view.settle()
    const fields=collect(view.root(),n=>typeof n.type==='function'&&n.type.name==='Field')
    for(const label of ['Marca','Modelo','Estado','Fecha de registro','Última actualización','Precio de compra','Gastos de reparación','Inversión total','Precio estimado de venta','Ganancia estimada','Precio real de venta','Ganancia real','Inversión al vender','Fecha y hora de venta','Medio de pago']) assert.ok(fields.some(f=>f.props.label===label),label)
    assert.equal(fields.find(f=>f.props.label==='Ganancia real').props.color,profit<0?'error.main':'success.main')
    assert.equal(fields.find(f=>f.props.label==='Precio real de venta').props.value,'110')
    assert.equal(fields.find(f=>f.props.label==='Precio estimado de venta').props.value,'180')
  }
  console.log('Equipment list actions, responsive structure and deletion guards passed')
}
main().catch(e=>{console.error(e);process.exitCode=1})
