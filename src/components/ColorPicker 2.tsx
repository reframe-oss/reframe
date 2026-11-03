import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pipette } from 'lucide-react';

interface ColorPickerProps {
    value: string;
    onChange: (hex: string) => void;
    label?: string;
}

const getGlassyClasses = (opacity = 10) =>
    `backdrop-filter backdrop-blur-lg bg-[var(--surface)] bg-opacity-${opacity} border border-[var(--border)] rounded-lg shadow-lg transition-all duration-300`;

function hexToHsv(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - Math.floor(h / 60);
    const p = v * (1 - s),
        q = v * (1 - f * s),
        t = v * (1 - (1 - f) * s);
    const sets: [number, number, number][] = [
        [v, t, p],
        [q, v, p],
        [p, v, t],
        [p, q, v],
        [t, p, v],
        [v, p, q],
    ];
    return sets[i]?.map(x => Math.round(x * 255)) as [number, number, number];
}

function rgbToHex(r: number, g: number, b: number) {
    return (
        '#' +
        [r, g, b]
            .map(x => x.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()
    );
}

const ColorPicker: React.FC<ColorPickerProps> = ({
    value,
    onChange,
    label,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [open, setOpen] = useState(false);

    const initialHex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#FFFFFF';
    const [initH, initS, initV] = hexToHsv(initialHex);

    const [hue, setHue] = useState(initH);
    const [sat, setSat] = useState(initS);
    const [val, setVal] = useState(initV);
    const CANVAS_W = 232,
        CANVAS_H = 140;
    const [cursorX, setCursorX] = useState(initS * (CANVAS_W - 1));
    const [cursorY, setCursorY] = useState((1 - initV) * (CANVAS_H - 1));
    const [hexInput, setHexInput] = useState(initialHex.slice(1).toUpperCase());
    const dragging = useRef(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

    const updatePosition = useCallback(() => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPanelPos({
                top: rect.bottom + window.scrollY + 6,
                left: rect.left + window.scrollX,
            });
        }
    }, []);

    useEffect(() => {
        if (open) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [open, updatePosition]);

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const w = canvas.width,
            h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const gH = ctx.createLinearGradient(0, 0, w, 0);
        gH.addColorStop(0, '#FFFFFF');
        gH.addColorStop(1, `hsl(${hue},100%,50%)`);
        ctx.fillStyle = gH;
        ctx.fillRect(0, 0, w, h);
        const gV = ctx.createLinearGradient(0, 0, 0, h);
        gV.addColorStop(0, 'rgba(0,0,0,0)');
        gV.addColorStop(1, '#000000');
        ctx.fillStyle = gV;
        ctx.fillRect(0, 0, w, h);
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, 6, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }, [hue, cursorX, cursorY]);

    useEffect(() => {
        if (open) drawCanvas();
    }, [open, drawCanvas]);

    const pickColor = useCallback(
        (clientX: number, clientY: number) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const cx = Math.max(0, Math.min(canvas.width - 1, (clientX - rect.left) * scaleX));
            const cy = Math.max(0, Math.min(canvas.height - 1, (clientY - rect.top) * scaleY));
            setCursorX(cx);
            setCursorY(cy);
            const s = cx / (canvas.width - 1);
            const v = 1 - cy / (canvas.height - 1);
            setSat(s);
            setVal(v);
            const [r_val, g_val, b_val] = hsvToRgb(hue, s, v);
            const hex = rgbToHex(r_val, g_val, b_val);
            setHexInput(hex.slice(1));
            onChange(hex);
        },
        [hue, onChange],
    );

    const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const h = Number(e.target.value);
        setHue(h);
        const [r_v, g_v, b_v] = hsvToRgb(h, sat, val);
        const hex = rgbToHex(r_v, g_v, b_v);
        setHexInput(hex.slice(1));
        onChange(hex);
    };

    const handleHexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
        setHexInput(v.toUpperCase());
        if (v.length === 6) {
            const full = '#' + v;
            const [h, s, v2] = hexToHsv(full);
            setHue(h);
            setSat(s);
            setVal(v2);
            setCursorX(s * (CANVAS_W - 1));
            setCursorY((1 - v2) * (CANVAS_H - 1));
            onChange(full.toUpperCase());
        }
    };

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const isTriggerClick = triggerRef.current?.contains(e.target as Node);
            const isPanelClick = panelRef.current?.contains(e.target as Node);
            if (!isTriggerClick && !isPanelClick) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleEyeDropper = async () => {
        if (!('EyeDropper' in window)) return;
        try {
            const eyeDropper = new (window as any).EyeDropper();
            const result = await eyeDropper.open();
            const hex = result.sRGBHex.toUpperCase();
            const [h, s, v2] = hexToHsv(hex);
            setHue(h);
            setSat(s);
            setVal(v2);
            setHexInput(hex.slice(1));
            setCursorX(s * (CANVAS_W - 1));
            setCursorY((1 - v2) * (CANVAS_H - 1));
            onChange(hex);
        } catch (_) { }
    };

    const [r, g, b] = hsvToRgb(hue, sat, val);

    return (
        <div className='w-full'>
            {label && (
                <label className='text-xs text-[var(--muted)] font-medium mb-1 block'>
                    {label}
                </label>
            )}

            <div className="flex items-center gap-2">
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setOpen(!open)}
                    className={`flex items-center gap-3 ${getGlassyClasses(20)} p-1.5 border border-[var(--border)] hover:bg-[var(--border)] active:scale-95 transition-transform`}
                    aria-label="Open custom palette"
                >
                    <span
                        className='w-7 h-6 rounded border border-white border-opacity-20 inline-block flex-shrink-0 shadow-inner'
                        style={{ background: value }}
                    />
                </button>

                <input
                    type='text'
                    value={hexInput}
                    onChange={handleHexInput}
                    maxLength={6}
                    className='flex-1 px-2 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-film-500'
                    spellCheck={false}
                />
            </div>

            {open &&
                createPortal(
                    <div
                        ref={panelRef}
                        className={`absolute z-[9999] p-3 ${getGlassyClasses(40)} border border-[var(--border)] w-60 flex flex-col gap-2.5 shadow-2xl backdrop-blur-xl`}
                        style={{
                            top: panelPos.top,
                            left: panelPos.left,
                            minWidth: 230,
                            position: 'absolute',
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            width={CANVAS_W}
                            height={CANVAS_H}
                            className='w-full rounded-md cursor-crosshair border border-[var(--border)] shadow-sm'
                            onMouseDown={e => {
                                dragging.current = true;
                                pickColor(e.clientX, e.clientY);
                            }}
                            onMouseMove={e => {
                                if (dragging.current) pickColor(e.clientX, e.clientY);
                            }}
                            onMouseUp={() => { dragging.current = false; }}
                            onMouseLeave={() => { dragging.current = false; }}
                        />

                        <div className='flex items-center gap-2.5'>
                            <span
                                className='w-7 h-7 rounded-full border border-white border-opacity-30 flex-shrink-0 shadow-sm'
                                style={{ background: `#${hexInput || 'FFFFFF'}` }}
                            />
                            <input
                                type='range'
                                min={0}
                                max={360}
                                value={hue}
                                onChange={handleHueChange}
                                className='flex-1 h-2 rounded-full cursor-pointer appearance-none border-none accent-transparent'
                                style={{
                                    background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                                }}
                            />

                            {/* 📍 THIS IS THE MISSING PIPETTE TRIGGER */}
                            {'EyeDropper' in window && (
                                <button
                                    type="button"
                                    onClick={handleEyeDropper}
                                    className={`${getGlassyClasses(20)} p-1 border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text)] flex-shrink-0`}
                                    aria-label="Pick color from screen"
                                >
                                    <Pipette size={14} />
                                </button>
                            )}
                        </div>
                        <div className='grid grid-cols-3 gap-1.5 text-center'>
                            {[
                                ['R', r],
                                ['G', g],
                                ['B', b],
                            ].map(([ch, v_rgb]) => (
                                <div key={ch as string} className={`${getGlassyClasses(10)} py-0.5 border border-[var(--border)]`}>
                                    <div className='text-[10px] text-[var(--muted)] font-medium'>{ch}</div>
                                    <div className='text-xs font-semibold text-[var(--text)]'>{v_rgb}</div>
                                </div>
                            ))}
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
};

export default ColorPicker;