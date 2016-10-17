---
layout: page
title: PDP-11 Boot Code
permalink: /apps/pdp11/boot/
---

PDP-11 Boot Code
----------------

Boot code can be added to machines by including a `<ram>` component in the machine XML configuration file
with the *file* attribute set to the filename of the image, along with optional *load* and *exec* addresses; eg:

```xml
<ram id="ram" addr="0x0000" size="0x4000" file="/apps/pdp11/boot/bootstrap/BOOTSTRAP-16KB.json" load="0x3FE4" exec="0x3FE4"/>
```

If no *load* address is specified, the `<ram>` component relies on the "load" property of the JSON-encoded RAM image;
otherwise, the starting RAM address is used.  If no *exec* address is specified, the CPU will begin execution at its usual
reset address.

The project currently contains the following PDP-11 RAM images:

* [PDP-11 Boot Test](test/)
* [PDP-11 Bootstrap Loader](bootstrap/)