import assert from "node:assert/strict";
import test from "node:test";
import { playerLayout } from "../src/layout.ts";

test("uses the shorter side for a single circle", () => {
    assert.deepEqual(playerLayout(320, 240, false), { direction: "row", main: 240, side: 0, gap: 0 });
    assert.deepEqual(playerLayout(80, 500, false), { direction: "column", main: 80, side: 0, gap: 0 });
});

test("fits previous, next, and stop inside both axes", () => {
    for (const [width, height] of [[640, 140], [140, 640], [400, 400], [48, 48]] as const) {
        const layout = playerLayout(width, height, true);
        assert.equal(layout.direction, width >= height ? "row" : "column");
        assert.ok(layout.side > 0, `${width}x${height} should show side buttons`);
        assert.ok(layout.main >= layout.side);
        const along = layout.direction === "row" ? width : height;
        const across = layout.direction === "row" ? height : width;
        assert.ok(layout.side * 3 + layout.main + layout.gap * 3 <= along);
        assert.ok(Math.max(layout.main, layout.side) <= across);
    }
});

test("uses one size for every button when requested", () => {
    const layout = playerLayout(640, 150, true, true);
    assert.equal(layout.main, layout.side);
    assert.ok(layout.main > 0);
    assert.ok(layout.main * 4 + layout.gap * 3 <= 640);
    assert.ok(layout.main <= 150);
    assert.ok(layout.main < playerLayout(640, 150, true, false).main);
});
