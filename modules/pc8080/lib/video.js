/**
 * @fileoverview Implements the PC8080 Video component.
 * @author <a href="mailto:Jeff@pcjs.org">Jeff Parsons</a>
 * @copyright © Jeff Parsons 2012-2017
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

var Str          = require("../../shared/es6/strlib");
var Web          = require("../../shared/es6/weblib");
var DumpAPI      = require("../../shared/es6/dumpapi");
var Component    = require("../../shared/es6/component");
var State        = require("../../shared/es6/state");
var PC8080       = require("./defines");
var ChipSet8080  = require("./chipset");
var Memory8080   = require("./memory");
var Messages8080 = require("./messages");

/**
 * TODO: The Closure Compiler treats ES6 classes as 'struct' rather than 'dict' by default,
 * which would force us to declare all class properties in the constructor, as well as prevent
 * us from defining any named properties.  So, for now, we mark all our classes as 'unrestricted'.
 *
 * @unrestricted
 */
class Video8080 extends Component {
    /**
     * Video8080(parmsVideo, canvas, context, textarea, container)
     *
     * The Video8080 component can be configured with the following (parmsVideo) properties:
     *
     *      screenWidth: width of the screen canvas, in pixels
     *      screenHeight: height of the screen canvas, in pixels
     *      screenColor: background color of the screen canvas (default is black)
     *      screenRotate: the amount of counter-clockwise screen rotation required (eg, -90 or 270)
     *      aspectRatio (eg, 1.33)
     *      bufferAddr: the starting address of the frame buffer (eg, 0x2400)
     *      bufferRAM: true to use existing RAM (default is false)
     *      bufferFormat: if defined, one of the recognized formats in Video8080.FORMATS (eg, "vt100")
     *      bufferCols: the width of a single frame buffer row, in pixels (eg, 256)
     *      bufferRows: the number of frame buffer rows (eg, 224)
     *      bufferBits: the number of bits per column (default is 1)
     *      bufferLeft: the bit position of the left-most pixel in a byte (default is 0; CGA uses 7)
     *      bufferRotate: the amount of counter-clockwise buffer rotation required (eg, -90 or 270)
     *      interruptRate: normally the same as (or some multiple of) refreshRate (eg, 120)
     *      refreshRate: how many times updateScreen() should be performed per second (eg, 60)
     *
     *  In addition, if a text-only display is being emulated, define the following properties:
     *
     *      fontROM: URL of font ROM
     *      fontColor: default is white
     *      cellWidth: number (eg, 10 for VT100)
     *      cellHeight: number (eg, 10 for VT100)
     *
     * We record all the above values now, but we defer creation of the frame buffer until our initBus()
     * handler is called.  At that point, we will also compute the extent of the frame buffer, determine the
     * appropriate "cell" size (ie, the number of pixels that updateScreen() will fetch and process at once),
     * and then allocate our cell cache.
     *
     * Why interruptRate in addition to refreshRate?  A higher interrupt rate is required for Space Invaders,
     * because even though the CRT refreshes at 60Hz, the CRT controller interrupts the CPU *twice* per
     * refresh (once after the top half of the screen has been redrawn, and again after the bottom half has
     * been redrawn), so we need an interrupt rate of 120Hz.  We pass the higher rate on to the CPU, so that
     * it will call updateScreen() more frequently, but we still limit our screen updates to every *other* call.
     *
     * bufferRotate is an alternative to screenRotate; you may set one or the other (but not both) to -90 to
     * enable different approaches to counter-clockwise 90-degree image rotation.  screenRotate uses canvas
     * transformation methods (translate(), rotate(), and scale()), while bufferRotate inverts the dimensions
     * of the off-screen buffer and then relies on setPixel() to "rotate" the data into the proper location.
     *
     * @this {Video8080}
     * @param {Object} parmsVideo
     * @param {Object} [canvas]
     * @param {Object} [context]
     * @param {Object} [textarea]
     * @param {Object} [container]
     */
    constructor(parmsVideo, canvas, context, textarea, container)
    {
        super("Video", parmsVideo, Video8080, Messages8080.VIDEO);

        var video = this;
        this.fGecko = Web.isUserAgent("Gecko/");
        var i, sEvent, asWebPrefixes = ['', 'moz', 'ms', 'webkit'];

        this.cxScreen = parmsVideo['screenWidth'];
        this.cyScreen = parmsVideo['screenHeight'];

        this.addrBuffer = parmsVideo['bufferAddr'];
        this.fUseRAM = parmsVideo['bufferRAM'];

        var sFormat = parmsVideo['bufferFormat'];
        this.nFormat = sFormat && Video8080.FORMATS[sFormat.toUpperCase()] || Video8080.FORMAT.UNKNOWN;

        this.nColsBuffer = parmsVideo['bufferCols'];
        this.nRowsBuffer = parmsVideo['bufferRows'];

        this.cxCellDefault = this.cxCell = parmsVideo['cellWidth'] || 1;
        this.cyCellDefault = this.cyCell = parmsVideo['cellHeight'] || 1;
        this.abFontData = null;
        this.fDotStretcher = false;

        this.nBitsPerPixel = parmsVideo['bufferBits'] || 1;
        this.iBitFirstPixel = parmsVideo['bufferLeft'] || 0;

        this.rotateBuffer = parmsVideo['bufferRotate'];
        if (this.rotateBuffer) {
            this.rotateBuffer = this.rotateBuffer % 360;
            if (this.rotateBuffer > 0) this.rotateBuffer -= 360;
            if (this.rotateBuffer != -90) {
                this.notice("unsupported buffer rotation: " + this.rotateBuffer);
                this.rotateBuffer = 0;
            }
        }

        this.rateInterrupt = parmsVideo['interruptRate'];
        this.rateRefresh = parmsVideo['refreshRate'] || 60;

        this.canvasScreen = canvas;
        this.contextScreen = context;
        this.textareaScreen = textarea;
        this.inputScreen = textarea || canvas || null;

        /*
         * These variables are here in case we want/need to add support for borders later...
         */
        this.xScreenOffset = this.yScreenOffset = 0;
        this.cxScreenOffset = this.cxScreen;
        this.cyScreenOffset = this.cyScreen;

        this.cxScreenCell = (this.cxScreen / this.nColsBuffer)|0;
        this.cyScreenCell = (this.cyScreen / this.nRowsBuffer)|0;

        /*
         * Now that we've finished using nRowsBuffer to help define the screen size, we add one more
         * row for text modes, to account for the VT100's scroll line buffer (used for smooth scrolling).
         */
        if (this.cyCell > 1) {
            this.nRowsBuffer++;
            this.bScrollOffset = 0;
            this.fSkipSingleCellUpdate = false;
        }

        /*
         * Support for disabling (or, less commonly, enabling) image smoothing, which all browsers
         * seem to support now (well, OK, I still have to test the latest MS Edge browser), despite
         * it still being labelled "experimental technology".  Let's hope the browsers standardize
         * on this.  I see other options emerging, like the CSS property "image-rendering: pixelated"
         * that's apparently been added to Chrome.  Sigh.
         */
        var fSmoothing = parmsVideo['smoothing'];
        var sSmoothing = Web.getURLParm('smoothing');
        if (sSmoothing) fSmoothing = (sSmoothing == "true");
        if (fSmoothing != null) {
            for (i = 0; i < asWebPrefixes.length; i++) {
                sEvent = asWebPrefixes[i];
                if (!sEvent) {
                    sEvent = 'imageSmoothingEnabled';
                } else {
                    sEvent += 'ImageSmoothingEnabled';
                }
                if (this.contextScreen[sEvent] !== undefined) {
                    this.contextScreen[sEvent] = fSmoothing;
                    break;
                }
            }
        }

        this.rotateScreen = parmsVideo['screenRotate'];
        if (this.rotateScreen) {
            this.rotateScreen = this.rotateScreen % 360;
            if (this.rotateScreen > 0) this.rotateScreen -= 360;
            /*
             * TODO: Consider also disallowing any rotateScreen value if bufferRotate was already set; setting
             * both is most likely a mistake, but who knows, maybe someone wants to use both for 180-degree rotation?
             */
            if (this.rotateScreen != -90) {
                this.notice("unsupported screen rotation: " + this.rotateScreen);
                this.rotateScreen = 0;
            } else {
                this.contextScreen.translate(0, this.cyScreen);
                this.contextScreen.rotate((this.rotateScreen * Math.PI)/180);
                this.contextScreen.scale(this.cyScreen/this.cxScreen, this.cxScreen/this.cyScreen);
            }
        }

        /*
         * Here's the gross code to handle full-screen support across all supported browsers.  The lack of standards
         * is exasperating; browsers can't agree on 'full' or 'Full, 'request' or 'Request', 'screen' or 'Screen', and
         * while some browsers honor other browser prefixes, most browsers don't.
         */
        this.container = container;
        if (this.container) {
            this.container.doFullScreen = container['requestFullscreen'] || container['msRequestFullscreen'] || container['mozRequestFullScreen'] || container['webkitRequestFullscreen'];
            if (this.container.doFullScreen) {
                for (i = 0; i < asWebPrefixes.length; i++) {
                    sEvent = asWebPrefixes[i] + 'fullscreenchange';
                    if ('on' + sEvent in document) {
                        var onFullScreenChange = function() {
                            var fFullScreen = (document['fullscreenElement'] || document['msFullscreenElement'] || document['mozFullScreenElement'] || document['webkitFullscreenElement']);
                            video.notifyFullScreen(!!fFullScreen);
                        };
                        document.addEventListener(sEvent, onFullScreenChange, false);
                        break;
                    }
                }
                for (i = 0; i < asWebPrefixes.length; i++) {
                    sEvent = asWebPrefixes[i] + 'fullscreenerror';
                    if ('on' + sEvent in document) {
                        var onFullScreenError = function() {
                            video.notifyFullScreen(null);
                        };
                        document.addEventListener(sEvent, onFullScreenError, false);
                        break;
                    }
                }
            }
        }

        this.sFontROM = parmsVideo['fontROM'];
        if (this.sFontROM) {
            var sFileExt = Str.getExtension(this.sFontROM);
            if (sFileExt != "json") {
                this.sFontROM = Web.getHost() + DumpAPI.ENDPOINT + '?' + DumpAPI.QUERY.FILE + '=' + this.sFontROM + '&' + DumpAPI.QUERY.FORMAT + '=' + DumpAPI.FORMAT.BYTES;
            }
            Web.getResource(this.sFontROM, null, true, function(sURL, sResponse, nErrorCode) {
                video.doneLoad(sURL, sResponse, nErrorCode);
            });
        }

        this.ledBindings = {};
    }

    /**
     * initBuffers()
     *
     * @this {Video8080}
     * @return {boolean}
     */
    initBuffers()
    {
        /*
         * Allocate off-screen buffers now
         */
        this.cxBuffer = this.nColsBuffer * this.cxCell;
        this.cyBuffer = this.nRowsBuffer * this.cyCell;

        var cxBuffer = this.cxBuffer;
        var cyBuffer = this.cyBuffer;
        if (this.rotateBuffer) {
            cxBuffer = this.cyBuffer;
            cyBuffer = this.cxBuffer;
        }

        this.sizeBuffer = 0;
        if (!this.fUseRAM) {
            this.sizeBuffer = ((this.cxBuffer * this.nBitsPerPixel) >> 3) * this.cyBuffer;
            if (!this.bus.addMemory(this.addrBuffer, this.sizeBuffer, Memory8080.TYPE.VIDEO)) {
                return false;
            }
        }

        /*
         * imageBuffer is only used for graphics modes.  For text modes, we create a canvas
         * for each font and draw characters by drawing from the font canvas to the target canvas.
         */
        if (this.sizeBuffer) {
            this.imageBuffer = this.contextScreen.createImageData(cxBuffer, cyBuffer);
            this.nPixelsPerCell = (16 / this.nBitsPerPixel)|0;
            this.initCellCache(this.sizeBuffer >> 1);
        } else {
            /*
             * We add an extra column per row to store the visible line length at the start of every row.
             */
            this.initCellCache((this.nColsBuffer + 1) * this.nRowsBuffer);
        }

        this.canvasBuffer = document.createElement("canvas");
        this.canvasBuffer.width = cxBuffer;
        this.canvasBuffer.height = cyBuffer;
        this.contextBuffer = this.canvasBuffer.getContext("2d");

        this.aFonts = {};
        this.initColors();

        if (this.nFormat == Video8080.FORMAT.VT100) {
            /*
             * Beyond fonts, VT100 support requires that we maintain a number of additional properties:
             *
             *      rateMonitor: must be either 50 or 60 (defaults to 60); we don't emulate the monitor refresh rate,
             *      but we do need to keep track of which rate has been selected, because that affects the number of
             *      "fill lines" present at the top of the VT100's frame buffer: 2 lines for 60Hz, 5 lines for 50Hz.
             *
             *      The VT100 July 1982 Technical Manual, p. 4-89, shows the following sample frame buffer layout:
             *
             *                  00  01  02  03  04  05  06  07  08  09  0A  0B  0C  0D  0E  0F
             *                  --------------------------------------------------------------
             *          0x2000: 7F  70  03  7F  F2  D0  7F  70  06  7F  70  0C  7F  70  0F  7F
             *          0x2010: 70  03  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..
             *          ...
             *          0x22D0: 'D' 'A' 'T' 'A' ' ' 'F' 'O' 'R' ' ' 'F' 'I' 'R' 'S' 'T' ' ' 'L'
             *          0x22E0: 'I' 'N' 'E' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' '
             *          ...
             *          0x2320: 7F  F3  23  'D' 'A' 'T' 'A' ' ' 'F' 'O' 'R' ' ' 'S' 'E' 'C' 'O'
             *          0x2330: 'N' 'D' ' ' 'L' 'I' 'N' 'E' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' '
             *          ...
             *          0x2BE0: ' ' ' ' 'E' 'N' 'D' ' ' 'O' 'F' ' ' 'L' 'A' 'S' 'T' ' ' 'L' 'I'
             *          0x2BF0: 'N' 'E' 7F  70  06  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..
             *          0x2C00: [AVO SCREEN RAM, IF ANY, BEGINS HERE]
             *
             *      ERRATA: The manual claims that if you change the byte at 0x2002 from 03 to 09, the number of "fill
             *      lines" will change from 2 to 5 (for 50Hz operation), but it shows 06 instead of 0C at location 0x200B;
             *      if you follow the links, it's pretty clear that byte has to be 0C to yield 5 "fill lines".  Since the
             *      address following the terminator at 0x2006 points to itself, it never makes sense for that terminator
             *      to be used EXCEPT at the end of the frame buffer.
             *
             *      As an alternative to tracking the monitor refresh rate, we could hard-code some knowledge about how
             *      the VT100's 8080 code uses memory, and simply ignore lines below address 0x22D0.  But the VT100 Video
             *      Processor makes no such assumption, and it would also break our test code in createFonts(), which
             *      builds a contiguous screen of test data starting at the default frame buffer address (0x2000).
             */
            this.rateMonitor = 60;

            /*
             * The default character-selectable attribute (reverse video vs. underline) is controlled by fUnderline.
             */
            this.fUnderline = false;

            this.abLineBuffer = new Array(this.nColsBuffer);
        }
        return true;
    }

    /**
     * initBus(cmp, bus, cpu, dbg)
     *
     * @this {Video8080}
     * @param {Computer8080} cmp
     * @param {Bus8080} bus
     * @param {CPUState8080} cpu
     * @param {Debugger8080} dbg
     */
    initBus(cmp, bus, cpu, dbg)
    {
        this.cmp = cmp;
        this.bus = bus;
        this.cpu = cpu;
        this.dbg = dbg;

        /*
         * Allocate the frame buffer (as needed) along with all other buffers.
         */
        this.initBuffers();

        /*
         * If we have an associated keyboard, then ensure that the keyboard will be notified
         * whenever the canvas gets focus and receives input.
         */
        this.kbd = /** @type {Keyboard8080} */ (cmp.getMachineComponent("Keyboard"));
        if (this.kbd) {
            for (var s in this.ledBindings) {
                this.kbd.setBinding("led", s, this.ledBindings[s]);
            }
            if (this.canvasScreen) {
                this.kbd.setBinding(this.textareaScreen? "textarea" : "canvas", "screen", this.inputScreen);
            }
        }

        var video = this;
        this.timerUpdateNext = this.cpu.addTimer(function() {
            video.updateScreen();
        });
        this.cpu.setTimer(this.timerUpdateNext, this.getRefreshTime());
        this.nUpdates = 0;

        if (!this.sFontROM) this.setReady();
    }

    /**
     * doneLoad(sURL, sFontData, nErrorCode)
     *
     * @this {Video8080}
     * @param {string} sURL
     * @param {string} sFontData
     * @param {number} nErrorCode (response from server if anything other than 200)
     */
    doneLoad(sURL, sFontData, nErrorCode)
    {
        if (nErrorCode) {
            this.notice("Unable to load font ROM (error " + nErrorCode + ": " + sURL + ")");
            return;
        }

        Component.addMachineResource(this.idMachine, sURL, sFontData);

        try {
            /*
             * The most likely source of any exception will be here: parsing the JSON-encoded data.
             */
            var ab = eval("(" + sFontData + ")");

            var abFontData = ab['bytes'] || ab;

            if (!abFontData || !abFontData.length) {
                Component.error("Empty font ROM: " + sURL);
                return;
            }
            else if (abFontData.length == 1) {
                Component.error(abFontData[0]);
                return;
            }

            /*
             * Minimal font data validation, just to make sure we're not getting garbage from the server.
             */
            if (abFontData.length == 2048) {
                this.abFontData = abFontData;
                this.createFonts();
            }
            else {
                this.notice("Unrecognized font data length (" + abFontData.length + ")");
                return;
            }

        } catch (e) {
            this.notice("Font ROM data error: " + e.message);
            return;
        }

        /*
         * If we're still here, then we're ready!
         *
         * UPDATE: Per issue #21, I'm issuing setReady() *only* if a valid contextScreen exists *or* a Debugger is attached.
         *
         * TODO: Consider a more general-purpose solution for deciding whether or not the user wants to run in a "headless" mode.
         */
        if (this.contextScreen || this.dbg) this.setReady();
    }

    /**
     * createFonts()
     *
     * @this {Video8080}
     * @return {boolean}
     */
    createFonts()
    {
        /*
         * We retain abFontData in case we have to rebuild the fonts (eg, when we switch from 80 to 132 columns)
         */
        if (this.abFontData) {
            this.fDotStretcher = (this.nFormat == Video8080.FORMAT.VT100);
            this.aFonts[Video8080.VT100.FONT.NORML] = [
                this.createFontVariation(this.cxCell, this.cyCell),
                this.createFontVariation(this.cxCell, this.cyCell, this.fUnderline)
            ];
            this.aFonts[Video8080.VT100.FONT.DWIDE] = [
                this.createFontVariation(this.cxCell*2, this.cyCell),
                this.createFontVariation(this.cxCell*2, this.cyCell, this.fUnderline)
            ];
            this.aFonts[Video8080.VT100.FONT.DHIGH] = this.aFonts[Video8080.VT100.FONT.DHIGH_BOT] = [
                this.createFontVariation(this.cxCell*2, this.cyCell*2),
                this.createFontVariation(this.cxCell*2, this.cyCell*2, this.fUnderline)
            ];
            return true;
        }
        return false;
    }

    /**
     * createFontVariation(cxCell, cyCell, fUnderline)
     *
     * This creates a 16x16 character grid for the requested font variation.  Variations include:
     *
     *      1) no variation (cell size is this.cxCell x this.cyCell)
     *      2) double-wide characters (cell size is this.cxCell*2 x this.cyCell)
     *      3) double-high double-wide characters (cell size is this.cxCell*2 x this.cyCell*2)
     *      4) any of the above with either reverse video or underline enabled (default is neither)
     *
     * @this {Video8080}
     * @param {number} cxCell is the target width of each character in the grid
     * @param {number} cyCell is the target height of each character in the grid
     * @param {boolean} [fUnderline] (null for unmodified font, false for reverse video, true for underline)
     * @return {Object}
     */
    createFontVariation(cxCell, cyCell, fUnderline)
    {
        /*
         * On a VT100, cxCell,cyCell is initially 10,10, but may change to 9,10 for 132-column mode.
         */
        this.assert(cxCell == this.cxCell || cxCell == this.cxCell*2);
        this.assert(cyCell == this.cyCell || cyCell == this.cyCell*2);

        /*
         * Create a font canvas that is both 16 times the target character width and the target character height,
         * ensuring that it will accommodate 16x16 characters (for a maximum of 256).  Note that the VT100 font ROM
         * defines only 128 characters, so that canvas will contain only 16x8 entries.
         */
        var nFontBytesPerChar = this.cxCellDefault <= 8? 8 : 16;
        var nFontByteOffset = nFontBytesPerChar > 8? 15 : 0;
        var nChars = this.abFontData.length / nFontBytesPerChar;

        /*
         * The absence of a boolean for fUnderline means that both fReverse and fUnderline are "falsey".  The presence
         * of a boolean means that fReverse will be true OR fUnderline will be true, but NOT both.
         */
        var fReverse = (fUnderline === false);

        var font = {cxCell: cxCell, cyCell: cyCell};
        font.canvas = document.createElement("canvas");
        font.canvas.width = cxCell * 16;
        font.canvas.height = cyCell * (nChars / 16);
        font.context = font.canvas.getContext("2d");

        var imageChar = font.context.createImageData(cxCell, cyCell);

        for (var iChar = 0; iChar < nChars; iChar++) {
            for (var y = 0, yDst = y; y < this.cyCell; y++) {
                var offFontData = iChar * nFontBytesPerChar + ((nFontByteOffset + y) & (nFontBytesPerChar - 1));
                var bits = (fUnderline && y == 8? 0xff : this.abFontData[offFontData]);
                for (var nRows = 0; nRows < (cyCell / this.cyCell); nRows++) {
                    var bitPrev = 0;
                    for (var x = 0, xDst = x; x < this.cxCell; x++) {
                        /*
                         * While x goes from 0 to cxCell-1, obviously we will run out of bits after x is 7;
                         * since the final bit must be replicated all the way to the right edge of the cell
                         * (so that line-drawing characters seamlessly connect), we ensure that the effective
                         * shift count remains stuck at 7 once it reaches 7.
                         */
                        var bitReal = bits & (0x80 >> (x > 7? 7 : x));
                        var bit = (this.fDotStretcher && !bitReal && bitPrev)? bitPrev : bitReal;
                        for (var nCols = 0; nCols < (cxCell / this.cxCell); nCols++) {
                            if (fReverse) bit = !bit;
                            this.setPixel(imageChar, xDst, yDst, bit? 1 : 0);
                            xDst++;
                        }
                        bitPrev = bitReal;
                    }
                    yDst++;
                }
            }
            /*
             * (iChar >> 4) performs the integer equivalent of Math.floor(iChar / 16), and (iChar & 0xf) is the equivalent of (iChar % 16).
             */
            font.context.putImageData(imageChar, (iChar & 0xf) * cxCell, (iChar >> 4) * cyCell);
        }
        return font;
    }

    /**
     * powerUp(data, fRepower)
     *
     * @this {Video8080}
     * @param {Object|null} data
     * @param {boolean} [fRepower]
     * @return {boolean} true if successful, false if failure
     */
    powerUp(data, fRepower)
    {
        /*
         * Because the VT100 frame buffer can be located anywhere in RAM (above 0x2000), we must defer this
         * test code until the powerUp() notification handler is called, when all RAM has (hopefully) been allocated.
         *
         * NOTE: The following test screen was useful for early testing, but a *real* VT100 doesn't display a test screen,
         * so this code is no longer enabled by default.  Remove MAXDEBUG if you want to see it again.
         */
        if (MAXDEBUG && this.nFormat == Video8080.FORMAT.VT100) {
            /*
             * Build a test screen in the VT100 frame buffer; we'll mimic the "SET-UP A" screen, since it uses
             * all the font variations.  The process involves iterating over 0-based row numbers -2 (or -5 if 50Hz
             * operation is selected) through 24, checking aLineData for a matching row number, and converting the
             * corresponding string(s) to appropriate byte values.  Negative row numbers correspond to "fill lines"
             * and do not require a row entry.  If multiple strings are present for a given row, we invert the
             * default character attribute for subsequent strings.  An empty array ends the screen build process.
             */
            var aLineData = {
                 0: [Video8080.VT100.FONT.DHIGH, 'SET-UP A'],
                 2: [Video8080.VT100.FONT.DWIDE, 'TO EXIT PRESS "SET-UP"'],
                22: [Video8080.VT100.FONT.NORML, '        T       T       T       T       T       T       T       T       T'],
                23: [Video8080.VT100.FONT.NORML, '1234567890', '1234567890', '1234567890', '1234567890', '1234567890', '1234567890', '1234567890', '1234567890'],
                24: []
            };
            var addr = this.addrBuffer;
            var addrNext = -1, font = -1;
            var b, nFill = (this.rateMonitor == 60? 2 : 5);
            for (var iRow = -nFill; iRow < this.nRowsBuffer; iRow++) {
                var lineData = aLineData[iRow];
                if (addrNext >= 0) {
                    var fBreak = false;
                    addrNext = addr + 2;
                    if (!lineData) {
                        if (font == Video8080.VT100.FONT.DHIGH) {
                            lineData = aLineData[iRow-1];
                            font = Video8080.VT100.FONT.DHIGH_BOT;
                        }
                    }
                    else {
                        if (lineData.length) {
                            font = lineData[0];
                        } else {
                            addrNext = addr - 1;
                            fBreak = true;
                        }
                    }
                    b = (font & Video8080.VT100.LINEATTR.FONTMASK) | ((addrNext >> 8) & Video8080.VT100.LINEATTR.ADDRMASK) | Video8080.VT100.LINEATTR.ADDRBIAS;
                    this.bus.setByteDirect(addr++, b);
                    this.bus.setByteDirect(addr++, addrNext & 0xff);
                    if (fBreak) break;
                }
                if (lineData) {
                    var attr = 0;
                    for (var j = 1; j < lineData.length; j++) {
                        var s = lineData[j];
                        for (var k = 0; k < s.length; k++) {
                            this.bus.setByteDirect(addr++, s.charCodeAt(k) | attr);
                        }
                        attr ^= 0x80;
                    }
                }
                this.bus.setByteDirect(addr++, Video8080.VT100.LINETERM);
                addrNext = addr;
            }
            /*
             * NOTE: By calling updateVT100() directly, we are bypassing any checks that might block the update.
             */
            this.updateVT100();
        }
        return true;
    }

    /**
     * setBinding(sHTMLType, sBinding, control, sValue)
     *
     * @this {Video8080}
     * @param {string|null} sHTMLType is the type of the HTML control (eg, "button", "list", "text", "submit", "textarea", "canvas")
     * @param {string} sBinding is the value of the 'binding' parameter stored in the HTML control's "data-value" attribute (eg, "refresh")
     * @param {Object} control is the HTML control DOM object (eg, HTMLButtonElement)
     * @param {string} [sValue] optional data value
     * @return {boolean} true if binding was successful, false if unrecognized binding request
     */
    setBinding(sHTMLType, sBinding, control, sValue)
    {
        var video = this;

        /*
         * TODO: A more general-purpose binding mechanism would be nice someday....
         */
        if (sHTMLType == "led" || sHTMLType == "rled") {
            this.ledBindings[sBinding] = control;
            return true;
        }

        switch (sBinding) {
        case "fullScreen":
            this.bindings[sBinding] = control;
            if (this.container && this.container.doFullScreen) {
                control.onclick = function onClickFullScreen() {
                    if (DEBUG) video.printMessage("fullScreen()");
                    video.doFullScreen();
                };
            } else {
                if (DEBUG) this.log("FullScreen API not available");
                control.parentNode.removeChild(/** @type {Node} */ (control));
            }
            return true;

        default:
            break;
        }
        return false;
    }

    /**
     * updateDimensions(nCols, nRows)
     *
     * Called from the ChipSet component whenever the screen dimensions have been dynamically altered.
     *
     * @this {Video8080}
     * @param {number} nCols (should be either 80 or 132; 80 is the default)
     * @param {number} nRows (should be either 24 or 14; 24 is the default)
     */
    updateDimensions(nCols, nRows)
    {
        this.printMessage("updateDimensions(" + nCols + "," + nRows + ")");
        this.nColsBuffer = nCols;
        /*
         * Even when the number of effective rows is 14 (or 15 counting the scroll line buffer), we want
         * to leave the number of rows at 24 (or 25 counting the scroll line buffer), because the VT100 doesn't
         * actually change character height (only character width).
         *
         *      this.nRowsBuffer = nRows+1; // +1 for scroll line buffer
         */
        this.cxCell = this.cxCellDefault;
        if (nCols > 80) this.cxCell--;      // VT100 font cells are 9x10 instead of 10x10 in 132-column mode
        if (this.initBuffers()) {
            this.createFonts();
        }
    }

    /**
     * updateRate(nRate)
     *
     * Called from the ChipSet component whenever the monitor refresh rate has been dynamically altered.
     *
     * @this {Video8080}
     * @param {number} nRate (should be either 50 or 60; 60 is the default)
     */
    updateRate(nRate)
    {
        this.printMessage("updateRate(" + nRate + ")");
        this.rateMonitor = nRate;
    }

    /**
     * updateScrollOffset(bScroll)
     *
     * Called from the ChipSet component whenever the screen scroll offset has been dynamically altered.
     *
     * @this {Video8080}
     * @param {number} bScroll
     */
    updateScrollOffset(bScroll)
    {
        this.printMessage("updateScrollOffset(" + bScroll + ")");
        if (this.bScrollOffset !== bScroll) {
            this.bScrollOffset = bScroll;
            /*
             * WARNING: If we immediately redraw the screen on the first wrap of the scroll offset back to zero,
             * we end up "slamming" the screen's contents back down again, because it seems that the frame buffer
             * contents haven't actually been scrolled yet.  So we redraw now ONLY if bScroll is non-zero, lest
             * we ruin the smooth-scroll effect.
             *
             * And this change, while necessary, is not sufficient, because another intervening updateScreen()
             * call could still occur before the frame buffer contents are actually scrolled; and ordinarily, if the
             * buffer hasn't changed, updateScreen() would do nothing, but alas, if the cursor happens to get toggled
             * in the interim, updateScreen() will want to update exactly ONE cell.
             *
             * So we deal with that by setting the fSkipSingleCellUpdate flag.  Now of course, there's no guarantee
             * that the next update of only ONE cell will always be a cursor update, but even if it isn't, skipping
             * that update doesn't seem like a huge cause for concern.
             */
            if (bScroll) {
                this.updateScreen(true);
            } else {
                this.fSkipSingleCellUpdate = true;
            }
        }
    }

    /**
     * doFullScreen()
     *
     * @this {Video8080}
     * @return {boolean} true if request successful, false if not (eg, failed OR not supported)
     */
    doFullScreen()
    {
        var fSuccess = false;
        if (this.container) {
            if (this.container.doFullScreen) {
                /*
                 * Styling the container with a width of "100%" and a height of "auto" works great when the aspect ratio
                 * of our virtual screen is at least roughly equivalent to the physical screen's aspect ratio, but now that
                 * we support virtual VGA screens with an aspect ratio of 1.33, that's very much out of step with modern
                 * wide-screen monitors, which usually have an aspect ratio of 1.6 or greater.
                 *
                 * And unfortunately, none of the browsers I've tested appear to make any attempt to scale our container to
                 * the physical screen's dimensions, so the bottom of our screen gets clipped.  To prevent that, I reduce
                 * the width from 100% to whatever percentage will accommodate the entire height of the virtual screen.
                 *
                 * NOTE: Mozilla recommends both a width and a height of "100%", but all my tests suggest that using "auto"
                 * for height works equally well, so I'm sticking with it, because "auto" is also consistent with how I've
                 * implemented a responsive canvas when the browser window is being resized.
                 */
                var sWidth = "100%";
                var sHeight = "auto";
                if (screen && screen.width && screen.height) {
                    var aspectPhys = screen.width / screen.height;
                    var aspectVirt = this.cxScreen / this.cyScreen;
                    if (aspectPhys > aspectVirt) {
                        sWidth = Math.round(aspectVirt / aspectPhys * 100) + '%';
                    }
                    // TODO: We may need to someday consider the case of a physical screen with an aspect ratio < 1.0....
                }
                if (!this.fGecko) {
                    this.container.style.width = sWidth;
                    this.container.style.height = sHeight;
                } else {
                    /*
                     * Sadly, the above code doesn't work for Firefox, because as http://developer.mozilla.org/en-US/docs/Web/Guide/API/DOM/Using_full_screen_mode
                     * explains:
                     *
                     *      'It's worth noting a key difference here between the Gecko and WebKit implementations at this time:
                     *      Gecko automatically adds CSS rules to the element to stretch it to fill the screen: "width: 100%; height: 100%".
                     *
                     * Which would be OK if Gecko did that BEFORE we're called, but apparently it does that AFTER, effectively
                     * overwriting our careful calculations.  So we style the inner element (canvasScreen) instead, which
                     * requires even more work to ensure that the canvas is properly centered.  FYI, this solution is consistent
                     * with Mozilla's recommendation for working around their automatic CSS rules:
                     *
                     *      '[I]f you're trying to emulate WebKit's behavior on Gecko, you need to place the element you want
                     *      to present inside another element, which you'll make fullscreen instead, and use CSS rules to adjust
                     *      the inner element to match the appearance you want.'
                     */
                    this.canvasScreen.style.width = sWidth;
                    this.canvasScreen.style.width = sWidth;
                    this.canvasScreen.style.display = "block";
                    this.canvasScreen.style.margin = "auto";
                }
                this.container.style.backgroundColor = "black";
                this.container.doFullScreen();
                fSuccess = true;
            }
            this.setFocus();
        }
        return fSuccess;
    }

    /**
     * notifyFullScreen(fFullScreen)
     *
     * @this {Video8080}
     * @param {boolean|null} fFullScreen (null if there was a full-screen error)
     */
    notifyFullScreen(fFullScreen)
    {
        if (!fFullScreen && this.container) {
            if (!this.fGecko) {
                this.container.style.width = this.container.style.height = "";
            } else {
                this.canvasScreen.style.width = this.canvasScreen.style.height = "";
            }
        }
        this.printMessage("notifyFullScreen(" + fFullScreen + ")");
    }

    /**
     * setFocus()
     *
     * @this {Video8080}
     */
    setFocus()
    {
        if (this.inputScreen) this.inputScreen.focus();
    }

    /**
     * getRefreshTime()
     *
     * @this {Video8080}
     * @return {number} (number of milliseconds per refresh)
     */
    getRefreshTime()
    {
        return 1000 / Math.max(this.rateRefresh, this.rateInterrupt);
    }

    /**
     * initCellCache(nCells)
     *
     * Initializes the contents of our internal cell cache.
     *
     * @this {Video8080}
     * @param {number} nCells
     */
    initCellCache(nCells)
    {
        this.nCellCache = nCells;
        this.fCellCacheValid = false;
        if (this.aCellCache === undefined || this.aCellCache.length != this.nCellCache) {
            this.aCellCache = new Array(this.nCellCache);
        }
    }

    /**
     * initColors()
     *
     * This creates an array of nColors, with additional OVERLAY_TOTAL colors tacked on to the end of the array.
     *
     * @this {Video8080}
     */
    initColors()
    {
        var rgbBlack  = [0x00, 0x00, 0x00, 0xff];
        var rgbWhite  = [0xff, 0xff, 0xff, 0xff];
        this.nColors = (1 << this.nBitsPerPixel);
        this.aRGB = new Array(this.nColors + Video8080.COLORS.OVERLAY_TOTAL);
        this.aRGB[0] = rgbBlack;
        this.aRGB[1] = rgbWhite;
        if (this.nFormat == Video8080.FORMAT.SI1978) {
            var rgbGreen  = [0x00, 0xff, 0x00, 0xff];
            //noinspection UnnecessaryLocalVariableJS
            var rgbYellow = [0xff, 0xff, 0x00, 0xff];
            this.aRGB[this.nColors + Video8080.COLORS.OVERLAY_TOP] = rgbYellow;
            this.aRGB[this.nColors + Video8080.COLORS.OVERLAY_BOTTOM] = rgbGreen;
        }
    }

    /**
     * setPixel(image, x, y, bPixel)
     *
     * @this {Video8080}
     * @param {Object} image
     * @param {number} x
     * @param {number} y
     * @param {number} bPixel (ie, an index into aRGB)
     */
    setPixel(image, x, y, bPixel)
    {
        var index;
        if (!this.rotateBuffer) {
            index = (x + y * image.width);
        } else {
            index = (image.height - x - 1) * image.width + y;
        }
        if (bPixel && this.nFormat == Video8080.FORMAT.SI1978) {
            if (x >= 208 && x < 236) {
                bPixel = this.nColors + Video8080.COLORS.OVERLAY_TOP;
            }
            else if (x >= 28 && x < 72) {
                bPixel = this.nColors + Video8080.COLORS.OVERLAY_BOTTOM;
            }
        }
        var rgb = this.aRGB[bPixel];
        index *= rgb.length;
        image.data[index] = rgb[0];
        image.data[index+1] = rgb[1];
        image.data[index+2] = rgb[2];
        image.data[index+3] = rgb[3];
    }

    /**
     * updateChar(idFont, col, row, data, context)
     *
     * Updates a particular character cell (row,col) in the associated window.
     *
     * @this {Video8080}
     * @param {number} idFont
     * @param {number} col
     * @param {number} row
     * @param {number} data
     * @param {Object} [context]
     */
    updateChar(idFont, col, row, data, context)
    {
        var bChar = data & 0x7f;
        var font = this.aFonts[idFont][(data & 0x80)? 1 : 0];
        if (!font) return;

        var xSrc = (bChar & 0xf) * font.cxCell;
        var ySrc = (bChar >> 4) * font.cyCell;

        var xDst, yDst, cxDst, cyDst;

        var cxSrc = font.cxCell;
        var cySrc = font.cyCell;

        if (context) {
            xDst = col * this.cxCell;
            yDst = row * this.cyCell;
            cxDst = this.cxCell;
            cyDst = this.cyCell;
        } else {
            xDst = col * this.cxScreenCell;
            yDst = row * this.cyScreenCell;
            cxDst = this.cxScreenCell;
            cyDst = this.cyScreenCell;
        }

        /*
         * If font.cxCell > this.cxCell, then we assume the caller wants to draw a double-wide character,
         * so we will double xDst and cxDst.
         */
        if (font.cxCell > this.cxCell) {
            xDst *= 2;
            cxDst *= 2;
            this.assert(font.cxCell == this.cxCell * 2);
        }

        /*
         * If font.cyCell > this.cyCell, then we rely on idFont to indicate whether the top half or bottom half
         * of the character should be drawn.
         */
        if (font.cyCell > this.cyCell) {
            if (idFont == Video8080.VT100.FONT.DHIGH_BOT) ySrc += this.cyCell;
            cySrc = this.cyCell;
            this.assert(font.cyCell == this.cyCell * 2);
        }

        if (context) {
            context.drawImage(font.canvas, xSrc, ySrc, cxSrc, cySrc, xDst, yDst, cxDst, cyDst);
        } else {
            xDst += this.xScreenOffset;
            yDst += this.yScreenOffset;
            this.contextScreen.drawImage(font.canvas, xSrc, ySrc, cxSrc, cySrc, xDst, yDst, cxDst, cyDst);
        }
    }

    /**
     * updateVT100(fForced)
     *
     * @this {Video8080}
     * @param {boolean} [fForced]
     */
    updateVT100(fForced)
    {
        var addrNext = this.addrBuffer, fontNext = -1;

        var nRows = 0;
        var nFill = (this.rateMonitor == 60? 2 : 5);
        var iCell = 0, cUpdated = 0, iCellUpdated = -1;

        this.assert(this.abLineBuffer.length == this.nColsBuffer);

        while (nRows < this.nRowsBuffer) {
            /*
             * Populate the line buffer
             */
            var nCols = 0;
            var addr = addrNext;
            var font = fontNext;
            var nColsVisible = this.nColsBuffer;
            if (font != Video8080.VT100.FONT.NORML) nColsVisible >>= 1;
            while (true) {
                var data = this.bus.getByteDirect(addr++);
                if ((data & Video8080.VT100.LINETERM) == Video8080.VT100.LINETERM) {
                    var b = this.bus.getByteDirect(addr++);
                    fontNext = b & Video8080.VT100.LINEATTR.FONTMASK;
                    addrNext = ((b & Video8080.VT100.LINEATTR.ADDRMASK) << 8) | this.bus.getByteDirect(addr);
                    addrNext += (b & Video8080.VT100.LINEATTR.ADDRBIAS)? Video8080.VT100.ADDRBIAS_LO : Video8080.VT100.ADDRBIAS_HI;
                    break;
                }
                if (nCols < nColsVisible) {
                    this.abLineBuffer[nCols++] = data;
                } else {
                    break;                          // ideally, we would wait for a LINETERM byte, but it's not safe to loop without limit
                }
            }

            /*
             * Skip the first few "fill lines"
             */
            if (nFill) {
                nFill--;
                continue;
            }

            /*
             * Pad the line buffer as needed
             */
            while (nCols < this.abLineBuffer.length) {
                this.abLineBuffer[nCols++] = 0;     // character code 0 is a empty font character
            }

            /*
             * Display the line buffer; ordinarily, the font number would be valid after processing the "fill lines",
             * but if the buffer isn't initialized yet, those lines might be missing, so the font number might not be set.
             */
            if (font >= 0) {
                /*
                 * Cell cache logic is complicated by the fact that a line may be single-width one frame and double-width
                 * the next.  So we store the visible line length at the start of each row in the cache, which must match if
                 * the cache can be considered valid for the current line.
                 */
                var fLineCacheValid = this.fCellCacheValid && (this.aCellCache[iCell] == nColsVisible);
                this.aCellCache[iCell++] = nColsVisible;
                for (var iCol = 0; iCol < nCols; iCol++) {
                    data = this.abLineBuffer[iCol];
                    if (!fLineCacheValid || data !== this.aCellCache[iCell]) {
                        this.aCellCache[iCellUpdated = iCell] = data;
                        this.updateChar(font, iCol, nRows, data, this.contextBuffer);
                        cUpdated++;
                    }
                    iCell++;
                }
            }
            nRows++;
        }

        this.fCellCacheValid = true;

        this.assert(font < 0 || iCell === this.nCellCache);

        if (!fForced && this.fSkipSingleCellUpdate && cUpdated == 1) {
            /*
             * We're going to blow off this update, since it comes on the heels of a smooth-scroll that *may*
             * not be completely finished yet, and at the same time, we're going to zap the only updated cell
             * cache entry, to guarantee that it's redrawn on the next update.
             */
            this.assert(iCellUpdated >= 0);
            /*
             * TODO: If I change the RECV rate to 19200 and enable smooth scrolling, I sometimes see a spurious
             * "H" on the bottom line after a long series of "HELLO WORLD!\r\n" tests.  Dumping video memory shows
             * "HELLO WORLD!" on 23 lines and an "H" on the 24th line, so it's really there.  But strangely, if
             * I then press SET-UP two times, the restored screen does NOT have the spurious "H".  So somehow the
             * firmware knows what should and shouldn't be on-screen.
             *
             * Possible VT100 firmware bug?  I'm not sure.  Anyway, this DEBUG-only code is here to help trap
             * that scenario, until I figure it out.
             */
            if (DEBUG && (this.aCellCache[iCellUpdated] & 0x7f) == 0x48) {
                console.log("spurious character?");
            }
            this.aCellCache[iCellUpdated] = -1;
            cUpdated = 0;
        }
        this.fSkipSingleCellUpdate = false;

        if ((cUpdated || fForced) && this.contextBuffer) {
            /*
             * We must subtract cyCell from cyBuffer to avoid displaying the extra "scroll line" that we normally
             * buffer, in support of smooth scrolling.  Speaking of which, we must also add bScrollOffset to ySrc
             * (well, ySrc is always relative to zero, so no add is actually required).
             */
            this.contextScreen.drawImage(
                this.canvasBuffer,
                0,                                  // xSrc
                this.bScrollOffset,                 // ySrc
                this.cxBuffer,                      // cxSrc
                this.cyBuffer - this.cyCell,        // cySrc
                this.xScreenOffset,                 // xDst
                this.yScreenOffset,                 // yDst
                this.cxScreenOffset,                // cxDst
                this.cyScreenOffset                 // cyDst
            );
        }
    }

    /**
     * updateScreen(fForced)
     *
     * Propagates the video buffer to the cell cache and updates the screen with any changes.  Forced updates
     * are generally internal updates triggered by an I/O operation or other state change, while non-forced updates
     * are the periodic updates coming from the CPU.
     *
     * For every cell in the video buffer, compare it to the cell stored in the cell cache, render if it differs,
     * and then update the cell cache to match.  Since initCellCache() sets every cell in the cell cache to an
     * invalid value, we're assured that the next call to updateScreen() will redraw the entire (visible) video buffer.
     *
     * @this {Video8080}
     * @param {boolean} [fForced]
     */
    updateScreen(fForced)
    {
        var fUpdate = true;

        if (!fForced) {
            if (this.rateInterrupt) {
                /*
                 * TODO: Incorporate these hard-coded interrupt vector numbers into configuration blocks.
                 */
                if (this.rateInterrupt == 120) {
                    if (!(this.nUpdates & 1)) {
                        /*
                         * On even updates, call cpu.requestINTR(1), and also update our copy of the screen.
                         */
                        this.cpu.requestINTR(1);
                    } else {
                        /*
                         * On odd updates, call cpu.requestINTR(2), but do NOT update our copy of the screen, because
                         * the machine has presumably only updated the top half of the frame buffer at this point; it will
                         * update the bottom half of the frame buffer after acknowledging this interrupt.
                         */
                        this.cpu.requestINTR(2);
                        fUpdate = false;
                    }
                } else {
                    this.cpu.requestINTR(4);
                }
            }

            /*
             * Since this is not a forced update, if our cell cache is valid AND we allocated our own buffer AND the buffer
             * is clean, then there's nothing to do.
             */
            if (fUpdate && this.fCellCacheValid && this.sizeBuffer) {
                if (this.bus.cleanMemory(this.addrBuffer, this.sizeBuffer)) {
                    fUpdate = false;
                }
            }
            this.cpu.setTimer(this.timerUpdateNext, this.getRefreshTime());
            this.nUpdates++;
        }

        if (!fUpdate) {
            return;
        }

        if (this.cxCell > 1) {
            this.updateScreenText(fForced);
        } else {
            this.updateScreenGraphics(fForced);
        }
    }

    /**
     * updateScreenText(fForced)
     *
     * @this {Video8080}
     * @param {boolean} [fForced]
     */
    updateScreenText(fForced)
    {
        switch(this.nFormat) {
        case Video8080.FORMAT.VT100:
            this.updateVT100(fForced);
            break;
        }
    }

    /**
     * updateScreenGraphics(fForced)
     *
     * @this {Video8080}
     * @param {boolean} [fForced]
     */
    updateScreenGraphics(fForced)
    {
        var addr = this.addrBuffer;
        var addrLimit = addr + this.sizeBuffer;

        var iCell = 0;
        var nPixelShift = 1;

        var xBuffer = 0, yBuffer = 0;
        var xDirty = this.cxBuffer, xMaxDirty = 0, yDirty = this.cyBuffer, yMaxDirty = 0;

        var nShiftInit = 0;
        var nShiftPixel = this.nBitsPerPixel;
        var nMask = (1 << nShiftPixel) - 1;
        if (this.iBitFirstPixel) {
            nShiftPixel = -nShiftPixel;
            nShiftInit = 16 + nShiftPixel;
        }

        while (addr < addrLimit) {
            var data = this.bus.getShortDirect(addr);
            this.assert(iCell < this.aCellCache.length);
            if (this.fCellCacheValid && data === this.aCellCache[iCell]) {
                xBuffer += this.nPixelsPerCell;
            } else {
                this.aCellCache[iCell] = data;
                var nShift = nShiftInit;
                if (nShift) data = ((data >> 8) | ((data & 0xff) << 8));
                if (xBuffer < xDirty) xDirty = xBuffer;
                var cPixels = this.nPixelsPerCell;
                while (cPixels--) {
                    var bPixel = (data >> nShift) & nMask;
                    this.setPixel(this.imageBuffer, xBuffer++, yBuffer, bPixel);
                    nShift += nShiftPixel;
                }
                if (xBuffer > xMaxDirty) xMaxDirty = xBuffer;
                if (yBuffer < yDirty) yDirty = yBuffer;
                if (yBuffer >= yMaxDirty) yMaxDirty = yBuffer + 1;
            }
            addr += 2; iCell++;
            if (xBuffer >= this.cxBuffer) {
                xBuffer = 0; yBuffer++;
                if (yBuffer > this.cyBuffer) break;
            }
        }

        this.fCellCacheValid = true;

        /*
         * Instead of blasting the ENTIRE imageBuffer into contextBuffer, and then blasting the ENTIRE
         * canvasBuffer onto contextScreen, even for the smallest change, let's try to be a bit smarter about
         * the update (well, to the extent that the canvas APIs permit).
         */
        if (xDirty < this.cxBuffer) {
            var cxDirty = xMaxDirty - xDirty;
            var cyDirty = yMaxDirty - yDirty;
            if (this.rotateBuffer) {
                /*
                 * If rotateBuffer is set, then it must be -90, so we must "rotate" the dirty coordinates as well,
                 * because they are relative to the frame buffer, not the rotated image buffer.  Alternatively, you
                 * can use the following call to blast the ENTIRE imageBuffer into contextBuffer instead:
                 *
                 *      this.contextBuffer.putImageData(this.imageBuffer, 0, 0);
                 */
                var xDirtyOrig = xDirty, cxDirtyOrig = cxDirty;
                //noinspection JSSuspiciousNameCombination
                xDirty = yDirty;
                cxDirty = cyDirty;
                yDirty = this.cxBuffer - (xDirtyOrig + cxDirtyOrig);
                cyDirty = cxDirtyOrig;
            }
            this.contextBuffer.putImageData(this.imageBuffer, 0, 0, xDirty, yDirty, cxDirty, cyDirty);
            /*
             * As originally noted in /modules/pcx86/lib/video.js, I would prefer to draw only the dirty portion of
             * canvasBuffer, but there usually isn't a 1-1 pixel mapping between canvasBuffer and contextScreen, so
             * if we draw interior rectangles, we can end up with subpixel artifacts along the edges of those rectangles.
             */
            this.contextScreen.drawImage(this.canvasBuffer, 0, 0, this.canvasBuffer.width, this.canvasBuffer.height, 0, 0, this.cxScreen, this.cyScreen);
        }
    }

    /**
     * Video8080.init()
     *
     * This function operates on every HTML element of class "video", extracting the
     * JSON-encoded parameters for the Video constructor from the element's "data-value"
     * attribute, invoking the constructor to create a Video component, and then binding
     * any associated HTML controls to the new component.
     */
    static init()
    {
        var aeVideo = Component.getElementsByClass(document, PC8080.APPCLASS, "video");
        for (var iVideo = 0; iVideo < aeVideo.length; iVideo++) {
            var eVideo = aeVideo[iVideo];
            var parmsVideo = Component.getComponentParms(eVideo);

            var eCanvas = document.createElement("canvas");
            if (eCanvas === undefined || !eCanvas.getContext) {
                eVideo.innerHTML = "<br/>Missing &lt;canvas&gt; support. Please try a newer web browser.";
                return;
            }

            eCanvas.setAttribute("class", "pcjs-canvas");
            eCanvas.setAttribute("width", parmsVideo['screenWidth']);
            eCanvas.setAttribute("height", parmsVideo['screenHeight']);
            eCanvas.style.backgroundColor = parmsVideo['screenColor'];

            /*
             * The "contenteditable" attribute on a canvas element NOTICEABLY slows down canvas drawing on
             * Safari as soon as you give the canvas focus (ie, click away from the canvas, and drawing speeds
             * up; click on the canvas, and drawing slows down).  So the "transparent textarea hack" that we
             * once employed as only a work-around for Android devices is now our default.
             *
             *      eCanvas.setAttribute("contenteditable", "true");
             *
             * HACK: A canvas style of "auto" provides for excellent responsive canvas scaling in EVERY browser
             * except IE9/IE10, so I recalculate the appropriate CSS height every time the parent DIV is resized;
             * IE11 works without this hack, so we take advantage of the fact that IE11 doesn't identify as "MSIE".
             *
             * The other reason it's good to keep this particular hack limited to IE9/IE10 is that most other
             * browsers don't actually support an 'onresize' handler on anything but the window object.
             */
            eCanvas.style.height = "auto";
            if (Web.getUserAgent().indexOf("MSIE") >= 0) {
                eVideo.onresize = function(eParent, eChild, cx, cy) {
                    return function onResizeVideo() {
                        eChild.style.height = (((eParent.clientWidth * cy) / cx) | 0) + "px";
                    };
                }(eVideo, eCanvas, parmsVideo['screenWidth'], parmsVideo['screenHeight']);
                eVideo.onresize();
            }
            /*
             * The following is a related hack that allows the user to force the screen to use a particular aspect
             * ratio if an 'aspect' attribute or URL parameter is set.  Initially, it's just for testing purposes
             * until we figure out a better UI.  And note that we use our web.onPageEvent() helper function to make
             * sure we don't trample any other 'onresize' handler(s) attached to the window object.
             */
            var aspect = +(parmsVideo['aspect'] || Web.getURLParm('aspect'));
            /*
             * No 'aspect' parameter yields NaN, which is falsey, and anything else must satisfy my arbitrary
             * constraints of 0.3 <= aspect <= 3.33, to prevent any useless (or worse, browser-blowing) results.
             */
            if (aspect && aspect >= 0.3 && aspect <= 3.33) {
                Web.onPageEvent('onresize', function(eParent, eChild, aspectRatio) {
                    return function onResizeWindow() {
                        /*
                         * Since aspectRatio is the target width/height, we have:
                         *
                         *      eParent.clientWidth / eChild.style.height = aspectRatio
                         *
                         * which means that:
                         *
                         *      eChild.style.height = eParent.clientWidth / aspectRatio
                         *
                         * so for example, if aspectRatio is 16:9, or 1.78, and clientWidth = 640,
                         * then the calculated height should approximately 360.
                         */
                        eChild.style.height = ((eParent.clientWidth / aspectRatio)|0) + "px";
                    };
                }(eVideo, eCanvas, aspect));
                window['onresize']();
            }
            eVideo.appendChild(eCanvas);

            /*
             * HACK: Android-based browsers, like the Silk (Amazon) browser and Chrome for Android, don't honor the
             * "contenteditable" attribute; that is, when the canvas receives focus, they don't activate the on-screen
             * keyboard.  So my fallback is to create a transparent textarea on top of the canvas.
             *
             * The parent DIV must have a style of "position:relative" (alternatively, a class of "pcjs-container"),
             * so that we can position the textarea using absolute coordinates.  Also, we don't want the textarea to be
             * visible, but we must use "opacity:0" instead of "visibility:hidden", because the latter seems to prevent
             * the element from receiving events.  These styling requirements are taken care of in components.css
             * (see references to the "pcjs-video-object" class).
             *
             * UPDATE: Unfortunately, Android keyboards like to compose whole words before transmitting any of the
             * intervening characters; our textarea's keyDown/keyUp event handlers DO receive intervening key events,
             * but their keyCode property is ZERO.  Virtually the only usable key event we receive is the Enter key.
             * Android users will have to use machines that include their own on-screen "soft keyboard", or use an
             * external keyboard.
             *
             * The following attempt to use a password-enabled input field didn't work any better on Android.  You could
             * clearly see the overlaid semi-transparent input field, but none of the input characters were passed along,
             * with the exception of the "Go" (Enter) key.
             *
             *      var eInput = document.createElement("input");
             *      eInput.setAttribute("type", "password");
             *      eInput.setAttribute("style", "position:absolute; left:0; top:0; width:100%; height:100%; opacity:0.5");
             *      eVideo.appendChild(eInput);
             *
             * See this Chromium issue for more information: https://code.google.com/p/chromium/issues/detail?id=118639
             */
            var eTextArea = document.createElement("textarea");

            /*
             * As noted in keyboard.js, the keyboard on an iOS device tends to pop up with the SHIFT key depressed,
             * which is not the initial keyboard state that the Keyboard component expects, so hopefully turning off
             * these "auto" attributes will help.
             */
            if (Web.isUserAgent("iOS")) {
                eTextArea.setAttribute("autocapitalize", "off");
                eTextArea.setAttribute("autocorrect", "off");
            }
            eVideo.appendChild(eTextArea);

            /*
             * Now we can create the Video object, record it, and wire it up to the associated document elements.
             */
            var eContext = eCanvas.getContext("2d");
            var video = new Video8080(parmsVideo, eCanvas, eContext, eTextArea /* || eInput */, eVideo);

            /*
             * Bind any video-specific controls (eg, the Refresh button). There are no essential controls, however;
             * even the "Refresh" button is just a diagnostic tool, to ensure that the screen contents are up-to-date.
             */
            Component.bindComponentControls(video, eVideo, PC8080.APPCLASS);
        }
    }
}

Video8080.COLORS = {
    OVERLAY_TOP:    0,
    OVERLAY_BOTTOM: 1,
    OVERLAY_TOTAL:  2
};

Video8080.FORMAT = {
    UNKNOWN:        0,
    SI1978:         1,
    VT100:          2
};

Video8080.FORMATS = {
    "SI1978":       Video8080.FORMAT.SI1978,
    "VT100":        Video8080.FORMAT.VT100
};


Video8080.VT100 = {
    /*
     * The following font IDs are nothing more than all the possible LINEATTR values masked with FONTMASK;
     * also, note that double-high implies double-wide; the VT100 doesn't support a double-high single-wide font.
     */
    FONT: {
        NORML:      0x60,       // normal font (eg, 10x10)
        DWIDE:      0x40,       // double-wide, single-high font (eg, 20x10)
        DHIGH:      0x20,       // technically, this means display only the TOP half of the double-high font (eg, 20x20)
        DHIGH_BOT:  0x00        // technically, this means display only the BOTTOM half of the double-high font (eg, 20x20)
    },
    LINETERM:       0x7F,
    LINEATTR: {
        ADDRMASK:   0x0F,
        ADDRBIAS:   0x10,       // 0x10 == ADDRBIAS_LO, 0x00 = ADDRBIAS_HI
        FONTMASK:   0x60,
        SCROLL:     0x80
    },
    ADDRBIAS_LO:    0x2000,
    ADDRBIAS_HI:    0x4000
};

/*
 * Initialize every Video module on the page.
 */
Web.onInit(Video8080.init);

module.exports = Video8080;
