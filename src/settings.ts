"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { defaultButtonColor } from "./playlist";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

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
    public cards = [this.circleCard];
}
