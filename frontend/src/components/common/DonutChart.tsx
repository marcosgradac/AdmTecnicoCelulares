import React, { useMemo, useState } from 'react'

export function DonutChart({ data, size = 120, inner = 56, centerText }: { data: { label: string; value: number; color: string }[]; size?: number; inner?: number; centerText?: string | React.ReactNode }) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0) || 1, [data])
  const [hover, setHover] = useState<number | null>(null)

  let acc = 0
  const stops = data.map((d, idx) => {
    const start = (acc / total) * 100
    acc += d.value
    const end = (acc / total) * 100
    // if hovered, slightly brighten
    const color = idx === hover ? shadeColor(d.color, 14) : d.color
    return `${color} ${start}% ${end}%`
  }).join(', ')

  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: `conic-gradient(${stops})`,
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
    transition: 'transform 0.6s ease',
    transform: hover !== null ? 'scale(1.03)' : 'scale(1)'
  }

  const innerStyle: React.CSSProperties = {
    position: 'absolute',
    width: inner,
    height: inner,
    borderRadius: '50%',
    background: 'white',
    boxShadow: '0 6px 18px rgba(15,23,42,0.06)'
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ display: 'inline-grid', placeItems: 'center' }}>
        <div style={style}>
          <div style={innerStyle}></div>
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            {centerText}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((d, i) => (
          <div key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: d.color, boxShadow: i === hover ? '0 6px 20px rgba(0,0,0,0.08)' : 'none' }} />
            <div style={{ fontSize: 13 }}>
              <strong style={{ display: 'block' }}>{d.label}</strong>
              <span style={{ color: 'rgba(15,23,42,0.6)' }}>{Math.round((d.value / total) * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function shadeColor(hex: string, percent: number) {
  // simple lighten function; expects #rrggbb
  const num = parseInt(hex.replace('#', ''), 16)
  let r = (num >> 16) + Math.round(255 * (percent / 100))
  let g = ((num >> 8) & 0x00FF) + Math.round(255 * (percent / 100))
  let b = (num & 0x0000FF) + Math.round(255 * (percent / 100))
  r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b)
  return `#${(r<<16 | g<<8 | b).toString(16).padStart(6,'0')}`
}

export default DonutChart
