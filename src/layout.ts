"use strict";

export interface PlayerLayout {
    direction: "row" | "column";
    main: number;
    side: number;
    gap: number;
}

export function playerLayout(width: number, height: number, showExtra: boolean, sameSize = false): PlayerLayout {
    const w = Math.max(0, Math.floor(width));
    const h = Math.max(0, Math.floor(height));
    const direction: PlayerLayout["direction"] = w >= h ? "row" : "column";
    if (!showExtra || w === 0 || h === 0) {
        return { direction, main: Math.min(w, h), side: 0, gap: 0 };
    }

    const along = direction === "row" ? w : h;
    const across = direction === "row" ? h : w;
    if (sameSize) {
        let size = Math.min(along, across);
        while (size > 0) {
            const gap = Math.max(1, Math.floor(size * 0.16));
            if (size * 4 + gap * 3 <= along && size <= across) {
                return { direction, main: size, side: size, gap };
            }
            size -= 1;
        }
        return { direction, main: Math.min(w, h), side: 0, gap: 0 };
    }
    let side = Math.min(along, across);
    while (side > 0) {
        const main = Math.min(across, Math.max(side, Math.floor(side * 1.7)));
        const gap = Math.max(1, Math.floor(side * 0.16));
        const usedAlong = side * 3 + main + gap * 3;
        const usedAcross = Math.max(main, side);
        if (usedAlong <= along && usedAcross <= across && main >= side) {
            return { direction, main, side, gap };
        }
        side -= 1;
    }

    return { direction, main: Math.min(w, h), side: 0, gap: 0 };
}
