// Runs in the call page's own JavaScript world ("world": "MAIN"), before its scripts, so it sees the tracks
// the page gets from getUserMedia. It only checks whether a camera track is live, never its image or sound,
// and tells content.js (which has the extension API) through a window message. Also runs in the page's own frames,
// in case one of them opens the camera; content.js runs only in the top page, hence `top`.
(() => {
  const tracks = new Set(); // camera tracks: from getUserMedia, and copies of them
  let timer = 0;
  let last = false;

  function keep(t) {
    if (t.kind !== "video") return;
    tracks.add(t);
    timer ||= setInterval(poll, 1000);
  }

  // Polled: stop() fires no "ended" event and turning a track off (enabled = false) fires nothing.
  function poll() {
    for (const t of tracks) if (t.readyState !== "live") tracks.delete(t);
    const camera = [...tracks].some((t) => t.enabled && !t.muted); // actually sending frames
    // Repeated while camera tracks exist: content.js starts later (document_idle) and may have missed the change.
    // Only to a same-origin top page: when another site embeds the call, `top` is that site and must not hear it.
    if (camera !== last || tracks.size) top.postMessage({ ringLight: { camera } }, location.origin);
    last = camera;
    if (!tracks.size) {
      clearInterval(timer);
      timer = 0;
    }
  }

  const getUserMedia = MediaDevices.prototype.getUserMedia;
  MediaDevices.prototype.getUserMedia = function (...args) {
    return getUserMedia.apply(this, args).then((stream) => {
      stream.getTracks().forEach(keep);
      return stream;
    });
  };
  // Meet may hand on a copy and stop the original. Copies of other tracks (e.g. canvas effects) are not the camera.
  const clone = MediaStreamTrack.prototype.clone;
  MediaStreamTrack.prototype.clone = function () {
    const copy = clone.call(this);
    if (tracks.has(this)) keep(copy);
    return copy;
  };
  // A stream copy clones its tracks without calling MediaStreamTrack.prototype.clone.
  const cloneStream = MediaStream.prototype.clone;
  MediaStream.prototype.clone = function () {
    const copy = cloneStream.call(this);
    if (this.getTracks().some((t) => tracks.has(t))) copy.getTracks().forEach(keep);
    return copy;
  };
})();
