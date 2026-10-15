import { Children, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, IconButton, Stack, useMediaQuery, useTheme, type SxProps, type Theme } from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
export interface MobileCarouselProps {
    label: string;
    children: ReactNode;
    desktopSx?: SxProps<Theme>;
    itemWidth?: string | number;
    itemLabels?: string[];
    arrows?: boolean;
    footer?: ReactNode;
}
/** Finite summaries, native scrolling and no listeners on desktop. */
export function MobileCarousel({ label, children, desktopSx, itemWidth = 'clamp(240px, 76vw, 320px)', itemLabels, arrows = true, footer }: MobileCarouselProps) {
    const theme = useTheme(), mobile = useMediaQuery(theme.breakpoints.down('md')), reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
    const cards = Children.toArray(children), track = useRef<HTMLDivElement>(null), [active, setActive] = useState(0), [tail, setTail] = useState(0);
    useEffect(() => {
        const el = track.current;
        if (!mobile || !el || cards.length < 2)
            return;
        let frame = 0;
        const update = () => {
            frame = 0;
            const items = Array.from(el.querySelectorAll<HTMLElement>('[data-carousel-item]'));
            const first = items[0]?.offsetLeft ?? 0;
            const last = items.at(-1);
            // Allow the last card to snap to its start even when two fit on tablet.
            // 16px account for the 12px gap and the 2px padding at both edges.
            const space = last ? Math.max(0, el.clientWidth - last.getBoundingClientRect().width - 16) : 0;
            setTail(previous => Math.abs(previous - space) > .5 ? space : previous);
            let closest = 0, distance = Infinity;
            items.forEach((item, index) => {
                const next = Math.abs(item.offsetLeft - first - el.scrollLeft);
                if (next < distance) { closest = index; distance = next; }
            });
            setActive(closest);
        };
        const schedule = () => { if (!frame)
            frame = requestAnimationFrame(update); };
        el.addEventListener('scroll', schedule, { passive: true });
        const observer = new ResizeObserver(schedule);
        observer.observe(el);
        update();
        return () => { el.removeEventListener('scroll', schedule); observer.disconnect(); if (frame)
            cancelAnimationFrame(frame); };
    }, [mobile, cards.length]);
    const moveTo = (index: number) => {
        const el = track.current;
        if (!el) return;
        const next = Math.max(0, Math.min(cards.length - 1, index));
        const items = el.querySelectorAll<HTMLElement>('[data-carousel-item]');
        if (items[next]) el.scrollTo({
            left: items[next].offsetLeft - (items[0]?.offsetLeft ?? 0),
            behavior: reduced ? 'auto' : 'smooth',
        });
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        // Leave arrow keys belonging to controls inside a card untouched.
        if (event.target !== event.currentTarget) return;
        const index = event.key === 'ArrowRight' ? active + 1
            : event.key === 'ArrowLeft' ? active - 1
            : event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : undefined;
        if (index === undefined) return;
        event.preventDefault();
        moveTo(index);
    };
    if (!mobile)
        return <Box sx={desktopSx}>{children}{footer && <Box sx={{ gridColumn: "1 / -1" }}>{footer}</Box>}</Box>;
    if (!cards.length)
        return null;
    return <Box data-mobile-carousel={label} sx={{ minWidth: 0, width: '100%' }}>
  <Box ref={track} role="region" aria-label={label} aria-roledescription="carrusel" tabIndex={0} onKeyDown={onKeyDown} sx={{ position: 'relative', display: 'flex', gap: 1.5, minWidth: 0, maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden', p: .25, scrollSnapType: 'x mandatory', scrollPaddingInline: '2px', overscrollBehaviorX: 'contain', touchAction: 'pan-x pan-y', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, borderRadius: 2, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>
   {cards.map((card, index) => <Box key={(card as {
        key?: string;
    }).key ?? index} data-carousel-item role="group" aria-label={`${index + 1} de ${cards.length}${itemLabels?.[index] ? ': ' + itemLabels[index] : ''}`} sx={{ flex: `0 0 ${typeof itemWidth === 'number' ? itemWidth + 'px' : itemWidth}`, minWidth: 0, maxWidth: 'calc(100% - 28px)', scrollSnapAlign: 'start', display: 'flex', '& > *': { width: '100%', height: '100%', minWidth: 0 } }}>{card}</Box>)}
   {cards.length > 1 && tail > 0 && <Box aria-hidden="true" sx={{ flex: `0 0 ${tail}px`, pointerEvents: "none" }}/>}
  </Box>
  {cards.length > 1 && <Stack direction="row" alignItems="center" justifyContent="space-between" gap={.25} sx={{ minHeight: 44 }}>
   {arrows && <IconButton aria-label={`Anterior en ${label}`} disabled={active === 0} onClick={() => moveTo(active - 1)} sx={{ width: 44, height: 44 }}><ChevronLeftRounded /></IconButton>}
   <Box sx={{ display: 'flex', justifyContent: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>{cards.map((_, index) => <IconButton key={index} aria-label={`Ver tarjeta ${index + 1} de ${cards.length}`} aria-current={active === index ? 'true' : undefined} onClick={() => moveTo(index)} sx={{ minWidth: 0, width: 44, height: 44, color: active === index ? 'primary.main' : 'text.disabled' }}><Box component="span" sx={{ width: active === index ? 15 : 6, height: 6, bgcolor: 'currentColor', borderRadius: 3 }}/></IconButton>)}</Box>
   {arrows && <IconButton aria-label={`Siguiente en ${label}`} disabled={active >= cards.length - 1} onClick={() => moveTo(active + 1)} sx={{ width: 44, height: 44 }}><ChevronRightRounded /></IconButton>}
  </Stack>}
  {footer && <Box sx={{ mt: 1, mb: 2 }}>{footer}</Box>}
 </Box>;
}
