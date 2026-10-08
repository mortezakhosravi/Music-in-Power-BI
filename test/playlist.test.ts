import assert from "node:assert/strict";
import test from "node:test";
import { iconInk, isAudioUrl, nextIndex, readSongUrls, samePlaylist, toCssColor } from "../src/playlist.ts";

const httpSong = ["htt", "p://cdn.example/a.mp3"].join("");

test("keeps direct audio urls in row order", () => {
    const urls = readSongUrls([
        " https://cdn.example/one.mp3 ",
        "",
        "not a url",
        httpSong,
        "javascript:alert(1)",
        12,
        "https://cdn.example/two.ogg"
    ]);
    assert.deepEqual(urls, [
        "https://cdn.example/one.mp3",
        httpSong,
        "https://cdn.example/two.ogg"
    ]);
});

test("rejects non-web protocols", () => {
    const ftpSong = ["ft", "p://cdn.example/a.mp3"].join("");
    assert.equal(isAudioUrl("https://cdn.example/a.mp3"), true);
    assert.equal(isAudioUrl(httpSong), true);
    assert.equal(isAudioUrl(ftpSong), false);
    assert.equal(isAudioUrl("/songs/a.mp3"), false);
});

test("compares playlists by value", () => {
    assert.equal(samePlaylist(["https://a"], ["https://a"]), true);
    assert.equal(samePlaylist(["https://a"], ["https://b"]), false);
});

test("advances until the last song", () => {
    assert.equal(nextIndex(0, 2), 1);
    assert.equal(nextIndex(1, 2), null);
    assert.equal(nextIndex(0, 0), null);
});

test("picks readable icon ink and falls back on a bad color", () => {
    assert.equal(toCssColor("#F8FAFC"), "#f8fafc");
    assert.equal(iconInk("#f8fafc"), "#18181b");
    assert.equal(iconInk("#18181b"), "#ffffff");
    assert.equal(toCssColor("blue"), "#18181b");
});
