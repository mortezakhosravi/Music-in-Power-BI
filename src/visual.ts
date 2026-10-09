"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";
import { iconInk, nextIndex, readChosenColor, readSongUrls, samePlaylist } from "./playlist";

const svgNamespace = "http://www.w3.org/2000/svg";

export class Visual implements IVisual {
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly audio: HTMLAudioElement;
    private readonly button: HTMLButtonElement;
    private readonly circle: SVGCircleElement;
    private readonly face: SVGSVGElement;
    private readonly playGlyph: SVGPathElement;
    private readonly pauseGlyph: SVGPathElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private urls: string[] = [];
    private index = 0;
    private currentUrl = "";

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

        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.className = "song-player__button";
        this.face = createFace();
        this.circle = this.face.querySelector("circle") as SVGCircleElement;
        this.playGlyph = this.face.querySelector(".song-player__glyph--play") as SVGPathElement;
        this.pauseGlyph = this.face.querySelector(".song-player__glyph--pause") as SVGPathElement;
        this.button.append(this.face);
        this.button.addEventListener("pointerdown", this.onPointerDown);
        this.button.addEventListener("pointerup", this.onPointerUp);
        this.button.addEventListener("click", this.onClick);
        this.button.addEventListener("keydown", this.onKeyDown);
        this.setPlaying(false);
        this.button.disabled = true;

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

        root.append(this.button, this.audio);
        this.target.append(root);
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
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.button.removeEventListener("pointerdown", this.onPointerDown);
        this.button.removeEventListener("pointerup", this.onPointerUp);
        this.button.removeEventListener("click", this.onClick);
        this.button.removeEventListener("keydown", this.onKeyDown);
    }

    private lastToggleMs = 0;

    private readonly onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) {
            return;
        }
        event.stopPropagation();
    };

    private readonly onPointerUp = (event: PointerEvent): void => {
        if (event.button !== 0) {
            return;
        }
        this.toggleFromUser(event);
    };

    private readonly onClick = (event: MouseEvent): void => {
        this.toggleFromUser(event);
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        this.toggleFromUser(event);
    };

    private toggleFromUser(event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        const now = Date.now();
        if (now - this.lastToggleMs < 250) {
            return;
        }
        this.lastToggleMs = now;
        this.togglePlayback();
    }

    private togglePlayback(): void {
        if (this.button.disabled || this.urls.length === 0) {
            return;
        }
        if (!this.audio.paused) {
            this.audio.pause();
            return;
        }
        this.loadCurrent(true);
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
            }
        }
        this.syncEnabled();
    }

    private syncEnabled(): void {
        this.button.disabled = this.urls.length === 0;
    }

    private applyColor(): void {
        const background = readChosenColor(this.formattingSettings.circleCard.color.value);
        const ink = iconInk(background);
        paint(this.circle, background);
        paint(this.playGlyph, ink);
        paint(this.pauseGlyph, ink);
    }

    private layout(width: number, height: number): void {
        const size = Math.max(36, Math.floor(Math.min(width, height)));
        this.button.style.width = `${size}px`;
        this.button.style.height = `${size}px`;
    }

    private setPlaying(playing: boolean): void {
        this.button.classList.toggle("is-playing", playing);
        this.playGlyph.style.display = playing ? "none" : "inline";
        this.pauseGlyph.style.display = playing ? "inline" : "none";
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

function createFace(): SVGSVGElement {
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("song-player__face");

    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "50");
    circle.classList.add("song-player__circle");

    svg.append(circle, createGlyph("play"), createGlyph("pause"));
    return svg;
}

function paint(element: SVGElement, color: string): void {
    element.setAttribute("fill", color);
    element.style.setProperty("fill", color, "important");
}

function createGlyph(kind: "play" | "pause"): SVGPathElement {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", kind === "play" ? "M40 30v40l34-20z" : "M36 30h10v40H36zm18 0h10v40H54z");
    path.classList.add("song-player__glyph", kind === "play" ? "song-player__glyph--play" : "song-player__glyph--pause");
    return path;
}
