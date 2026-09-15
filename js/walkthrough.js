// Campus Walkthrough -- first-person prototype (PLACEHOLDER)
//
// The real first-person walkthrough (raw photogrammetry scan + heightmap-based
// movement) is temporarily disabled here and replaced with a simple "coming
// soon" placeholder. This is intentional, not a bug: the underlying scan mesh
// needed more reconstruction work than there was time for, so rather than ship
// something that could look broken/warped during grading, this page now just
// shows a friendly placeholder and does nothing else (no model, no heightmap,
// no WebGL, no network fetch of large assets).
//
// To bring the real prototype back: restore the previous version of this file
// from git history (git log -- js/walkthrough.js), which loads
// models/GATE2LHSdt.glb + data/walkthroughPathHeightmap.json and drives a
// joystick-controlled first-person camera over the reconstructed pathway.
//
// script.js calls window.CampusWalkthrough.onEnter()/.onLeave() when the user
// navigates to/from the Walkthrough page -- both are still defined here (as
// harmless no-ops beyond showing the placeholder) so that integration keeps
// working without changes elsewhere.
(function () {
  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    var loadingEl = document.getElementById('wt-fp-loading');
    var hintEl = document.getElementById('wt-fp-hint');
    var toastEl = document.getElementById('wt-fp-toast');
    var joyBaseEl = document.getElementById('wt-fp-joystick-base');
    var canvas = document.getElementById('wt-fp-canvas');
    var badgeEl = document.querySelector('#page-walkthrough .wt-fp-badge');

    // Hide everything the real prototype used to drive -- there's nothing to
    // interact with, so no joystick/hint/toast/canvas.
    if (hintEl) hintEl.classList.add('wt-hidden');
    if (toastEl) toastEl.classList.remove('wt-show');
    if (joyBaseEl) joyBaseEl.style.display = 'none';
    if (canvas) canvas.style.display = 'none';
    if (badgeEl) badgeEl.style.display = 'none';

    if (loadingEl) {
      loadingEl.classList.remove('wt-hidden');
      loadingEl.textContent = "Campus Walkthrough is being rebuilt -- check back soon.";
    }
  }

  window.CampusWalkthrough = {
    onEnter: init,
    onLeave: function () {}
  };
})();
