(()=>{"use strict";function o(o){for(;!o.classList.contains("dumpbox");)o=o.parentNode;o.classList.toggle("open")}function n(o){o.parentNode.classList.toggle("extended")}console.log("Booting apixt...");const t="dump";function e(o){const n=new URL(window.location.href),e=n.searchParams;console.log(o),null===o?e.delete(t):void 0!==o&&(e.has(t)?e.set(t,o):e.append(t,o)),window.location.href=n.toString()}})();