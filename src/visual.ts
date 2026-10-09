"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataView = powerbi.DataView;

import { playerLayout } from "./layout";
import { VisualFormattingSettingsModel } from "./settings";
import { iconInk, nextIndex, parseCssColor, readChosenColor, readSongUrls, samePlaylist, type ParsedColor } from "./playlist";

const svgNamespace = "http://www.w3.org/2000/svg";

type ControlAction = "previous" | "main" | "next" | "stop";

export class Visual implements IVisual {
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly root: HTMLElement;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly audio: HTMLAudioElement;
    private readonly controls: HTMLElement;
    private readonly previousButton: HTMLButtonElement;
    private readonly button: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;
    private readonly stopButton: HTMLButtonElement;
    private readonly musicGlyph: SVGGElement;
    private readonly muteGlyph: SVGGElement;
    private readonly resizeObserver: ResizeObserver;
    private readonly listeners = new AbortController();
    private formattingSettings: VisualFormattingSettingsModel;
    private urls: string[] = [];
    private index = 0;
    private currentUrl = "";
    private autoplayWasOn = false;
    private autoplayUsed = false;
    private userStopped = false;
    private readonly lastActionMs = new Map<ControlAction, number>();

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.target = options.element;
        this.target.replaceChildren();
        this.target.style.background = "transparent";
        this.target.style.border = "0";
        this.target.style.boxShadow = "none";
        this.target.style.overflow = "visible";

        const root = document.createElement("div");
        root.className = "song-player";
        this.root = root;

        this.controls = document.createElement("div");
        this.controls.className = "song-player__controls";
        this.previousButton = this.createControl("previous");
        this.button = this.createControl("main");
        this.nextButton = this.createControl("next");
        this.stopButton = this.createControl("stop");
        this.musicGlyph = this.button.querySelector(".song-player__glyph--music") as SVGGElement;
        this.muteGlyph = this.button.querySelector(".song-player__glyph--mute") as SVGGElement;
        this.controls.append(this.previousButton, this.button, this.nextButton, this.stopButton);
        this.setPlaying(false);
        this.syncEnabled();

        this.audio = document.createElement("audio");
        this.audio.className = "song-player__audio";
        this.audio.preload = "none";
        this.audio.setAttribute("playsinline", "true");
        this.audio.addEventListener("play", () => this.setPlaying(true));
        this.audio.addEventListener("pause", () => {
            if (!this.audio.ended) {
                this.setPlaying(false);
            }
        });
        this.audio.addEventListener("ended", () => this.onEnded());
        this.audio.addEventListener("error", () => this.setPlaying(false));

        root.append(this.controls, this.audio);
        this.target.append(root);
        this.applyColor();
        this.resizeObserver = new ResizeObserver(() => {
            const rect = this.target.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.layout(rect.width, rect.height);
            }
        });
        this.resizeObserver.observe(this.target);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                dataView
            );
            this.applyPlaylist(dataView, options.type);
            this.applyColor();
            this.applyOptions();
            this.layout(options.viewport.width, options.viewport.height);
            this.events.renderingFinished(options);
        }
        catch (error) {
            this.events.renderingFailed(options, error instanceof Error ? error.message : String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        this.resizeObserver.disconnect();
        this.listeners.abort();
        this.audio.pause();
        this.audio.removeAttribute("src");
    }

    private createControl(action: ControlAction): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `song-player__button song-player__button--${action}`;
        button.append(createFace(action));
        if (action !== "main") {
            button.setAttribute("aria-label", action === "previous" ? "Previous" : action === "next" ? "Next" : "Stop");
        }
        const signal = this.listeners.signal;
        button.addEventListener("pointerdown", this.onPointerDown, { signal });
        button.addEventListener("pointerup", (event) => this.onPointerUp(event, action), { signal });
        button.addEventListener("click", (event) => this.onClick(event, action), { signal });
        button.addEventListener("keydown", (event) => this.onKeyDown(event, action), { signal });
        return button;
    }

    private readonly onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) {
            return;
        }
        event.stopPropagation();
    };

    private onPointerUp(event: PointerEvent, action: ControlAction): void {
        if (event.button !== 0) {
            return;
        }
        this.runFromUser(event, action);
    }

    private onClick(event: MouseEvent, action: ControlAction): void {
        this.runFromUser(event, action);
    }

    private onKeyDown(event: KeyboardEvent, action: ControlAction): void {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        this.runFromUser(event, action);
    }

    private runFromUser(event: Event, action: ControlAction): void {
        event.preventDefault();
        event.stopPropagation();
        const now = Date.now();
        if (now - (this.lastActionMs.get(action) ?? 0) < 250) {
            return;
        }
        this.lastActionMs.set(action, now);
        if (this.urls.length === 0 || (action !== "main" && !this.extraButtons())) {
            return;
        }
        if (action === "previous") {
            this.previous();
            return;
        }
        if (action === "next") {
            this.next();
            return;
        }
        if (action === "stop") {
            this.stop();
            return;
        }
        this.togglePlayback();
    }

    private togglePlayback(): void {
        if (!this.audio.paused) {
            this.userStopped = true;
            this.audio.pause();
            return;
        }
        this.userStopped = false;
        this.loadCurrent(true);
    }

    private stop(): void {
        this.userStopped = true;
        this.audio.pause();
        try {
            this.audio.currentTime = 0;
        }
        catch {
            // The element has no seekable source yet.
        }
        this.setPlaying(false);
    }

    private previous(): void {
        const wasPlaying = !this.audio.paused;
        if (this.audio.currentTime > 1.5 || this.index === 0) {
            try {
                this.audio.currentTime = 0;
            }
            catch {
                // Restart is skipped until the file can seek.
            }
            if (wasPlaying) {
                this.loadCurrent(true);
            }
            return;
        }
        this.index -= 1;
        this.currentUrl = "";
        this.loadCurrent(wasPlaying);
    }

    private next(): void {
        const wasPlaying = !this.audio.paused;
        const next = nextIndex(this.index, this.urls.length);
        this.index = next === null ? 0 : next;
        this.currentUrl = "";
        this.loadCurrent(wasPlaying);
    }

    private onEnded(): void {
        const next = nextIndex(this.index, this.urls.length);
        if (next === null) {
            this.index = 0;
            this.currentUrl = "";
            this.loadCurrent(false);
            this.setPlaying(false);
            return;
        }
        this.index = next;
        this.currentUrl = "";
        this.loadCurrent(true);
    }

    private loadCurrent(autoplay: boolean): void {
        const url = this.urls[this.index];
        if (!url) {
            this.currentUrl = "";
            this.audio.removeAttribute("src");
            this.setPlaying(false);
            return;
        }
        if (this.currentUrl !== url) {
            this.currentUrl = url;
            this.audio.src = url;
        }
        if (!autoplay) {
            return;
        }
        const playback = this.audio.play();
        if (playback) {
            playback.catch(() => this.setPlaying(false));
        }
    }

    private applyPlaylist(dataView: DataView | undefined, updateType: number | undefined): void {
        const includesData = updateType === undefined || (updateType & 2) !== 0;
        if (!includesData) {
            this.syncEnabled();
            return;
        }
        const values = readUrlValues(dataView);
        if (values === null) {
            this.syncEnabled();
            return;
        }
        const urls = readSongUrls(values);
        if (!samePlaylist(this.urls, urls)) {
            const kept = this.currentUrl ? urls.indexOf(this.currentUrl) : -1;
            this.urls = urls;
            if (kept >= 0) {
                this.index = kept;
            }
            else {
                this.index = 0;
                this.currentUrl = "";
                this.audio.pause();
                this.loadCurrent(false);
                this.autoplayUsed = false;
            }
        }
        this.syncEnabled();
    }

    private syncEnabled(): void {
        const enabled = this.urls.length > 0;
        for (const button of [this.previousButton, this.button, this.nextButton, this.stopButton]) {
            if (button) {
                button.disabled = !enabled;
            }
        }
    }

    private applyColor(): void {
        const background = readChosenColor(this.formattingSettings.circleCard.color.value);
        const ink = iconInk(background);
        const outline = this.outlineIcons();
        const liquid = this.liquidGlass();
        const glyphStroke = outline ? (liquid ? ink : background) : "none";
        this.root.classList.toggle("is-outline", outline);
        this.root.classList.toggle("is-liquid", liquid);
        this.target.querySelectorAll(".song-player__circle").forEach((node) => {
            const element = node as SVGCircleElement;
            element.setAttribute("r", outline ? "10.6" : "12");
            paint(element, outline ? "none" : background, outline ? background : "none", outline ? "1.8" : "0");
        });
        this.target.querySelectorAll(".song-player__glyph-shape").forEach((node) => {
            const element = node as SVGElement;
            const filledPath = element.getAttribute("data-filled") ?? "";
            const linePath = element.getAttribute("data-outline") ?? filledPath;
            element.setAttribute("d", outline ? linePath : filledPath);
            element.style.display = "inline";
            const maskId = element.getAttribute("data-mask");
            if (maskId && !outline) {
                element.setAttribute("mask", `url(#${maskId})`);
            }
            else {
                element.removeAttribute("mask");
            }
            paint(element, outline ? "none" : ink, glyphStroke, outline ? "1.8" : "0");
        });
        this.target.querySelectorAll(".song-player__glyph-gap").forEach((node) => {
            const element = node as SVGElement;
            if (outline || liquid) {
                element.style.display = "none";
                return;
            }
            element.style.display = "inline";
            element.setAttribute("d", element.getAttribute("data-filled") ?? "");
            paint(element, background, "none", "0");
        });
        this.paintGlass(background);
    }

    private applyOptions(): void {
        const showExtra = this.extraButtons();
        for (const button of [this.previousButton, this.nextButton, this.stopButton]) {
            button.classList.toggle("is-hidden", !showExtra);
            button.setAttribute("aria-hidden", showExtra ? "false" : "true");
        }
        this.maybeAutoplay();
    }

    private maybeAutoplay(): void {
        const enabled = this.autoplay();
        const turnedOn = enabled && !this.autoplayWasOn;
        this.autoplayWasOn = enabled;
        if (turnedOn) {
            this.autoplayUsed = false;
            this.userStopped = false;
        }
        if (!enabled || this.userStopped || this.autoplayUsed || this.urls.length === 0 || !this.audio.paused) {
            return;
        }
        this.autoplayUsed = true;
        this.loadCurrent(true);
    }

    private extraButtons(): boolean {
        return this.formattingSettings.playbackCard.extraButtons.value === true;
    }

    private sameButtonSize(): boolean {
        return this.formattingSettings.playbackCard.sameSize.value === true;
    }

    private outlineIcons(): boolean {
        const selected = this.formattingSettings.circleCard.design.value;
        return selected?.value === "outline";
    }

    private liquidGlass(): boolean {
        const selected = this.formattingSettings.circleCard.theme.value;
        return selected?.value === "liquid";
    }

    private paintGlass(color: string): void {
        const parsed = parseCssColor(color);
        if (!parsed) {
            return;
        }
        const light = shifted(parsed, 255, 0.62);
        const mid = shifted(parsed, 255, 0.18);
        const edge = shifted(parsed, 0, 0.38);
        const rim = shifted(parsed, 0, 0.55);
        paintStop(this.target, ".song-player__glass-core", light, "0.78");
        paintStop(this.target, ".song-player__glass-mid", mid, "0.5");
        paintStop(this.target, ".song-player__glass-edge", edge, "0.82");
        this.target.querySelectorAll(".song-player__glass-rim").forEach((node) => {
            paint(node as SVGElement, "none", rgba(rim, 0.92), "1.25");
        });
    }

    private autoplay(): boolean {
        return this.formattingSettings.playbackCard.autoplay.value === true;
    }

    private layout(width: number, height: number): void {
        const layout = playerLayout(width, height, this.extraButtons(), this.sameButtonSize());
        this.controls.classList.toggle("is-column", layout.direction === "column");
        this.controls.style.gap = `${layout.gap}px`;
        this.button.style.width = `${layout.main}px`;
        this.button.style.height = `${layout.main}px`;
        for (const button of [this.previousButton, this.nextButton, this.stopButton]) {
            button.style.width = `${layout.side}px`;
            button.style.height = `${layout.side}px`;
        }
    }

    private setPlaying(playing: boolean): void {
        this.button.classList.toggle("is-playing", playing);
        this.musicGlyph.style.display = playing ? "inline" : "none";
        this.muteGlyph.style.display = playing ? "none" : "inline";
        this.button.setAttribute("aria-label", playing ? "Pause" : "Play");
        this.button.setAttribute("aria-pressed", playing ? "true" : "false");
    }
}

function readUrlValues(dataView: DataView | undefined): readonly unknown[] | null {
    if (!dataView) {
        return null;
    }
    const categorical = [
        ...(dataView.categorical?.categories ?? []),
        ...(dataView.categorical?.values ?? [])
    ];
    const match = categorical.find((column) => column.source.roles && column.source.roles["url"]);
    if (match) {
        return match.values ?? [];
    }
    if (categorical.length === 1) {
        return categorical[0].values ?? [];
    }
    const table = dataView.table;
    if (table?.rows) {
        const columns = table.columns ?? [];
        const roleIndex = columns.findIndex((column) => column.roles && column.roles["url"]);
        const columnIndex = roleIndex >= 0 ? roleIndex : (columns.length === 1 ? 0 : -1);
        if (columnIndex >= 0) {
            return table.rows.map((row) => row[columnIndex]);
        }
    }
    const metadata = dataView.metadata?.columns ?? [];
    if (metadata.length > 0 && !metadata.some((column) => column.roles && column.roles["url"])) {
        return [];
    }
    return null;
}

function createFace(action: ControlAction): SVGSVGElement {
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("song-player__face");
    const defs = svgEl("defs", {});
    svg.append(defs);

    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "12");
    circle.classList.add("song-player__circle");
    svg.append(circle, createGlass(defs));

    if (action === "main") {
        const maskId = appendMuteMask(defs);
        svg.append(
            iconGroup("music", [{ filled: musicNote, outline: musicNoteLine }]),
            iconGroup("mute", [
                { filled: muteSpeaker, outline: muteSpeaker },
                { filled: muteGap, outline: "", gap: true },
                { filled: muteSlash, outline: muteSlashLine }
            ], maskId)
        );
        return svg;
    }
    const filled = action === "previous" ? previousIcon : action === "next" ? nextIcon : stopIcon;
    const line = action === "previous" ? previousLine : action === "next" ? nextLine : stopLine;
    svg.append(iconGroup(action, [{ filled, outline: line }]));
    return svg;
}

const musicNote = "M9.04 6.05C9.10 5.15 9.55 4.48 10.55 4.28C12.55 3.95 15.15 4.45 17.05 5.55C17.85 6.02 18.19 6.50 18.19 7.20L18.19 13.40C18.19 14.55 17.55 15.45 16.40 15.85C15.35 16.20 14.55 15.95 14.40 15.20C14.28 14.55 14.75 13.95 15.70 13.72C16.40 13.55 16.94 13.40 16.94 12.55L16.94 7.40C16.85 6.85 16.15 6.45 15.10 6.15C13.35 5.68 11.55 5.45 10.28 5.95L10.28 17.96A2.04 2.04 0 1 1 9.04 16.16L9.04 6.05Z";
const musicNoteLine = "M9.56 17.96A1.45 1.45 0 0 1 6.66 17.96A1.45 1.45 0 0 1 9.56 17.96M9.66 6.00L9.66 17.15M9.70 5.75C12.30 4.70 15.50 5.05 17.20 6.40C17.75 6.85 17.56 7.20 17.56 7.60L17.56 14.85";
const muteSpeaker = "M8.05 9.25H5.45C4.52 9.25 4.05 9.72 4.05 10.58V13.42C4.05 14.28 4.52 14.75 5.45 14.75H8.05L13.42 19.12C14.02 19.58 14.95 19.16 14.95 18.38V5.62C14.95 4.84 14.02 4.42 13.42 4.88Z";
const muteGap = "M7.64 19.47L18.94 6.07A1.42 1.42 0 1 1 16.76 4.23L5.46 17.63A1.42 1.42 0 1 1 7.64 19.47Z";
const muteSlash = "M7.15 19.05L18.45 5.65A0.78 0.78 0 1 1 17.25 4.65L5.95 18.05A0.78 0.78 0 1 1 7.15 19.05Z";
const muteSlashLine = "M6.55 18.55L17.85 5.15";
const previousIcon = "M5.67 5.15L5.68 5.15Q6.80 5.15 6.80 6.27L6.80 17.73Q6.80 18.85 5.68 18.85L5.67 18.85Q4.55 18.85 4.55 17.73L4.55 6.27Q4.55 5.15 5.67 5.15ZM10.27 10.79L16.20 6.85Q18.45 5.35 18.45 8.06L18.45 15.94Q18.45 18.65 16.20 17.15L10.27 13.21Q8.45 12.00 10.27 10.79Z";
const previousLine = "M5.68 6.35L5.68 17.65M10.57 11.05L15.76 7.56Q17.55 6.35 17.55 8.51L17.55 15.49Q17.55 17.65 15.76 16.44L10.57 12.95Q9.15 12.00 10.57 11.05Z";
const nextIcon = "M18.32 5.15L18.33 5.15Q19.45 5.15 19.45 6.27L19.45 17.73Q19.45 18.85 18.33 18.85L18.32 18.85Q17.20 18.85 17.20 17.73L17.20 6.27Q17.20 5.15 18.32 5.15ZM13.73 10.79L7.80 6.85Q5.55 5.35 5.55 8.06L5.55 15.94Q5.55 18.65 7.80 17.15L13.73 13.21Q15.55 12.00 13.73 10.79Z";
const nextLine = "M18.32 6.35L18.32 17.65M13.43 11.05L8.24 7.56Q6.45 6.35 6.45 8.51L6.45 15.49Q6.45 17.65 8.24 16.44L13.43 12.95Q14.85 12.00 13.43 11.05Z";
const stopIcon = "M8.55 5.85L15.45 5.85Q18.15 5.85 18.15 8.55L18.15 15.45Q18.15 18.15 15.45 18.15L8.55 18.15Q5.85 18.15 5.85 15.45L5.85 8.55Q5.85 5.85 8.55 5.85Z";
const stopLine = "M8.90 6.75L15.10 6.75Q17.25 6.75 17.25 8.90L17.25 15.10Q17.25 17.25 15.10 17.25L8.90 17.25Q6.75 17.25 6.75 15.10L6.75 8.90Q6.75 6.75 8.90 6.75Z";

interface GlyphPart {
    filled: string;
    outline: string;
    gap?: boolean;
}

let surfaceSerial = 0;

function iconGroup(name: string, parts: readonly GlyphPart[], maskId?: string): SVGGElement {
    const group = document.createElementNS(svgNamespace, "g");
    group.setAttribute("transform", "translate(12 12) scale(0.86) translate(-12 -12)");
    group.classList.add("song-player__glyph", `song-player__glyph--${name}`);
    parts.forEach((part, index) => {
        const path = document.createElementNS(svgNamespace, "path");
        path.setAttribute("d", part.filled);
        path.setAttribute("data-filled", part.filled);
        path.setAttribute("data-outline", part.outline);
        path.classList.add(part.gap ? "song-player__glyph-gap" : "song-player__glyph-shape");
        if (maskId && index === 0) {
            path.setAttribute("data-mask", maskId);
        }
        group.append(path);
    });
    return group;
}

function createGlass(defs: SVGElement): SVGElement {
    const id = ++surfaceSerial;
    const body = svgEl("radialGradient", { id: `song-glass-body-${id}`, cx: "36%", cy: "24%", r: "78%" });
    body.append(
        svgEl("stop", { offset: "0%", class: "song-player__glass-core" }),
        svgEl("stop", { offset: "52%", class: "song-player__glass-mid" }),
        svgEl("stop", { offset: "100%", class: "song-player__glass-edge" })
    );
    const sheen = svgEl("linearGradient", { id: `song-glass-sheen-${id}`, x1: "0", y1: "0", x2: "0", y2: "1" });
    sheen.append(
        svgEl("stop", { offset: "0%", "stop-color": "#ffffff", "stop-opacity": "0.95" }),
        svgEl("stop", { offset: "58%", "stop-color": "#ffffff", "stop-opacity": "0" })
    );
    const floor = svgEl("linearGradient", { id: `song-glass-floor-${id}`, x1: "0", y1: "1", x2: "0", y2: "0" });
    floor.append(
        svgEl("stop", { offset: "0%", "stop-color": "#ffffff", "stop-opacity": "0.55" }),
        svgEl("stop", { offset: "55%", "stop-color": "#ffffff", "stop-opacity": "0" })
    );
    const filter = svgEl("filter", { id: `song-glass-blur-${id}`, x: "-50%", y: "-50%", width: "200%", height: "200%" });
    filter.append(svgEl("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "0.5" }));
    defs.append(body, sheen, floor, filter);

    const group = svgEl("g", { class: "song-player__glass" });
    group.append(
        svgEl("circle", { cx: "12", cy: "12.7", r: "10.5", fill: "rgba(0, 0, 0, 0.28)", filter: `url(#song-glass-blur-${id})`, class: "song-player__glass-shadow" }),
        svgEl("circle", { cx: "12", cy: "12", r: "11.2", fill: `url(#song-glass-body-${id})`, class: "song-player__glass-body" }),
        svgEl("circle", { cx: "12", cy: "12", r: "11.05", fill: "none", class: "song-player__glass-rim" }),
        svgEl("ellipse", { cx: "12", cy: "7.15", rx: "6.4", ry: "3.15", fill: `url(#song-glass-sheen-${id})` }),
        svgEl("ellipse", { cx: "12", cy: "17.4", rx: "5.2", ry: "1.35", fill: `url(#song-glass-floor-${id})` })
    );
    return group;
}

function appendMuteMask(defs: SVGElement): string {
    const id = `song-mute-${++surfaceSerial}`;
    const mask = svgEl("mask", { id, maskContentUnits: "userSpaceOnUse" });
    mask.append(
        svgEl("rect", { x: "-12", y: "-12", width: "48", height: "48", fill: "#ffffff" }),
        svgEl("path", { d: muteGap, fill: "#000000" })
    );
    defs.append(mask);
    return id;
}

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
    const node = document.createElementNS(svgNamespace, name);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") {
            node.setAttribute("class", value);
        }
        else {
            node.setAttribute(key, value);
        }
    }
    return node;
}

function shifted(color: ParsedColor, toward: number, amount: number): ParsedColor {
    const channel = (value: number) => Math.round(value + (toward - value) * amount);
    const red = channel(color.red);
    const green = channel(color.green);
    const blue = channel(color.blue);
    const hex = [red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("");
    return { red, green, blue, css: `#${hex}` };
}

function rgba(color: ParsedColor, alpha: number): string {
    return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
}

function paintStop(root: ParentNode, selector: string, color: ParsedColor, opacity: string): void {
    root.querySelectorAll(selector).forEach((node) => {
        node.setAttribute("stop-color", color.css);
        node.setAttribute("stop-opacity", opacity);
    });
}

function paint(element: SVGElement, fill: string, stroke: string, strokeWidth: string): void {
    element.setAttribute("fill", fill);
    element.style.setProperty("fill", fill, "important");
    element.setAttribute("stroke", stroke);
    element.style.setProperty("stroke", stroke, "important");
    element.setAttribute("stroke-width", strokeWidth);
    element.style.setProperty("stroke-width", strokeWidth, "important");
    element.style.setProperty("stroke-linejoin", "round", "important");
    element.style.setProperty("stroke-linecap", "round", "important");
}
