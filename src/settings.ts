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

    public sameSize = new formattingSettings.ToggleSwitch({
        name: "sameSize",
        displayName: "Same size",
        description: "Make every button the same size",
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
    public slices: FormattingSettingsSlice[] = [this.extraButtons, this.sameSize, this.autoplay];
}

class CircleCardSettings extends FormattingSettingsCard {
    public color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        description: "Circle color",
        value: { value: defaultButtonColor }
    });

    public design = new formattingSettings.ItemDropdown({
        name: "design",
        displayName: "Design",
        description: "Filled icon or border line icon",
        items: [
            { value: "filled", displayName: "Filled icon" },
            { value: "outline", displayName: "Border line icon" }
        ],
        value: { value: "filled", displayName: "Filled icon" }
    });

    public theme = new formattingSettings.ItemDropdown({
        name: "theme",
        displayName: "Icon theme",
        description: "Classic flat icons or iOS 27 Liquid Glass",
        items: [
            { value: "classic", displayName: "Classic" },
            { value: "liquid", displayName: "iOS 27 Liquid Glass" }
        ],
        value: { value: "classic", displayName: "Classic" }
    });

    public name: string = "circle";
    public displayName: string = "Circle";
    public slices: FormattingSettingsSlice[] = [this.color, this.design, this.theme];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    public circleCard = new CircleCardSettings();
    public playbackCard = new PlaybackCardSettings();
    public cards = [this.circleCard, this.playbackCard];
}
