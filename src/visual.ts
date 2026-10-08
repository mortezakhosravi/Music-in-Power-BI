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
import { iconInk, nextIndex, readSongUrls, samePlaylist, toCssColor } from "./playlist";

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
        this.button.addEventListener("click", this.onToggle);
        this.setPlaying(false);
        this.button.disabled = true;

        this.audio = document.createElement("audio");
        this.audio.className = "song-player__audio";
        this.audio.preload = "none";
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
            const urls = readUrls(dataView);
            if (!samePlaylist(this.urls, urls)) {
                this.urls = urls;
                this.index = 0;
                this.currentUrl = "";
                this.audio.pause();
                this.loadCurrent(false);
            }
            this.button.disabled = this.urls.length === 0;
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
        this.button.removeEventListener("click", this.onToggle);
    }

    private readonly onToggle = (): void => {
        if (this.button.disabled || this.urls.length === 0) {
            return;
        }
        if (!this.audio.paused) {
            this.audio.pause();
            return;
        }
        this.loadCurrent(true);
    };

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

    private applyColor(): void {
        const selected = this.formattingSettings.circleCard.color.value.value;
        const background = toCssColor(selected);
        this.circle.setAttribute("fill", background);
        this.face.style.color = iconInk(background);
    }

    private layout(width: number, height: number): void {
        const size = Math.max(36, Math.floor(Math.min(width, height)));
        this.button.style.width = `${size}px`;
        this.button.style.height = `${size}px`;
    }

    private setPlaying(playing: boolean): void {
        this.button.classList.toggle("is-playing", playing);
        this.playGlyph.toggleAttribute("hidden", playing);
        this.pauseGlyph.toggleAttribute("hidden", !playing);
        this.button.setAttribute("aria-label", playing ? "Pause" : "Play");
        this.button.setAttribute("aria-pressed", playing ? "true" : "false");
    }
}

function readUrls(dataView: DataView | undefined): string[] {
    const columns = dataView?.categorical?.categories ?? [];
    const urlColumn = columns.find((column) => column.source.roles && column.source.roles["url"]) ?? columns[0];
    return readSongUrls(urlColumn?.values ?? []);
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

function createGlyph(kind: "play" | "pause"): SVGPathElement {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", kind === "play" ? "M40 30v40l34-20z" : "M36 30h10v40H36zm18 0h10v40H54z");
    path.classList.add("song-player__glyph", kind === "play" ? "song-player__glyph--play" : "song-player__glyph--pause");
    return path;
}
