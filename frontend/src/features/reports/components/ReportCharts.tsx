import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../../../utils/format'
import type { ReportCount, ReportsOverview } from '../types'

export function CountBarChart({ data }: { data: ReportCount[] }) {
  return <div className="reports-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="label" width={105} tick={{ fontSize: 11 }}/><Tooltip/><Bar dataKey="value" name="Cantidad" fill="#5B3FD6" radius={[0, 6, 6, 0]}/></BarChart></ResponsiveContainer></div>
}

export function FinanceLineChart({ data }: { data: ReportsOverview['finance']['timeline'] }) {
  return <div className="reports-chart reports-chart--wide"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ left: 4, right: 12 }}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label" tick={{ fontSize: 11 }}/><YAxis tickFormatter={value => `$${Math.round(Number(value) / 1000)}k`} width={52}/><Tooltip formatter={value => formatMoney(Number(value))}/><Legend/><Line type="monotone" dataKey="billed" name="Facturación generada" stroke="#5B3FD6" strokeWidth={3}/><Line type="monotone" dataKey="collected" name="Cobrado" stroke="#28B76B" strokeWidth={3}/><Line type="monotone" dataKey="expenses" name="Egresos" stroke="#E55353" strokeWidth={2}/><Line type="monotone" dataKey="partsCost" name="Repuestos consumidos" stroke="#F5A623" strokeWidth={2}/></LineChart></ResponsiveContainer></div>
}
