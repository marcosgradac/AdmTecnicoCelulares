// Dry-run only. This module deliberately has no filesystem deletion capability.
export function retentionPlan(entries){
 const ids=new Set();for(const x of entries){if(!/^[a-zA-Z0-9_-]+$/.test(x.id)||ids.has(x.id)||!Number.isFinite(Date.parse(x.createdAt))||!x.createdAt.endsWith('Z')||x.validated!==true||! /^[a-f0-9]{64}$/.test(x.sha256))throw Error('Invalid or duplicate catalogue entry');ids.add(x.id)}
 const ordered=[...entries].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id));const keep=new Set(),duplicates=[],hashes=new Map()
 for(const x of ordered){if(hashes.has(x.sha256))duplicates.push({id:x.id,duplicateOf:hashes.get(x.sha256)});else hashes.set(x.sha256,x.id)}
 for(const [count,period] of [[7,d=>d.toISOString().slice(0,10)],[4,d=>String(Math.floor((+d-345600000)/604800000))],[3,d=>d.toISOString().slice(0,7)]]){
  const selected=new Set();for(const x of ordered){const bucket=period(new Date(x.createdAt));if(selected.has(bucket))continue;if(selected.size===count)break;selected.add(bucket);keep.add(x.id)}
 }
 return {keep:[...keep],candidates:ordered.filter(x=>!keep.has(x.id)).map(x=>x.id),duplicates,deleteAutomatically:false}
}
