
const DIRECTORY_DATA = [
  {
    id: 'academic',
    title: 'Academic',
    items: [
      { name: 'Agriculture Technology (Agri-Tech)', photo: 'images/directory/AGRITECH.jpg',
        text: 'Some College of Agriculture (CAg) classrooms, located in front of the Mitos Magsaysay Building.' },
      { name: 'Agricultural Science Building (ASB)', photo: 'images/directory/ASB.jpg',
        text: 'CAg building with classrooms and a faculty office.' },
      { name: 'CCIT Main', photo: 'images/directory/CCIT_MAIN.jpg',
        text: 'Faculty offices and a computer laboratory, with first year classrooms.' },
      { name: 'CHM 1', photo: 'images/directory/CHM_1.jpg',
        text: 'CHM building near the canteen, with classrooms.' },
      { name: 'CHM 2', photo: 'images/directory/CHM_2.jpg',
        text: 'Second CHM building with the faculty office and some classrooms.' },
      { name: 'CTE (BEED)', photo: 'images/directory/CTE_BEED.jpg',
        text: 'CTE building in front of Gabaldon Court. It also houses the GAD Office (Gender and Development Office).' },
      { name: 'CTE (BSED)', photo: 'images/directory/CTE_BSED.jpg',
        text: 'CTE building with a faculty office and classrooms.' },
      { name: 'Lahar-laden Technology Demonstration Area (LTDA)', photo: 'images/directory/LTDA.jpg',
        text: 'The building is used as the College of Agriculture (CAg) horticulture room.' },
      { name: 'Laboratory High School (LHS)', photo: 'images/directory/LHS.jpg',
        text: 'LHS building with classrooms.' },
      { name: 'LHS Faculty / CCIT', photo: 'images/directory/LHS_CCIT.jpg',
        text: 'Joint building for LHS faculty and CCIT second to fourth year classrooms.' },
      { name: 'Mitos Magsaysay Building', photo: 'images/directory/MITOS.jpg',
        text: 'A CAg building in front of Agri-Tech.' }
    ]
  },
  {
    id: 'facility',
    title: 'Facility',
    items: [
      { name: 'Admin Building', photo: 'images/directory/ADMIN_BUILDING.jpg',
        text: "Cashier, Registrar, and HRMO on the first floor. Second floor: the campus director's office and the accreditation room." },
      { name: 'Canteen', photo: "images/directory/CANTEEN.jpg",
        text: 'A building with four food stalls that serves students and faculty.' },
      { name: "Guard's House", photo: 'images/directory/GUARD_HOUSE.jpg',
        text: "A small building located beside the inner gate." },
      { name: 'Library', photo: "images/directory/LIBRARY.jpg",
        text: 'The campus library, with reading areas and study space.' },
      { name: "Men's Dormitory", photo: 'images/directory/MENS_DORMITORY.jpg',
        text: 'Dormitory housing for male students and faculty.' },
      { name: 'Motorpool', photo: "images/directory/MOTORPOOL.jpg",
        text: 'Campus motorpool and service garage.' },
      { name: 'MRF and Granary', photo: 'images/directory/MRF.jpg',
        text: 'Material Recovery Facility and the other building is a storehouse built to keep harvested grain dry.' },
      { name: 'Practice House', photo: 'images/directory/GUEST_HOUSE.jpg',
        text: 'Abandoned building that could be used as a campus landmark.' },
      { name: 'Regional Mango Center', photo: 'images/directory/RMC.jpg',
        text: 'Has an event hall and some offices.' },
      { name: 'Organic Mango Center', photo: "images/directory/ROMC.jpg",
        text: 'Organic mango research and production facility.' },
      { name: 'Research and Development Center', photo: "images/directory/RND_CENTER.jpg",
        text: 'PRMSU research services office.' },
      { name: 'Student Center', photo: "images/directory/SC.jpg",
        text: 'Office of Student Affairs, Clinic, Dental, and SSG office.' },
      { name: "Women's Dormitory", photo: 'images/directory/WOMENS_DORMITORY.jpg',
        text: 'Dormitory housing for female students and faculty.' }
    ]
  },
  {
    id: 'court_and_outdoor_areas',
    title: 'Multi-Court and Outdoor Areas',
    items: [
      { name: 'Admin Court', photo: 'images/directory/ADMIN_COURT.jpg',
        text: 'Covered court beside the Admin Building, used for campus activities.' },
      { name: 'Gabaldon Court', photo: 'images/directory/GABALDON_COURT.jpg',
        text: 'Covered court used for campus activities.' },
      { name: 'Multi-purpose Court', photo: 'images/directory/QUADRANGLE_COURT.jpg',
        text: 'Open court used for sports and CHM programs.' },
      { name: 'Oval', photo: 'images/directory/OVAL.jpg',
        text: 'The campus oval, used for sports and other activities.' }
    ]
  }
];

(function () {
  'use strict';

  var SWIPE_THRESHOLD = 45;

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  function buildPhotoSlide(item, track) {
    var slide = el('div', 'dir-slide', track);

    var photoBox = el('div', 'dir-photo', slide);
    if (item && item.photo) {
      var img = el('img', 'dir-photo-img', photoBox);
      img.alt = item.name || 'Building photo';
      img.loading = 'lazy';
      img.decoding = 'async';
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

  function buildCategory(cat) {
    var section = el('section', 'dir-cat');
    section.setAttribute('data-cat', cat.id || '');

    el('div', 'dir-cat-title', section).textContent = cat.title || 'Category';

    var items = Array.isArray(cat.items) ? cat.items : [];

    if (items.length === 0) {
      var empty = el('div', 'dir-empty', section);
      empty.textContent = 'No buildings added to this category yet.';
      return section;
    }

    var stage = el('div', 'dir-stage', section);

    var viewport = el('div', 'dir-viewport', stage);
    var track = el('div', 'dir-track', viewport);
    items.forEach(function (item) { buildPhotoSlide(item, track); });

    el('div', 'dir-photo-gradient', stage);

    var prev = el('button', 'dir-arrow dir-arrow-left', stage);
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous building');
    prev.innerHTML = '<span>‹</span>';

    var next = el('button', 'dir-arrow dir-arrow-right', stage);
    next.type = 'button';
    next.setAttribute('aria-label', 'Next building');
    next.innerHTML = '<span>›</span>';

    var dots = el('div', 'dir-dots', stage);
    var dotEls = items.map(function (_, i) {
      var d = el('button', 'dir-dot', dots);
      d.type = 'button';
      d.setAttribute('aria-label', 'Go to building ' + (i + 1));
      d.addEventListener('click', function () { go(i); });
      return d;
    });

    var info = el('div', 'dir-info', section);
    var nameEl = el('div', 'dir-name', info);
    var textEl = el('p', 'dir-text', info);

    var idx = 0;

    var zoomImg = null;
    var zoomBox = null;
    var zoomView = { scale: 1, baseScale: 1, minScale: 1, maxScale: 4, tx: 0, ty: 0, imgW: 0, imgH: 0 };

    function currentPhotoImg() {
      var slide = track.children[idx];
      return slide ? slide.querySelector('.dir-photo-img') : null;
    }

    function isZoomActive() {
      return !!zoomImg && zoomView.scale > zoomView.baseScale + 0.01;
    }

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
      box.classList.add('dir-photo-zoomed');
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
      Array.prototype.forEach.call(track.children, function (s, i) {
        s.setAttribute('aria-hidden', i === idx ? 'false' : 'true');
      });
      var item = items[idx];
      nameEl.textContent = (item && item.name) ? item.name : 'Building name';
      textEl.textContent = (item && item.text) ? item.text : 'Insert text about the building — what is inside and what it is for.';
    }

    function go(i) {
      resetZoom();
      var n = items.length;
      idx = ((i % n) + n) % n;
      render();
    }

    prev.addEventListener('click', function () { go(idx - 1); });
    next.addEventListener('click', function () { go(idx + 1); });

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
    if (!host || host._built) return;
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
