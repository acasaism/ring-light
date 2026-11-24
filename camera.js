// Runs in the call page's own JavaScript world ("world": "MAIN"), before its scripts, so it sees the tracks
// the page gets from getUserMedia. It only checks whether a camera track is live, never its image or sound
// (on Teams, also whether one of the page's call connections is connected, never what goes through it),
// and tells content.js (which has the extension API) through a window message. Also runs in the page's own frames,
// in case one of them opens the camera; content.js runs only in the top page, hence `top`.
(() => {
  // The hosts whose PLATFORMS entry in light.js is meeting: "call" (this world cannot load light.js; test.js checks
  // both agree). A live microphone or camera is no sign of a call there (voice messages, device tests in Settings),
  // and a call may have neither, so a call is a connected RTCPeerConnection.
  const teams = ["teams.microsoft.com", "teams.cloud.microsoft", "teams.live.com"].includes(location.hostname);
  const tracks = new Set(); // camera tracks: from getUserMedia, and copies
  const connections = new Set(); // Teams only: weak references to the page's RTCPeerConnections
  let timer = 0;
  let last = JSON.stringify(teams ? { camera: false, call: false } : { camera: false }); // nothing to report yet

  const watch = () => (timer ||= setInterval(poll, 1000));
  function keep(t) {
    if (t.kind !== "video") return;
    tracks.add(t);
    watch();
  }

  // connectionState, or the ICE state in a browser without it
  const stateOf = (pc) =>
    pc.connectionState ?? (pc.iceConnectionState === "completed" ? "connected" : pc.iceConnectionState);

  // Polled: stop() fires no "ended" event and turning a track off (enabled = false) fires nothing.
  function poll() {
    for (const t of tracks) if (t.readyState !== "live") tracks.delete(t);
    for (const ref of connections) if (!ref.deref() || stateOf(ref.deref()) === "closed") connections.delete(ref);
    const camera = [...tracks].some((t) => t.enabled && !t.muted); // actually sending frames
    const call = [...connections].some((ref) => stateOf(ref.deref()) === "connected");
    const state = teams ? { camera, call } : { camera };
    const watching = tracks.size + connections.size > 0;
    // Repeated while watching: content.js starts later (document_idle) and may have missed the change, and it takes
    // silence as the end (this frame removed or frozen before saying so).
    // Only to a same-origin top page: when another site embeds the call, `top` is that site and must not hear it.
    if (JSON.stringify(state) !== last || watching) top.postMessage({ ringLight: state }, location.origin);
    last = JSON.stringify(state);
    if (!watching) {
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

  // A Proxy keeps the constructor's prototype, static methods, instanceof and subclasses working; only `new` is watched.
  const RTCPeerConnection = globalThis.RTCPeerConnection;
  if (!teams || !RTCPeerConnection) return;
  globalThis.RTCPeerConnection = new Proxy(RTCPeerConnection, {
    construct(target, args, newTarget) {
      const pc = Reflect.construct(target, args, newTarget);
      connections.add(new WeakRef(pc)); // weak: a connection the page drops without closing is not kept alive
      watch();
      return pc;
    },
  });
  if ("webkitRTCPeerConnection" in globalThis) globalThis.webkitRTCPeerConnection = globalThis.RTCPeerConnection;
})();
