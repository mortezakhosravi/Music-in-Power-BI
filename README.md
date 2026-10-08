# Music-in-Power-BI

A Power BI visual with one play/pause button. Drop in a text column of direct audio URLs. Choose the button color from the format pane.

The packaged visual is [dist/songPlayer.pbiviz](dist/songPlayer.pbiviz).

## Use it in Power BI Desktop

1. Open a report.
2. In the Visualizations pane, select **Get more visuals** (`...`), then **Import a visual from a file**.
3. Choose `dist/songPlayer.pbiviz`.
4. Add **Song Player** to the page.
5. Drag the URL column into **Song URL**.
6. Open the format pane and set **Button > Color**.
7. Click the button to play. Click it again to pause.

Each row is a song, in order. When a song ends, the next row starts. After the last song, the button returns to play. Filtering the URL column changes which song the button plays.

Song values need to be direct `http` or `https` audio links, such as `.mp3`, `.wav`, `.ogg`, or `.m4a`. A link to a streaming page will not play. Power BI asks for web access the first time the visual loads a remote file.

## Build

```bash
npm install
npm test
npm run package
```
