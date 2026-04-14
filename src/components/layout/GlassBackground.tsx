export function GlassBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute -left-1/4 top-[-10%] h-[420px] w-[420px] rounded-full bg-[#A16E83]/20 blur-[120px]" />
      <div className="absolute left-1/3 top-1/4 h-[380px] w-[380px] rounded-full bg-[#479761]/20 blur-[120px]" />
      <div className="absolute -right-1/4 bottom-[-5%] h-[440px] w-[440px] rounded-full bg-[#CEBC81]/16 blur-[120px]" />
      <div className="absolute right-1/4 top-1/2 h-[320px] w-[320px] rounded-full bg-[#B19F9E]/18 blur-[120px]" />
    </div>
  );
}
