import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../../utils/format'

export interface CashFlowPoint { label: string; income: number; expense: number }

export function IncomeExpenseChart({ data }: { data: CashFlowPoint[] }) {
  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={270}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--td-success, #168047)" stopOpacity={0.22}/><stop offset="95%" stopColor="var(--td-success, #168047)" stopOpacity={0}/></linearGradient>
          <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--td-error, #C62828)" stopOpacity={0.15}/><stop offset="95%" stopColor="var(--td-error, #C62828)" stopOpacity={0}/></linearGradient>
        </defs>
        <CartesianGrid stroke="var(--td-border, #EEF0F4)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--td-muted, #687083)', fontSize: 12 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--td-muted, #687083)', fontSize: 11 }} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} />
        <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={{ backgroundColor: 'var(--td-paper, #fff)', color: 'var(--td-text, #171A23)', border: '1px solid var(--td-border, #E8EAF0)', borderRadius: 12, boxShadow: '0 8px 24px rgba(23,26,35,.08)' }} />
        <Legend iconType="circle" />
        <Area type="monotone" name="Ingresos" dataKey="income" stroke="var(--td-success, #168047)" strokeWidth={3} fill="url(#incomeFill)" />
        <Area type="monotone" name="Egresos" dataKey="expense" stroke="var(--td-error, #C62828)" strokeWidth={2.5} fill="url(#expenseFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

