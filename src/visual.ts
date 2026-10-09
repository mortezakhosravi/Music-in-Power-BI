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
import { iconInk, nextIndex, readChosenColor, readSongUrls, samePlaylist } from "./playlist";

const svgNamespace = "http://www.w3.org/2000/svg";

type ControlAction = "previous" | "main" | "next" | "stop";

export class Visual implements IVisual {
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
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
        this.target.querySelectorAll(".song-player__circle, .song-player__glyph-shape").forEach((node) => {
            const element = node as SVGElement;
            const color = element.classList.contains("song-player__circle") ? background : ink;
            paint(element, color);
        });
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

    private autoplay(): boolean {
        return this.formattingSettings.playbackCard.autoplay.value === true;
    }

    private layout(width: number, height: number): void {
        const layout = playerLayout(width, height, this.extraButtons());
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

    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "12");
    circle.classList.add("song-player__circle");
    svg.append(circle);

    if (action === "main") {
        svg.append(iconGroup("music", musicNote), iconGroup("mute", muteSpeaker));
        return svg;
    }
    svg.append(iconGroup(action, action === "previous" ? previousIcon : action === "next" ? nextIcon : stopIcon));
    return svg;
}

const musicNote = "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z";
const muteSpeaker = "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z";
const previousIcon = "M6 6h2v12H6zm3.5 6 8.5 6V6z";
const nextIcon = "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z";
const stopIcon = "M6 6h12v12H6z";

function iconGroup(name: string, pathData: string): SVGGElement {
    const group = document.createElementNS(svgNamespace, "g");
    group.setAttribute("transform", "translate(12 12) scale(0.72) translate(-12 -12)");
    group.classList.add("song-player__glyph", `song-player__glyph--${name}`);
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", pathData);
    path.classList.add("song-player__glyph-shape");
    group.append(path);
    return group;
}

function paint(element: SVGElement, color: string): void {
    element.setAttribute("fill", color);
    element.style.setProperty("fill", color, "important");
}
