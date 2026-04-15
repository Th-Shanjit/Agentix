export function GlassBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute -left-1/4 top-[-10%] h-[420px] w-[420px] rounded-full bg-indigo-500/[0.07] blur-[140px]" />
      <div className="absolute left-1/3 top-1/4 h-[380px] w-[380px] rounded-full bg-emerald-500/[0.06] blur-[140px]" />
      <div className="absolute -right-1/4 bottom-[-5%] h-[440px] w-[440px] rounded-full bg-amber-400/[0.05] blur-[140px]" />
    </div>
  );
}
