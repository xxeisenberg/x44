import React from "react";

interface GridContainerProps {
  leftColumn?: React.ReactNode;
  centerColumn?: React.ReactNode;
  rightColumn?: React.ReactNode;
}

export default function GridContainer({
  leftColumn,
  centerColumn,
  rightColumn,
}: GridContainerProps) {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#0a0a0a] text-white flex items-center justify-center p-8">
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center max-w-7xl w-full transition-all duration-500 ease-in-out">
        <div className="h-24 border-r border-dashed border-neutral-800 transition-all duration-500 relative">
          <div className="absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 z-20 h-1.5 w-1.5 border border-neutral-700 bg-[#0a0a0a]" />
        </div>
        <div className="h-24 border-r border-dashed border-neutral-800 transition-all duration-500 relative">
          <div className="absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 z-20 h-1.5 w-1.5 border border-neutral-700 bg-[#0a0a0a]" />
        </div>
        <div className="h-24" />

        <div className="flex items-center justify-end pr-12 h-full border-t border-b border-r border-dashed border-neutral-800 transition-all duration-500">
          {leftColumn}
        </div>

        <div className="flex items-center justify-center px-16 py-12 h-full border-t border-b border-r border-dashed border-neutral-800 transition-all duration-500">
          {centerColumn}
        </div>

        <div className="flex items-center pl-12 h-full border-t border-b border-dashed border-neutral-800 transition-all duration-500">
          {rightColumn}
        </div>

        <div className="h-24 border-r border-dashed border-neutral-800 transition-all duration-500 relative">
          <div className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 z-20 h-1.5 w-1.5 border border-neutral-700 bg-[#0a0a0a]" />
        </div>
        <div className="h-24 border-r border-dashed border-neutral-800 transition-all duration-500 relative">
          <div className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 z-20 h-1.5 w-1.5 border border-neutral-700 bg-[#0a0a0a]" />
        </div>
        <div className="h-24" />
      </div>
    </div>
  );
}
