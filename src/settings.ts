"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { defaultButtonColor } from "./playlist";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class PlaybackCardSettings extends FormattingSettingsCard {
    public extraButtons = new formattingSettings.ToggleSwitch({
        name: "extraButtons",
        displayName: "Previous, next, and stop",
        description: "Show previous, next, and stop",
        value: false
    });

    public autoplay = new formattingSettings.ToggleSwitch({
        name: "autoplay",
        displayName: "Auto play",
        description: "Start playing when the report loads",
        value: false
    });

    public name: string = "playback";
    public displayName: string = "Playback";
    public slices: FormattingSettingsSlice[] = [this.extraButtons, this.autoplay];
}

class CircleCardSettings extends FormattingSettingsCard {
    public color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        description: "Circle color",
        value: { value: defaultButtonColor }
    });

    public name: string = "circle";
    public displayName: string = "Circle";
    public slices: FormattingSettingsSlice[] = [this.color];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    public circleCard = new CircleCardSettings();
    public playbackCard = new PlaybackCardSettings();
    public cards = [this.circleCard, this.playbackCard];
}
