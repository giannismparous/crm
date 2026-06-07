/** Detect images that finished loading (including from cache) before listeners were attached. */
export function whenImageReady(img: HTMLImageElement, onReady: () => void): () => void {
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    onReady();
  };

  if (img.complete && img.naturalWidth > 0) {
    done();
    return () => undefined;
  }

  img.addEventListener("load", done, { once: true });
  img.addEventListener("error", done, { once: true });

  if (img.complete) queueMicrotask(done);

  const timers = [0, 16, 64, 200, 500].map((ms) =>
    window.setTimeout(() => {
      if (img.complete) done();
    }, ms)
  );
  const raf = requestAnimationFrame(() => {
    if (img.complete) done();
  });

  return () => {
    settled = true;
    img.removeEventListener("load", done);
    img.removeEventListener("error", done);
    for (const id of timers) window.clearTimeout(id);
    cancelAnimationFrame(raf);
  };
}
