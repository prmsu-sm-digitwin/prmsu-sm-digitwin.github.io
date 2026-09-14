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
      { name: 'CCIT Main', photo: 'images/CCIT_MAIN.jpg',
        text: 'College of Communication & Information Technology. Computer laboratory and CCIT lecture rooms.' },
      { name: 'LHS Faculty / CCIT', photo: 'images/LHS_FACULTY_CCIT.jpg',
        text: 'Laboratory High School faculty offices together with additional CCIT classrooms.' },
      { name: 'LHS Building', photo: 'images/LHS.jpg',
        text: 'Laboratory High School — junior and senior high school classrooms.' },
      { name: 'College of Agriculture', photo: 'images/CAG.jpg',
        text: 'College of Agriculture offices and lecture rooms. (Formerly labeled the Mitos Magsaysay Building.)' },
      { name: 'ASB Building', photo: 'images/ASB.jpg',
        text: 'Agriculture Sciences Building — laboratories and lecture rooms for agriculture programs.' },
      { name: 'Agriculture Technology (Agri-Tech)', photo: 'images/AGRI_TECH.jpg',
        text: 'Agri-Tech building housing agricultural technology facilities.' },
      { name: 'CTE (BEED)', photo: 'images/CTE_BEED.jpg',
        text: 'College of Teacher Education — Bachelor of Elementary Education classrooms.' },
      { name: 'CTE (BSED)', photo: 'images/CTE_BSED.jpg',
        text: 'College of Teacher Education — Bachelor of Secondary Education classrooms.' },
      { name: 'CHM 1', photo: 'images/CHM_1.jpg',
        text: 'College of Hospitality Management 1 — training kitchens and lecture rooms.' },
      { name: 'CHM 2', photo: 'images/CHM_2.jpg',
        text: 'College of Hospitality Management 2 — additional HM facilities.' }
    ]
  },
  {
    id: 'facility',
    title: 'Facility',
    items: [
      { name: 'Admin Building', photo: 'images/ADMIN.jpg',
        text: 'University administration building — Registrar, Cashier, and administrative offices.' },
      { name: 'Library', photo: "images/LIBRARY.jpg",
        text: 'Campus library — reading areas, references, and study space.' },
      { name: 'Student Center', photo: "images/SC.jpg",
        text: 'OSA, Clinic, Dental, and other student services.' },
      { name: 'Canteen', photo: "images/CANTEEN.jpg",
        text: 'Campus canteen — meals and refreshments for students and staff.' },
      { name: 'Motorpool', photo: "images/MOTORPOOL.jpg",
        text: 'Campus motorpool and service garage.' },
      { name: 'RMTU Organic Mango Center', photo: "images/ROMC.jpg",
        text: 'Organic mango research and production facility.' },
      { name: 'RMTU Research and Development Center', photo: "images/RND_CENTER.jpg",
        text: 'RMTU R & D Center — research offices and laboratories.' },
      { name: 'Regional Mango Center', photo: "images/ROMC.jpg",
        text: 'Two-storey regional mango center supporting mango research and training.' }
    ]
  },
  {
    id: 'court',
    title: 'Multi-Court',
    items: [
      { name: 'Admin Court', photo: null,
        text: 'Court beside the Admin Building, used for PE classes and campus activities.' },
      { name: 'Gabaldon Court', photo: null,
        text: 'Gabaldon Court — open court for sports and student gatherings.' },
      { name: 'Multi-purpose Quad', photo: null,
        text: 'Open quadrangle used for campus events, programs, and assemblies.' }
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

    // ---- photo stage: only the photos live in the sliding track. Arrows,
    // dots, and the counter are a single shared overlay on top of it (not
    // duplicated per slide), positioned by CSS relative to the photo itself
    // — which is what lets the photo go full-bleed edge-to-edge. ----
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

    var counter = el('div', 'dir-counter', stage);

    // ---- name + blurb for whichever building is current. No longer part
    // of the sliding track — it just swaps content on navigation. ----
    var info = el('div', 'dir-info', section);
    var nameEl = el('div', 'dir-name', info);
    var textEl = el('p', 'dir-text', info);

    var idx = 0;

    function render() {
      track.style.transform = 'translateX(' + (-idx * 100) + '%)';
      dotEls.forEach(function (d, i) {
        d.classList.toggle('is-active', i === idx);
      });
      counter.textContent = (idx + 1) + ' / ' + items.length;
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
      var n = items.length;
      idx = ((i % n) + n) % n;
      render();
    }

    prev.addEventListener('click', function () { go(idx - 1); });
    next.addEventListener('click', function () { go(idx + 1); });

    // Swipe. Only a mostly-horizontal drag counts, so swiping up/down
    // still scrolls the page normally.
    var sx = 0, sy = 0, tracking = false;
    viewport.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    viewport.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - sx;
      var dy = t.clientY - sy;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      if (Math.abs(dx) < Math.abs(dy)) return; // vertical scroll, not a swipe
      go(dx < 0 ? idx + 1 : idx - 1);
    }, { passive: true });

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
