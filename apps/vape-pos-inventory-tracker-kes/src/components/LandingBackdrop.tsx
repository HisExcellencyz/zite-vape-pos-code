/**
 * Full-screen brand artwork behind a landing screen. The top stays vivid so the
 * logo and products show; it fades into the theme background lower down so
 * content stays readable. Pair with the `landing` class on the content wrapper
 * to turn cards into frosted glass.
 */
export default function LandingBackdrop({ src, position = 'center top', opacity }: { src: string; position?: string; opacity?: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img src={src} alt="" className="landing-img h-full w-full object-cover" style={{ objectPosition: position, opacity }} />
      {/* Landing screens fade the art out lower down; a faint page-wide backdrop (opacity set) shows it evenly */}
      {opacity === undefined && <>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.10)_0%,hsl(var(--background)/0.45)_35%,hsl(var(--background)/0.82)_68%,hsl(var(--background)/0.94)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent_45%,hsl(var(--background)/0.55)_100%)]" />
      </>}
    </div>
  );
}
