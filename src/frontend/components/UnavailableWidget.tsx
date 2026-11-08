export const UnavailableWidget = ({ name }: { name: string }) => (
  <div
    role="status"
    className="flex h-full w-full items-center justify-center rounded border border-slate-700 bg-slate-950/80 p-3 text-center text-sm text-slate-300"
  >
    {name} is unavailable. Its dashboard settings are preserved.
  </div>
);
