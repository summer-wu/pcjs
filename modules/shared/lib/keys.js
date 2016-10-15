/**
 * @fileoverview Defines browser keyboard constants.
 * @author <a href="mailto:Jeff@pcjs.org">Jeff Parsons</a>
 * @copyright © Jeff Parsons 2012-2016
 *
 * This file is part of PCjs, a computer emulation software project at <http://pcjs.org/>.
 *
 * PCjs is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 *
 * PCjs is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with PCjs.  If not,
 * see <http://www.gnu.org/licenses/gpl.html>.
 *
 * You are required to include the above copyright notice in every modified copy of this work
 * and to display that copyright notice when the software starts running; see COPYRIGHT in
 * <http://pcjs.org/modules/shared/lib/defines.js>.
 *
 * Some PCjs files also attempt to load external resource files, such as character-image files,
 * ROM files, and disk image files. Those external resource files are not considered part of PCjs
 * for purposes of the GNU General Public License, and the author does not claim any copyright
 * as to their contents.
 */

"use strict";

var Keys = {
    /*
     * Alphanumeric and other common (printable) ASCII codes.
     *
     * TODO: Determine what we can do to get ALL constants like these inlined (enum doesn't seem to
     * get the job done); the problem seems to be limited to property references that use quotes, which
     * is why I've 'unquoted' as many of them as possible.
     */
    ASCII: {
         CTRL_A:  1, CTRL_C:  3, CTRL_Z: 26,
            ' ': 32,    '!': 33,    '"': 34,    '#': 35,    '$': 36,    '%': 37,    '&': 38,    "'": 39,
            '(': 40,    ')': 41,    '*': 42,    '+': 43,    ',': 44,    '-': 45,    '.': 46,    '/': 47,
            '0': 48,    '1': 49,    '2': 50,    '3': 51,    '4': 52,    '5': 53,    '6': 54,    '7': 55,
            '8': 56,    '9': 57,    ':': 58,    ';': 59,    '<': 60,    '=': 61,    '>': 62,    '?': 63,
            '@': 64,     A:  65,     B:  66,     C:  67,     D:  68,     E:  69,     F:  70,     G:  71,
             H:  72,     I:  73,     J:  74,     K:  75,     L:  76,     M:  77,     N:  78,     O:  79,
             P:  80,     Q:  81,     R:  82,     S:  83,     T:  84,     U:  85,     V:  86,     W:  87,
             X:  88,     Y:  89,     Z:  90,    '[': 91,    '\\':92,    ']': 93,    '^': 94,    '_': 95,
            '`': 96,     a:  97,     b:  98,     c:  99,     d: 100,     e: 101,     f: 102,     g: 103,
             h:  104,    i: 105,     j: 106,     k: 107,     l: 108,     m: 109,     n: 110,     o: 111,
             p:  112,    q: 113,     r: 114,     s: 115,     t: 116,     u: 117,     v: 118,     w: 119,
             x:  120,    y: 121,     z: 122,    '{':123,    '|':124,    '}':125,    '~':126
    },
    /*
     * Browser keyCodes we must pay particular attention to.  For the most part, these are non-alphanumeric
     * or function keys, some which may require special treatment (eg, preventDefault() if returning false on
     * the initial keyDown event is insufficient).
     *
     * keyCodes for most common ASCII keys can simply use the appropriate ASCII code above.
     *
     * Most of these represent non-ASCII keys (eg, the LEFT arrow key), yet for some reason, browsers defined
     * them using ASCII codes (eg, the LEFT arrow key uses the ASCII code for '%' or 37).
     */
    KEYCODE: {
        /* 0x08 */ BS:          8,
        /* 0x09 */ TAB:         9,
        /* 0x0A */ LF:          10,         // TODO: Determine if any key actually generates this
        /* 0x0D */ CR:          13,
        /* 0x10 */ SHIFT:       16,
        /* 0x11 */ CTRL:        17,
        /* 0x12 */ ALT:         18,
        /* 0x13 */ PAUSE:       19,         // PAUSE/BREAK
        /* 0x14 */ CAPS_LOCK:   20,
        /* 0x1B */ ESC:         27,
        /* 0x20 */ SPACE:       32,
        /* 0x21 */ PGUP:        33,
        /* 0x22 */ PGDN:        34,
        /* 0x23 */ END:         35,
        /* 0x24 */ HOME:        36,
        /* 0x25 */ LEFT:        37,
        /* 0x26 */ UP:          38,
        /* 0x27 */ RIGHT:       39,
        /* 0x27 */ FF_QUOTE:    39,
        /* 0x28 */ DOWN:        40,
        /* 0x2C */ FF_COMMA:    44,
        /* 0x2C */ PRTSC:       44,
        /* 0x2D */ INS:         45,
        /* 0x2E */ DEL:         46,
        /* 0x2E */ FF_PERIOD:   46,
        /* 0x2F */ FF_SLASH:    47,
        /* 0x30 */ ZERO:        48,
        /* 0x31 */ ONE:         49,
        /* 0x32 */ TWO:         50,
        /* 0x33 */ THREE:       51,
        /* 0x34 */ FOUR:        52,
        /* 0x35 */ FIVE:        53,
        /* 0x36 */ SIX:         54,
        /* 0x37 */ SEVEN:       55,
        /* 0x38 */ EIGHT:       56,
        /* 0x39 */ NINE:        57,
        /* 0x3B */ FF_SEMI:     59,
        /* 0x3D */ FF_EQUALS:   61,
        /* 0x5B */ CMD:         91,         // aka WIN
        /* 0x5B */ FF_LBRACK:   91,
        /* 0x5C */ FF_BSLASH:   92,
        /* 0x5D */ RCMD:        93,         // aka MENU
        /* 0x5D */ FF_RBRACK:   93,
        /* 0x60 */ NUM_0:       96,
        /* 0x60 */ NUM_INS:     96,
        /* 0x60 */ FF_BQUOTE:   96,
        /* 0x61 */ NUM_1:       97,
        /* 0x61 */ NUM_END:     97,
        /* 0x62 */ NUM_2:       98,
        /* 0x62 */ NUM_DOWN:    98,
        /* 0x63 */ NUM_3:       99,
        /* 0x63 */ NUM_PGDN:    99,
        /* 0x64 */ NUM_4:       100,
        /* 0x64 */ NUM_LEFT:    100,
        /* 0x65 */ NUM_5:       101,
        /* 0x65 */ NUM_CENTER:  101,
        /* 0x66 */ NUM_6:       102,
        /* 0x66 */ NUM_RIGHT:   102,
        /* 0x67 */ NUM_7:       103,
        /* 0x67 */ NUM_HOME:    103,
        /* 0x68 */ NUM_8:       104,
        /* 0x68 */ NUM_UP:      104,
        /* 0x69 */ NUM_9:       105,
        /* 0x69 */ NUM_PGUP:    105,
        /* 0x6A */ NUM_MUL:     106,
        /* 0x6B */ NUM_ADD:     107,
        /* 0x6D */ NUM_SUB:     109,
        /* 0x6E */ NUM_DEL:     110,        // aka PERIOD
        /* 0x6F */ NUM_DIV:     111,
        /* 0x70 */ F1:          112,
        /* 0x71 */ F2:          113,
        /* 0x72 */ F3:          114,
        /* 0x73 */ F4:          115,
        /* 0x74 */ F5:          116,
        /* 0x75 */ F6:          117,
        /* 0x76 */ F7:          118,
        /* 0x77 */ F8:          119,
        /* 0x78 */ F9:          120,
        /* 0x79 */ F10:         121,
        /* 0x7A */ F11:         122,
        /* 0x7B */ F12:         123,
        /* 0x90 */ NUM_LOCK:    144,
        /* 0x91 */ SCROLL_LOCK: 145,
        /* 0xAD */ FF_DASH:     173,
        /* 0xBA */ SEMI:        186,        // Firefox: 59
        /* 0xBB */ EQUALS:      187,        // Firefox: 61
        /* 0xBC */ COMMA:       188,        // Firefox: 44
        /* 0xBD */ DASH:        189,        // Firefox: 173
        /* 0xBE */ PERIOD:      190,        // Firefox: 46
        /* 0xBF */ SLASH:       191,        // Firefox: 47
        /* 0xC0 */ BQUOTE:      192,        // Firefox: 96
        /* 0xDB */ LBRACK:      219,        // Firefox: 91
        /* 0xDC */ BSLASH:      220,        // Firefox: 92
        /* 0xDD */ RBRACK:      221,        // Firefox: 93
        /* 0xDE */ QUOTE:       222,        // Firefox: 39
        /* 0xE0 */ FF_CMD:      224,        // Firefox only (used for both CMD and RCMD)
        //
        // The following biases use what I'll call Decimal Coded Binary or DCB (the opposite of BCD),
        // where the thousands digit is used to store the sum of "binary" digits 1 and/or 2 and/or 4.
        //
        // Technically, that makes it DCO (Decimal Coded Octal), but then again, BCD should have really
        // been called HCD (Hexadecimal Coded Decimal), so if "they" can take liberties, so can I.
        //
        // ONDOWN is a bias we add to browser keyCodes that we want to handle on "down" rather than on "press".
        //
        ONDOWN:                 1000,
        //
        // ONRIGHT is a bias we add to browser keyCodes that need to check for a "right" location (default is "left")
        //
        ONRIGHT:                2000,
        //
        // FAKE is a bias we add to signal these are fake keyCodes corresponding to internal keystroke combinations.
        // The actual values are for internal use only and merely need to be unique and used consistently.
        //
        FAKE:                   4000
    },
    /*
     * The set of values that a browser may store in the 'location' property of a keyboard event object
     * which we also support.
     */
    LOCATION: {
        LEFT:                   1,
        RIGHT:                  2,
        NUMPAD:                 3
    }
};

/*
 * Check the event object's 'location' property for a non-zero value for the following ONRIGHT keys.
 */
Keys.KEYCODE.NUM_CR = Keys.KEYCODE.CR + Keys.KEYCODE.ONRIGHT;

/*
 * Maps "stupid" keyCodes to their "non-stupid" counterparts
 */
Keys.STUPID_KEYCODES = {};
Keys.STUPID_KEYCODES[Keys.KEYCODE.SEMI]    = Keys.ASCII[';'];   // 186 -> 59
Keys.STUPID_KEYCODES[Keys.KEYCODE.EQUALS]  = Keys.ASCII['='];   // 187 -> 61
Keys.STUPID_KEYCODES[Keys.KEYCODE.COMMA]   = Keys.ASCII[','];   // 188 -> 44
Keys.STUPID_KEYCODES[Keys.KEYCODE.DASH]    = Keys.ASCII['-'];   // 189 -> 45
Keys.STUPID_KEYCODES[Keys.KEYCODE.PERIOD]  = Keys.ASCII['.'];   // 190 -> 46
Keys.STUPID_KEYCODES[Keys.KEYCODE.SLASH]   = Keys.ASCII['/'];   // 191 -> 47
Keys.STUPID_KEYCODES[Keys.KEYCODE.BQUOTE]  = Keys.ASCII['`'];   // 192 -> 96
Keys.STUPID_KEYCODES[Keys.KEYCODE.LBRACK]  = Keys.ASCII['['];   // 219 -> 91
Keys.STUPID_KEYCODES[Keys.KEYCODE.BSLASH]  = Keys.ASCII['\\'];  // 220 -> 92
Keys.STUPID_KEYCODES[Keys.KEYCODE.RBRACK]  = Keys.ASCII[']'];   // 221 -> 93
Keys.STUPID_KEYCODES[Keys.KEYCODE.QUOTE]   = Keys.ASCII["'"];   // 222 -> 39
Keys.STUPID_KEYCODES[Keys.KEYCODE.FF_DASH] = Keys.ASCII['-'];

/*
 * Maps unshifted keyCodes to their shifted counterparts; to be used when a shift-key is down.
 * Alphabetic characters are handled in code, since they must also take CAPS_LOCK into consideration.
 */
Keys.SHIFTED_KEYCODES = {};
Keys.SHIFTED_KEYCODES[Keys.ASCII['1']]     = Keys.ASCII['!'];
Keys.SHIFTED_KEYCODES[Keys.ASCII['2']]     = Keys.ASCII['@'];
Keys.SHIFTED_KEYCODES[Keys.ASCII['3']]     = Keys.ASCII['#'];
Keys.SHIFTED_KEYCODES[Keys.ASCII['4']]     = Keys.ASCII['$'];
Keys.SHIFTED_KEYCODES[Keys.ASCII['5']]     = Keys.ASCII['%'];
Keys.SHIFTED_KEYCODES[Keys.ASCII['6']]     = Keys.ASCII['^'];
Keys.SHIFTED_KEYCODES[Keys.ASCII['7']]     = Keys.ASCII['&'];
Keys.SHIFTED_KEYCODES[Keys.ASCII['8']]     = Keys.ASCII['*'];
Keys.SHIFTED_KEYCODES[Keys.ASCII['9']]     = Keys.ASCII['('];
Keys.SHIFTED_KEYCODES[Keys.ASCII['0']]     = Keys.ASCII[')'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.SEMI]   = Keys.ASCII[':'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.EQUALS] = Keys.ASCII['+'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.COMMA]  = Keys.ASCII['<'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.DASH]   = Keys.ASCII['_'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.PERIOD] = Keys.ASCII['>'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.SLASH]  = Keys.ASCII['?'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.BQUOTE] = Keys.ASCII['~'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.LBRACK] = Keys.ASCII['{'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.BSLASH] = Keys.ASCII['|'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.RBRACK] = Keys.ASCII['}'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.QUOTE]  = Keys.ASCII['"'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.FF_DASH]   = Keys.ASCII['_'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.FF_EQUALS] = Keys.ASCII['+'];
Keys.SHIFTED_KEYCODES[Keys.KEYCODE.FF_SEMI]   = Keys.ASCII[':'];

if (NODE) module.exports = Keys;