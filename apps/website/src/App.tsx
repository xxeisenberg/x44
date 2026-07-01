import { ArrowRight } from 'lucide-react'
import interceptImg from './assets/intercept.png'
import isolateImg from './assets/isolate.png'
import streamImg from './assets/stream.png'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

const architectureRows = [
  {
    index: '01',
    label: 'INTERCEPT',
    description:
      'GitHub triggers a webhook when you push code. A Cloudflare Worker catches it, checks the signature, and tells the VPS to start building.',
    image: interceptImg,
    alt: 'Vertical branch node line graphic',
  },
  {
    index: '02',
    label: 'ISOLATE',
    description:
      'The VPS spins up a fresh, isolated container to build your code. It keeps the build sandboxed so it doesn\'t crash the server or eat up all your RAM.',
    image: isolateImg,
    alt: 'Transparent isometric cube graphic',
  },
  {
    index: '03',
    label: 'STREAM',
    description:
      'Once the build finishes, the assets are pushed straight to Cloudflare R2 storage. When people visit your site, Cloudflare serves the files directly so your VPS doesn\'t have to do any heavy lifting.',
    image: streamImg,
    alt: 'Minimalist global network dots graphic',
  },
]

function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div 
          className="absolute inset-0 -z-10 h-[140%] bg-gradient-to-b from-black/80 via-black/40 to-transparent backdrop-blur-md pointer-events-none"
          style={{
            maskImage: 'linear-gradient(to bottom, black 0%, black 20%, rgba(0, 0, 0, 0.9) 40%, rgba(0, 0, 0, 0.7) 55%, rgba(0, 0, 0, 0.4) 72%, rgba(0, 0, 0, 0.15) 86%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 20%, rgba(0, 0, 0, 0.9) 40%, rgba(0, 0, 0, 0.7) 55%, rgba(0, 0, 0, 0.4) 72%, rgba(0, 0, 0, 0.15) 86%, transparent 100%)'
          }}
        />
        <div className="w-full flex items-center justify-between px-8 py-6 sm:px-16 sm:py-10">
          <a
            href="/"
            className="transition-opacity duration-300 hover:opacity-80 active:opacity-60"
          >
            <img src="/logo.png" alt="x44 logo" className="h-15 w-auto" />
          </a>
          <a
            href="https://github.com"
            className="group flex items-center gap-2.5 text-[13px] font-light tracking-widest uppercase text-white/40 transition-colors duration-300 hover:text-white active:text-white"
          >
            <GitHubIcon className="h-3.5 w-3.5" />
            <span>Login via GitHub</span>
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-8 sm:px-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-light tracking-widest uppercase text-neutral-500">
            DIY Deployment // Built for fun
          </p>

          <h1 className="font-serif text-[clamp(2.5rem,7vw,5.5rem)] font-normal leading-[1.05] tracking-tight text-white">
            Your own
            <br />
            personal Vercel.
          </h1>

          <p className="mx-auto mt-8 max-w-xl text-[15px] leading-relaxed font-light text-neutral-400 sm:mt-10">
            A simple, custom-built deployment engine. It lets you run builds on a VPS and host them directly from Cloudflare.
          </p>

          <div className="mt-12 flex flex-col items-center gap-6 sm:mt-16">
            <div className="group relative inline-flex p-3 sm:p-4">
              {/* Lines */}
              <div className="absolute top-0 left-[-1rem] right-[-1rem] h-[1px] bg-white/20 transition-colors duration-500 group-hover:bg-white/40 group-active:bg-white/40" />
              <div className="absolute bottom-0 left-[-1rem] right-[-1rem] h-[1px] bg-white/20 transition-colors duration-500 group-hover:bg-white/40 group-active:bg-white/40" />
              <div className="absolute left-0 top-[-1rem] bottom-[-1rem] w-[1px] bg-white/20 transition-colors duration-500 group-hover:bg-white/40 group-active:bg-white/40" />
              <div className="absolute right-0 top-[-1rem] bottom-[-1rem] w-[1px] bg-white/20 transition-colors duration-500 group-hover:bg-white/40 group-active:bg-white/40" />

              {/* Bottom Right Dot */}
              <div className="absolute -bottom-3 -right-3 flex h-1.5 w-1.5 items-center justify-center rounded-full bg-white/30 transition-all border border-white/0 duration-500 group-hover:border group-hover:border-white/40 group-active:border group-active:border-white/40"/>

              {/* Hover Pattern */}
              <div
                className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-active:opacity-100 pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.1) 6px, rgba(255,255,255,0.1) 7px)',
                }}
              />

              <a
                href="#deploy"
                id="deploy-button"
                className="relative z-10 inline-flex items-center gap-3 bg-white px-10 py-4 text-[13px] font-medium tracking-widest uppercase text-black"
              >
                Deploy site
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1 group-active:translate-x-1"
                  strokeWidth={1.5}
                />
              </a>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
          <div className="h-10 w-px bg-gradient-to-b from-transparent via-charcoal to-transparent" />
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="px-8 sm:px-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-24 sm:mb-32">
            <p className="text-[11px] font-light tracking-[0.35em] uppercase text-ash">
              How it works
            </p>
          </div>

          {architectureRows.map((row, i) => (
            <div key={row.index}>
              {/* Top border line */}
              <div className="h-px w-full bg-neutral-900" />

              <div className="grid grid-cols-1 md:grid-cols-2 min-h-[400px]">
                {/* Left: Text content */}
                <div className="flex flex-col justify-center py-16 sm:py-20 md:py-24 md:pr-12 lg:pr-16 md:border-r md:border-neutral-900">
                  <div className="mb-6 sm:mb-8">
                    <span className="text-[11px] font-light tracking-[0.4em] uppercase text-dim">
                      {row.index}
                    </span>
                    <span className="mx-3 text-[11px] text-neutral-800">/</span>
                    <span className="text-[11px] font-light tracking-[0.4em] uppercase text-ash">
                      {row.label}
                    </span>
                  </div>
                  <p className="max-w-md text-[15px] leading-[1.85] font-light text-ash">
                    {row.description}
                  </p>
                </div>

                {/* Right: Images */}
                <div className="flex items-center justify-center py-8 md:py-0">
                  <img
                    src={row.image}
                    alt={row.alt}
                    className="w-full fil h-full grayscale object-cover opacity-80 transition-opacity duration-500 hover:opacity-100 active:opacity-100"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Bottom border for the last row */}
              {i === architectureRows.length - 1 && (
                <div className="h-px w-full bg-neutral-900" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Spacer ── */}
      <div className="py-20 sm:py-32" />

      {/* ── Footer ── */}
      <footer className="px-8 pb-12 sm:px-16 sm:pb-16">
        <div className="mx-auto max-w-5xl">
          <div className="h-px w-full bg-neutral-900" />
          <div className="flex items-center justify-center pt-8 sm:pt-10">
            <p className="text-xs font-light tracking-wide text-neutral-600">
              x44 //{' '}
              <a
                href="https://github.com/xxeisenberg/x44"
                className="transition-colors duration-300 hover:text-ash active:text-ash"
              >
                source code
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
