import { useEffect, useRef, useState } from "react";
import { whenImageReady } from "../utils/imageLoadReady";
import { ShimmerPlaceholder } from "./ShimmerPlaceholder";

export function LoadableImage({
  src,
  alt = "",
  className = "",
  imgClassName = "object-cover",
  roundedClassName = "",
}: {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  roundedClassName?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setError(false);
    const img = imgRef.current;
    if (!img) return;

    const markLoaded = () => setLoaded(true);
    const markError = () => setError(true);

    if (img.complete && img.naturalWidth > 0) {
      markLoaded();
      return;
    }

    const unbindReady = whenImageReady(img, markLoaded);
    img.addEventListener("error", markError, { once: true });

    return () => {
      unbindReady();
      img.removeEventListener("error", markError);
    };
  }, [src]);

  const pending = !loaded && !error;

  return (
    <span
      className={`relative block h-full w-full min-h-full min-w-full overflow-hidden ${roundedClassName} ${className}`}
    >
      {pending && <ShimmerPlaceholder roundedClassName={roundedClassName} />}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`relative z-[1] h-full w-full transition-opacity duration-300 ease-out ${pending ? "opacity-0" : "opacity-100"} ${imgClassName}`}
      />
    </span>
  );
}
