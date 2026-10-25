// Draws a checkerboard background to make transparency visible.
export const drawCheckerboard = (cr, left, top, width, height, tileSize) => {
    for (let y = 0; y < height; y += tileSize) {
        for (let x = 0; x < width; x += tileSize) {
            const shade = (x / tileSize + y / tileSize) % 2 ? 0.72 : 0.9;
            cr.setSourceRGB(shade, shade, shade);
            cr.rectangle(left + x, top + y, tileSize, tileSize);
            cr.fill();
        }
    }
};
