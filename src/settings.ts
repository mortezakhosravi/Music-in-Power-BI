"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { defaultButtonColor } from "./playlist";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class ButtonCardSettings extends FormattingSettingsCard {
    public color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        description: "Play button color",
        value: { value: defaultButtonColor }
    });

    public name: string = "button";
    public displayName: string = "Button";
    public slices: FormattingSettingsSlice[] = [this.color];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    public buttonCard = new ButtonCardSettings();
    public cards = [this.buttonCard];
}
