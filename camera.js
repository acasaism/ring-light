// Runs in Meet's own JavaScript world ("world": "MAIN"), before Meet's scripts, so it sees the tracks
// Meet gets from getUserMedia. It only checks whether a camera track is live, never its image or sound,
// and tells content.js (which has the extension API) through a window message.
(() => {
  const tracks = new Set();
  const getUserMedia = MediaDevices.prototype.getUserMedia;
  MediaDevices.prototype.getUserMedia = function (...args) {
    return getUserMedia.apply(this, args).then((stream) => {
      for (const t of stream.getTracks()) tracks.add(t);
      return stream;
    });
  };
  // Meet may hand on a copy and stop the original. Copies of other tracks (e.g. canvas effects) are not the camera.
  const clone = MediaStreamTrack.prototype.clone;
  MediaStreamTrack.prototype.clone = function () {
    const copy = clone.call(this);
    if (tracks.has(this)) tracks.add(copy);
    return copy;
  };

  let last = JSON.stringify({ camera: false, media: false });
  // Polled: stop() fires no "ended" event and turning a track off (enabled = false) fires nothing.
  setInterval(() => {
    for (const t of tracks) if (t.readyState !== "live") tracks.delete(t);
    const live = [...tracks];
    // media: any live track, microphone included; camera: a video track actually sending frames
    const state = { camera: live.some((t) => t.kind === "video" && t.enabled && !t.muted), media: live.length > 0 };
    const now = JSON.stringify(state);
    // Repeated while tracks exist: content.js starts later (document_idle) and may have missed the change.
    if (now !== last || live.length) top.postMessage({ ringLight: state }, "*");
    last = now;
  }, 1000);
})();
