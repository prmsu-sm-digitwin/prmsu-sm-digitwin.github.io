/* ==========================================================================
   CAMPUS DIRECTORY — carousel browsing of campus buildings
   --------------------------------------------------------------------------
   >>> TO ADD OR EDIT CONTENT, ONLY TOUCH `DIRECTORY_DATA` BELOW. <<<

   The whole page builds itself from that one array on load, so:
     - add a building  -> add an object to that category's `items` array
     - add a category  -> add another { id, title, items: [...] } object
     - reorder anything-> just move it in the array
   No HTML and no CSS changes are ever needed for either one. Nothing in
   this file is hardcoded to a specific category or a specific number of
   buildings, so it can't silently break when the lists grow.

   Each item takes:
     name  - building name shown beside the photo        (required)
     photo - path to the image, e.g. 'images/ccit.jpg'   (optional)
             leave it as null (or point it at a file that isn't there yet)
             and the slide shows a neat "Photo of the building" placeholder
             instead of a broken image.
     text  - the short blurb: what's inside, what it's for (optional)

   This page is intentionally STATIC — it does not read data/campus.json.
   Editing the list here will not affect the 3D map or navigation.
   ========================================================================== */

const DIRECTORY_DATA = [
  {
    id: 'academic',
    title: 'Academic',
    items: [
      { name: 'Agriculture Technology (Agri-Tech)', photo: 'images/AGRITECH.jpg',
        text: 'Some College of Agriculture (CAg) classrooms, located in front of the Mitos Magsaysay Building.' },
      { name: 'ASB Building', photo: 'images/ASB.jpg',
        text: 'CAg building with classrooms and a faculty office.' },
      { name: 'CCIT Main', photo: 'images/CCIT_MAIN.jpg',
        text: 'Faculty offices and a computer laboratory, with first year classrooms.' },
      { name: 'CHM 1', photo: 'images/CHM_1.jpg',
        text: 'CHM building near the canteen, with classrooms.' },
      { name: 'CHM 2', photo: 'images/CHM_2.jpg',
        text: 'Second CHM building with the faculty office and some classrooms.' },
      { name: 'CTE (BEED)', photo: 'images/CTE_BEED.jpg',
        text: 'CTE building in front of Gabaldon Court.' },
      { name: 'CTE (BSED)', photo: 'images/CTE_BSED.jpg',
        text: 'CTE building with a faculty office and classrooms.' },
      { name: 'LHS Building', photo: 'images/LHS.jpg',
        text: 'LHS building with classrooms.' },
      { name: 'LHS Faculty / CCIT', photo: 'images/LHS_CCIT.jpg',
        text: 'Joint building for LHS faculty and CCIT second to fourth year classrooms.' },
      { name: 'Mitos Magsaysay Building', photo: 'images/MITOS.jpg',
        text: 'A CAg building in front of Agri-Tech.' }
    ]
  },
  {
    id: 'facility',
    title: 'Facility',
    items: [
      { name: 'Admin Building', photo: 'images/ADMIN_BUILDING.jpg',
        text: "Cashier, Registrar, and HRMO on the first floor. Second floor: the campus director's office and the accreditation room." },
      { name: 'Canteen', photo: "images/CANTEEN.jpg",
        text: 'Has four food stalls.' },
      { name: "Guard's House", photo: 'images/GUARD_HOUSE.jpg',
        text: "A small building located beside the inner gate." },
      { name: 'Library', photo: "images/LIBRARY.jpg",
        text: 'The campus library, with reading areas and study space.' },
      { name: "Men's Dormitory", photo: 'images/MENS_DORMITORY.jpg',
        text: 'Dormitory housing for male students and faculty.' },
      { name: 'Motorpool', photo: "images/MOTORPOOL.jpg",
        text: 'Campus motorpool and service garage.' },
      { name: 'Practice House', photo: 'images/GUEST_HOUSE.jpg',
        text: 'Abandoned building that could be used as a campus landmark.' },
      { name: 'Regional Mango Center', photo: 'images/RMC.jpg',
        text: 'Has an event hall and some offices.' },
      { name: 'RMTU Organic Mango Center', photo: "images/ROMC.jpg",
        text: 'Organic mango research and production facility.' },
      { name: 'RMTU Research and Development Center', photo: "images/RND_CENTER.jpg",
        text: 'PRMSU research services office.' },
      { name: 'Student Center', photo: "images/SC.jpg",
        text: 'Office of Student Affairs, Clinic, Dental, and SSG office.' },
      { name: "Women's Dormitory", photo: 'images/WOMENS_DORMITORY.jpg',
        text: 'Dormitory housing for female students and faculty.' }
    ]
  },
  {
    id: 'court',
    title: 'Multi-Court',
    items: [
      { name: 'Admin Court', photo: 'images/ADMIN_COURT.jpg',
        text: 'Covered court beside the Admin Building, used for campus activities.' },
      { name: 'Gabaldon Court', photo: 'images/GABALDON_COURT.jpg',
        text: 'Covered court used for campus activities.' },
      { name: 'Multi-purpose Quad', photo: 'images/QUADRANGLE_COURT.jpg',
        text: 'Open court used for sports and CHM programs.' }
    ]
  }
];

/* ==========================================================================
   Everything below is the generic engine. It never mentions a specific
   building or category by name, so it keeps working no matter how much
   DIRECTORY_DATA grows.
   ========================================================================== */
(function () {
  'use strict';

  var SWIPE_THRESHOLD = 45; // px of horizontal travel before a swipe counts

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  // Slide markup for one building's PHOTO only. The name/blurb used to
  // live inside each slide too, but now that the photo is full-bleed and
  // carries the arrows/dots as an overlay, only the photo needs to slide —
  // the text below the stage just swaps its content on navigation instead
  // of scrolling with it (see buildCategory's render()).
  function buildPhotoSlide(item, track) {
    var slide = el('div', 'dir-slide', track);

    var photoBox = el('div', 'dir-photo', slide);
    if (item && item.photo) {
      var img = el('img', 'dir-photo-img', photoBox);
      img.alt = item.name || 'Building photo';
      // Every category builds its whole carousel up front, so without this
      // the page would kick off dozens of photo downloads the instant it
      // opens — most of them for slides/categories the user hasn't scrolled
      // to yet. loading="lazy" defers each photo until it's actually about
      // to be visible; decoding="async" keeps a big photo's decode off the
      // main thread so it can't freeze a swipe/scroll that's already in progress.
      img.loading = 'lazy';
      img.decoding = 'async';
      // If the file is missing or fails to decode, drop back to the
      // placeholder rather than showing a broken-image icon.
      img.onerror = function () {
        img.remove();
        photoBox.appendChild(placeholderBox());
      };
      img.src = item.photo;
    } else {
      photoBox.appendChild(placeholderBox());
    }

    return slide;
  }

  function placeholderBox() {
    var ph = el('div', 'dir-photo-ph');
    ph.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="5" width="18" height="14" rx="2"/>' +
      '<circle cx="8.5" cy="10.5" r="1.6"/>' +
      '<path d="m21 16-4.5-4.5L9 19"/></svg>' +
      '<span>Photo of the building</span>';
    return ph;
  }

  // Builds one whole category block (overlay title + carousel) from data.
  function buildCategory(cat) {
    var section = el('section', 'dir-cat');
    section.setAttribute('data-cat', cat.id || '');

    el('div', 'dir-cat-title', section).textContent = cat.title || 'Category';

    var items = Array.isArray(cat.items) ? cat.items : [];

    // A category with nothing in it yet gets a friendly empty card instead
    // of an empty box (or a crash on items[0]).
    if (items.length === 0) {
      var empty = el('div', 'dir-empty', section);
      empty.textContent = 'No buildings added to this category yet.';
      return section;
    }

    // ---- photo stage: only the photos live in the sliding track. Arrows
    // and dots are a single shared overlay on top of it (not duplicated
    // per slide), positioned by CSS relative to the photo itself — which
    // is what lets the photo go full-bleed edge-to-edge. ----
    var stage = el('div', 'dir-stage', section);

    var viewport = el('div', 'dir-viewport', stage);
    var track = el('div', 'dir-track', viewport);
    items.forEach(function (item) { buildPhotoSlide(item, track); });

    // Bottom fade so the arrows/dots stay legible over any photo, without
    // dimming the rest of the image.
    el('div', 'dir-photo-gradient', stage);

    var prev = el('button', 'dir-arrow dir-arrow-left', stage);
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous building');
    prev.innerHTML = '<span>‹</span>';

    var next = el('button', 'dir-arrow dir-arrow-right', stage);
    next.type = 'button';
    next.setAttribute('aria-label', 'Next building');
    next.innerHTML = '<span>›</span>';

    // Dots — one per building, and they stay in sync automatically because
    // they're generated from the same list.
    var dots = el('div', 'dir-dots', stage);
    var dotEls = items.map(function (_, i) {
      var d = el('button', 'dir-dot', dots);
      d.type = 'button';
      d.setAttribute('aria-label', 'Go to building ' + (i + 1));
      d.addEventListener('click', function () { go(i); });
      return d;
    });

    // ---- name + blurb for whichever building is current. No longer part
    // of the sliding track — it just swaps content on navigation. ----
    var info = el('div', 'dir-info', section);
    var nameEl = el('div', 'dir-name', info);
    var textEl = el('p', 'dir-text', info);

    var idx = 0;

    // ---- pinch/double-tap zoom, scoped to whichever photo is currently
    // showing. Swiping to a different photo always resets it — each photo
    // starts flat (no zoom carried over), which keeps this simple and
    // matches what people expect from a photo carousel. ----
    var zoomImg = null;  // the <img> currently in "zoomed" mode, or null
    var zoomBox = null;  // its .dir-photo container (for bounds/sizing)
    var zoomView = { scale: 1, baseScale: 1, minScale: 1, maxScale: 4, tx: 0, ty: 0, imgW: 0, imgH: 0 };

    function currentPhotoImg() {
      var slide = track.children[idx];
      return slide ? slide.querySelector('.dir-photo-img') : null;
    }

    function isZoomActive() {
      return !!zoomImg && zoomView.scale > zoomView.baseScale + 0.01;
    }

    // Switches an <img> from its normal CSS object-fit:cover display into
    // JS-driven transform mode — same "cover" math as the satellite map and
    // POV photo viewers use — so it can be scaled/panned. Starts out exactly
    // where object-fit:cover already had it, so there's no visual jump.
    function engageZoom(img) {
      if (!img || !img.naturalWidth || zoomImg === img) return;
      var box = img.closest('.dir-photo');
      if (!box) return;
      var boxW = box.clientWidth, boxH = box.clientHeight;
      if (!boxW || !boxH) return;

      var fit = Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight);
      zoomView.imgW = img.naturalWidth;
      zoomView.imgH = img.naturalHeight;
      zoomView.baseScale = fit;
      zoomView.minScale = fit;
      zoomView.maxScale = fit * 4;
      zoomView.scale = fit;
      zoomView.tx = (boxW - img.naturalWidth * fit) / 2;
      zoomView.ty = (boxH - img.naturalHeight * fit) / 2;

      img.style.position = 'absolute';
      img.style.top = '0';
      img.style.left = '0';
      img.style.width = img.naturalWidth + 'px';
      img.style.height = img.naturalHeight + 'px';
      img.style.transformOrigin = '0 0';

      zoomImg = img;
      zoomBox = box;
      box.classList.add('dir-photo-zoomed'); // hands touch-action fully to us — see style.css
      applyZoomTransform(false);
    }

    function applyZoomTransform(animated) {
      if (!zoomImg) return;
      zoomImg.classList.toggle('dir-photo-img-zoomanim', !!animated);
      zoomImg.style.transform = 'translate(' + zoomView.tx + 'px, ' + zoomView.ty + 'px) scale(' + zoomView.scale + ')';
    }

    function zoomClampToBounds() {
      if (!zoomBox) return;
      var boxW = zoomBox.clientWidth, boxH = zoomBox.clientHeight;
      var scaledW = zoomView.imgW * zoomView.scale;
      var scaledH = zoomView.imgH * zoomView.scale;
      if (scaledW <= boxW) {
        zoomView.tx = (boxW - scaledW) / 2;
      } else {
        var minTx = boxW - scaledW, maxTx = 0;
        zoomView.tx = Math.min(maxTx, Math.max(minTx, zoomView.tx));
      }
      if (scaledH <= boxH) {
        zoomView.ty = (boxH - scaledH) / 2;
      } else {
        var minTy = boxH - scaledH, maxTy = 0;
        zoomView.ty = Math.min(maxTy, Math.max(minTy, zoomView.ty));
      }
    }

    // Back to plain object-fit:cover — clearing the inline styles
    // engageZoom set is enough, the CSS class takes back over.
    function resetZoom() {
      if (!zoomImg) return;
      zoomImg.classList.remove('dir-photo-img-zoomanim');
      zoomImg.style.position = '';
      zoomImg.style.top = '';
      zoomImg.style.left = '';
      zoomImg.style.width = '';
      zoomImg.style.height = '';
      zoomImg.style.transform = '';
      zoomImg.style.transformOrigin = '';
      if (zoomBox) zoomBox.classList.remove('dir-photo-zoomed');
      zoomImg = null;
      zoomBox = null;
      zoomView.scale = 1;
    }

    function render() {
      track.style.transform = 'translateX(' + (-idx * 100) + '%)';
      dotEls.forEach(function (d, i) {
        d.classList.toggle('is-active', i === idx);
      });
      // Only the visible slide should be reachable by screen readers / tab.
      Array.prototype.forEach.call(track.children, function (s, i) {
        s.setAttribute('aria-hidden', i === idx ? 'false' : 'true');
      });
      var item = items[idx];
      nameEl.textContent = (item && item.name) ? item.name : 'Building name';
      textEl.textContent = (item && item.text) ? item.text : 'Insert text about the building — what is inside and what it is for.';
    }

    // Modulo keeps the index in range forever, so it wraps around at both
    // ends and can never run off the array.
    function go(i) {
      resetZoom(); // each photo starts flat when you swipe/tap to it
      var n = items.length;
      idx = ((i % n) + n) % n;
      render();
    }

    prev.addEventListener('click', function () { go(idx - 1); });
    next.addEventListener('click', function () { go(idx + 1); });

    // ---- gestures on the photo stage: single-finger swipe between photos
    // (same idea as before), single-finger pan once zoomed in, two-finger
    // pinch to zoom, double-tap to toggle zoom. Pointer events (not touch
    // events) so pinch reliably reaches this instead of falling through to
    // the browser's own page-zoom — see touch-action in style.css. ----
    var pointers = new Map();
    var pinch = null;
    var dragLast = null;
    var swipeStart = null;
    var lastTap = null;

    function localPoint(clientX, clientY) {
      var r = viewport.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    }

    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      viewport.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        if (isZoomActive()) {
          dragLast = { x: e.clientX, y: e.clientY };
          swipeStart = null;
        } else {
          swipeStart = { x: e.clientX, y: e.clientY };
          dragLast = null;
        }
        pinch = null;
      } else if (pointers.size === 2) {
        swipeStart = null;
        dragLast = null;
        var img = currentPhotoImg();
        if (img && img.naturalWidth) {
          if (!zoomImg) engageZoom(img);
          var pts = [...pointers.values()];
          var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          var mid = localPoint((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
          pinch = {
            startDist: dist || 1,
            startScale: zoomView.scale,
            anchorX: (mid.x - zoomView.tx) / zoomView.scale,
            anchorY: (mid.y - zoomView.ty) / zoomView.scale,
          };
          e.preventDefault();
        }
      }
    });

    viewport.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1 && dragLast) {
        zoomView.tx += e.clientX - dragLast.x;
        zoomView.ty += e.clientY - dragLast.y;
        dragLast = { x: e.clientX, y: e.clientY };
        zoomClampToBounds();
        applyZoomTransform(false);
        e.preventDefault();
      } else if (pointers.size === 2 && pinch) {
        var pts = [...pointers.values()];
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        var mid = localPoint((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        var newScale = pinch.startScale * (dist / pinch.startDist);
        zoomView.scale = Math.min(zoomView.maxScale, Math.max(zoomView.minScale, newScale));
        zoomView.tx = mid.x - pinch.anchorX * zoomView.scale;
        zoomView.ty = mid.y - pinch.anchorY * zoomView.scale;
        zoomClampToBounds();
        applyZoomTransform(false);
        e.preventDefault();
      }
    });

    function endPointer(e) {
      var wasSwipeAttempt = !!swipeStart && pointers.size === 1;
      var startPt = swipeStart;
      pointers.delete(e.pointerId);
      if (viewport.hasPointerCapture && viewport.hasPointerCapture(e.pointerId)) {
        viewport.releasePointerCapture(e.pointerId);
      }

      if (pointers.size === 1) {
        var remaining = [...pointers.values()][0];
        dragLast = isZoomActive() ? remaining : null;
        swipeStart = isZoomActive() ? null : remaining;
        pinch = null;
      } else if (pointers.size === 0) {
        dragLast = null;
        pinch = null;

        // A pinch that let go without ending up zoomed in — snap back to a
        // plain, un-transformed photo instead of leaving it sitting exactly
        // at 1x in "zoomed mode".
        if (zoomImg && !isZoomActive()) {
          zoomView.scale = zoomView.baseScale;
          zoomClampToBounds();
          applyZoomTransform(true);
          setTimeout(resetZoom, 200);
        }

        if (wasSwipeAttempt && startPt) {
          var dx = e.clientX - startPt.x;
          var dy = e.clientY - startPt.y;
          if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) >= Math.abs(dy)) {
            go(dx < 0 ? idx + 1 : idx - 1);
          }
        }
        swipeStart = null;
      }
    }
    viewport.addEventListener('pointerup', endPointer);
    viewport.addEventListener('pointercancel', endPointer);

    // Double-tap (or double-click, on desktop) toggles zoom, centered on
    // wherever was tapped.
    viewport.addEventListener('pointerup', function (e) {
      var img = currentPhotoImg();
      if (!img || !img.naturalWidth) return;
      var now = Date.now();
      var p = { x: e.clientX, y: e.clientY };
      var isDoubleTap = lastTap
        && (now - lastTap.t) < 320
        && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 24;
      lastTap = { t: now, x: p.x, y: p.y };
      if (!isDoubleTap) return;
      lastTap = null;

      if (isZoomActive()) {
        zoomView.scale = zoomView.baseScale;
        zoomClampToBounds();
        applyZoomTransform(true);
        setTimeout(resetZoom, 200);
      } else {
        if (!zoomImg) engageZoom(img);
        var local = localPoint(e.clientX, e.clientY);
        var newScale = zoomView.baseScale * 2.2;
        var imgX = (local.x - zoomView.tx) / zoomView.scale;
        var imgY = (local.y - zoomView.ty) / zoomView.scale;
        zoomView.scale = newScale;
        zoomView.tx = local.x - imgX * newScale;
        zoomView.ty = local.y - imgY * newScale;
        zoomClampToBounds();
        applyZoomTransform(true);
      }
    });

    // Desktop convenience: wheel to zoom, anchored at the cursor.
    viewport.addEventListener('wheel', function (e) {
      var img = currentPhotoImg();
      if (!img || !img.naturalWidth) return;
      e.preventDefault();
      if (!zoomImg) engageZoom(img);
      var local = localPoint(e.clientX, e.clientY);
      var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      var newScale = Math.min(zoomView.maxScale, Math.max(zoomView.minScale, zoomView.scale * factor));
      var imgX = (local.x - zoomView.tx) / zoomView.scale;
      var imgY = (local.y - zoomView.ty) / zoomView.scale;
      zoomView.scale = newScale;
      zoomView.tx = local.x - imgX * newScale;
      zoomView.ty = local.y - imgY * newScale;
      zoomClampToBounds();
      applyZoomTransform(false);
      if (!isZoomActive()) setTimeout(function () { if (!isZoomActive()) resetZoom(); }, 200);
    }, { passive: false });

    render();
    return section;
  }

  function initDirectory() {
    var host = document.getElementById('directory-content');
    if (!host || host._built) return; // build once, never double-render
    host._built = true;

    if (!Array.isArray(DIRECTORY_DATA) || DIRECTORY_DATA.length === 0) {
      var empty = el('div', 'dir-empty', host);
      empty.textContent = 'No categories have been added yet.';
      return;
    }

    DIRECTORY_DATA.forEach(function (cat) {
      if (!cat) return;
      host.appendChild(buildCategory(cat));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDirectory);
  } else {
    initDirectory();
  }

  window.initDirectory = initDirectory;
})();
