# Music-in-Power-BI

A Power BI visual with one transparent play/pause circle. Drop in a text column of direct audio URLs. Set the circle color from the visual format pane.

The packaged visual is [dist/songPlayer.pbiviz](dist/songPlayer.pbiviz) (version 1.3.0.0). The same file is on the project page: [songPlayer.pbiviz](https://mortezakhosravi.github.io/Music-in-Power-BI/songPlayer.pbiviz).

Project page: [mortezakhosravi.github.io/Music-in-Power-BI](https://mortezakhosravi.github.io/Music-in-Power-BI/)

## Report view

The circle is the only painted shape. Play and pause are the icon inside it. Color comes from **Circle > Color** in the visual format pane.

![Play](docs/images/report-play.png)

![Pause](docs/images/report-pause.png)

![Format pane color](docs/images/report-color.png)

![Light circle](docs/images/report-light.png)

These pictures are the packaged visual in report view: an SVG circle on the report canvas, with the visual background and border off. Power BI Desktop is not available in this environment, so the pictures were captured from the same JavaScript package Power BI loads.

## Use it in Power BI Desktop

1. Open a report.
2. In the Visualizations pane, select **Get more visuals** (`...`), then **Import a visual from a file**.
3. Choose `dist/songPlayer.pbiviz`.
4. Add **Song Player** to the page.
5. Drag the URL column into **Song URL**.
6. Open the visual’s format pane and set **Circle > Color**. That color is the circle.
7. Under **General > Effects**, turn **Background** and **Visual border** off so the report shows only the circle.
8. Click the circle to play. Click it again to pause.

Each row is a song, in order. When a song ends, the next row starts. After the last song, the button returns to play. Filtering the URL column changes which song the button plays.

Song values need to be direct `http` or `https` audio links, such as `.mp3`, `.wav`, `.ogg`, or `.m4a`. A link to a streaming page will not play. The first time a song loads, Power BI asks for web access. Choose **Allow**.

The play and pause mark takes the readable contrast against **Circle > Color**: a light circle gets a dark mark, and a dark circle gets a white mark. Click the circle to play. If a format or resize update arrives while a song is playing, playback keeps going.

## Example data

[docs/songs.csv](docs/songs.csv) has three direct MP3 links. In Power BI Desktop, choose **Get data > Text/CSV**, select that file, and load it. Drag **Song URL** into the visual’s **Song URL** field.

| Song | Song URL |
| --- | --- |
| Morning Drive | https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3 |
| Night Circuit | https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3 |
| Open Road | https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3 |

These are SoundHelix example tracks. They are direct audio files, which is the shape the visual can play.

## Build

```bash
npm install
npm test
npm run package
```
