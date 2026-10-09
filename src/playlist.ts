"use strict";

export const defaultButtonColor = "#18181b";

export function readSongUrls(values: readonly unknown[]): string[] {
    const urls: string[] = [];
    for (const value of values) {
        const text = urlText(value);
        if (text && isAudioUrl(text)) {
            urls.push(text);
        }
    }
    return urls;
}

function urlText(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .replace(/^<+|>+$/g, "")
        .replace(/^['"]+|['"]+$/g, "");
    return trimmed || null;
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

export interface ParsedColor {
    red: number;
    green: number;
    blue: number;
    css: string;
}

export function parseCssColor(color: string | undefined): ParsedColor | null {
    if (!color) {
        return null;
    }
    const text = color.trim();
    const hex = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(text);
    if (hex) {
        let digits = hex[1];
        if (digits.length === 3) {
            digits = digits.split("").map((channel) => channel + channel).join("");
        }
        if (digits.length === 8) {
            digits = digits.slice(0, 6);
        }
        return channels(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6));
    }
    const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(text);
    if (!rgb) {
        return null;
    }
    const red = Number(rgb[1]);
    const green = Number(rgb[2]);
    const blue = Number(rgb[3]);
    if (red > 255 || green > 255 || blue > 255) {
        return null;
    }
    return channels(
        red.toString(16).padStart(2, "0"),
        green.toString(16).padStart(2, "0"),
        blue.toString(16).padStart(2, "0")
    );
}

function channels(red: string, green: string, blue: string): ParsedColor {
    return {
        red: parseInt(red, 16),
        green: parseInt(green, 16),
        blue: parseInt(blue, 16),
        css: `#${red}${green}${blue}`.toLowerCase()
    };
}

export function toCssColor(color: string | undefined, fallback = defaultButtonColor): string {
    return parseCssColor(color)?.css ?? fallback;
}

export function readChosenColor(value: unknown, fallback = defaultButtonColor): string {
    return toCssColor(colorString(value), fallback);
}

function colorString(value: unknown): string | undefined {
    if (typeof value === "string") {
        return value;
    }
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const record = value as { value?: unknown; solid?: { color?: unknown } };
    if (typeof record.solid?.color === "string") {
        return record.solid.color;
    }
    if (record.value !== undefined) {
        return colorString(record.value);
    }
    return undefined;
}

export function iconInk(color: string): string {
    const parsed = parseCssColor(color);
    if (!parsed) {
        return "#ffffff";
    }
    const luminance = relativeLuminance(parsed.red, parsed.green, parsed.blue);
    const whiteContrast = 1.05 / (luminance + 0.05);
    const blackContrast = (luminance + 0.05) / 0.05;
    return blackContrast >= whiteContrast ? "#18181b" : "#ffffff";
}

function relativeLuminance(red: number, green: number, blue: number): number {
    const channel = (value: number) => {
        const scaled = value / 255;
        return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}
