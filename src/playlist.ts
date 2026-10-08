"use strict";

export const defaultButtonColor = "#18181b";

export function readSongUrls(values: readonly unknown[]): string[] {
    const urls: string[] = [];
    for (const value of values) {
        if (typeof value !== "string") {
            continue;
        }
        const trimmed = value.trim();
        if (isAudioUrl(trimmed)) {
            urls.push(trimmed);
        }
    }
    return urls;
}

export function isAudioUrl(value: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(value);
    }
    catch {
        return false;
    }
    return parsed.protocol === "https:" || parsed.protocol.endsWith("ttp:");
}

export function samePlaylist(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}

export function nextIndex(index: number, length: number): number | null {
    const next = index + 1;
    return next < length ? next : null;
}

export function normalizeHex(color: string): string | null {
    const match = /^#?([0-9a-fA-F]{6})$/.exec(color.trim());
    return match ? match[1].toLowerCase() : null;
}

export function toCssColor(color: string | undefined, fallback = defaultButtonColor): string {
    const hex = color ? normalizeHex(color) : null;
    return hex ? `#${hex}` : fallback;
}

export function iconInk(color: string): string {
    const hex = normalizeHex(color);
    if (!hex) {
        return "#ffffff";
    }
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return luminance > 0.62 ? "#18181b" : "#ffffff";
}
