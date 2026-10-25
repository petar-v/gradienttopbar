const parseComponent = (text, maximum) => {
    const match = text.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%)?$/i);
    if (!match)
        return null;

    const value = Number(match[1]);
    const limit = match[2] ? 100 : maximum;
    if (!Number.isFinite(value) || value < 0 || value > limit)
        return null;
    return value / limit * maximum;
};

// Supported settings syntax: hex and comma-separated rgb()/rgba(); invalid colors return null.
export const normalizeColor = color => {
    if (typeof color !== 'string')
        return null;
    const text = color.trim();
    let channels;
    let alpha;
    if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(text)) {
        let hex = text.slice(1);
        if (hex.length <= 4)
            hex = [...hex].map(digit => digit + digit).join('');
        const bytes = hex.match(/../g).map(byte => Number.parseInt(byte, 16));
        channels = bytes.slice(0, 3);
        alpha = (bytes[3] ?? 255) / 255;
    } else {
        const match = text.match(/^(rgb|rgba)\(([^()]*)\)$/i);
        if (!match)
            return null;
        const components = match[2].split(',');
        if (components.length !== (match[1].toLowerCase() === 'rgba' ? 4 : 3))
            return null;
        const rgb = components.slice(0, 3);
        // Legacy comma syntax requires the three channels to use the same unit.
        if (rgb.some(value => value.trim().endsWith('%')) && !rgb.every(value => value.trim().endsWith('%')))
            return null;
        channels = rgb.map(value => parseComponent(value, 255));
        alpha = components.length === 4 ? parseComponent(components[3], 1) : 1;
        if (channels.includes(null) || alpha === null)
            return null;
    }
    return `rgba(${channels.map(Math.round).join(',')},${alpha})`;
};
