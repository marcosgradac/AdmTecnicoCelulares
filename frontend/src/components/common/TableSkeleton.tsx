import { Skeleton, TableBody, TableCell, TableRow } from '@mui/material'
export function TableSkeleton({ columns, rows=6 }: { columns:number; rows?:number }) { return <TableBody>{Array.from({length:rows},(_,row)=><TableRow key={row}>{Array.from({length:columns},(_,column)=><TableCell key={column}><Skeleton height={24}/></TableCell>)}</TableRow>)}</TableBody> }
