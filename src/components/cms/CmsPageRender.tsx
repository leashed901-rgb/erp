'use client';

/* Shared storefront renderer for a CMS page's blocks. Used by the public
   /s/[slug] page AND the page editor's Preview tab, so what the editor
   shows is what the storefront shows. Blocks carry plain props; the render
   API resolves gallery / testimonial / FAQ / product items into
   props.items before handing the page to this component. */

export interface CmsBlockView {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const items = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

function Section({ b }: { b: CmsBlockView }) {
  const p = b.props;
  switch (b.type) {
    case 'hero':
      return (
        <section
          className="px-6 py-16 md:py-24 text-center"
          style={{ backgroundColor: str(p.background_color) || '#faf9fc', color: str(p.text_color) || '#1a1c1e' }}
        >
          <div className="max-w-3xl mx-auto" style={{ textAlign: (str(p.alignment) as 'left' | 'center' | 'right') || 'center' }}>
            {str(p.headline) && <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{str(p.headline)}</h1>}
            {str(p.subheadline) && <p className="mt-4 text-lg opacity-80">{str(p.subheadline)}</p>}
            {str(p.body) && <p className="mt-4 text-[15px] leading-relaxed opacity-80 whitespace-pre-wrap">{str(p.body)}</p>}
            {str(p.cta_label) && str(p.cta_url) && (
              <a
                href={str(p.cta_url)}
                className="inline-block mt-8 h-11 px-6 rounded-full bg-[#0a6400] text-white text-[14px] font-semibold leading-[44px]"
              >
                {str(p.cta_label)}
              </a>
            )}
            {str(p.image_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={str(p.image_url)} alt="" className="mt-10 mx-auto rounded-xl max-h-[420px] object-cover" />
            )}
          </div>
        </section>
      );
    case 'text':
      return (
        <section className="px-6 py-10">
          <div className="max-w-3xl mx-auto whitespace-pre-wrap text-[15px] leading-relaxed" style={{ textAlign: (str(p.alignment) as 'left' | 'center' | 'right') || 'left' }}>
            {str(p.body)}
          </div>
        </section>
      );
    case 'image':
      return (
        <section className="px-6 py-8">
          <figure className="max-w-4xl mx-auto text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {str(p.image_url) && <img src={str(p.image_url)} alt={str(p.alt_text)} className="mx-auto rounded-xl max-h-[520px] object-cover" />}
            {str(p.caption) && <figcaption className="mt-3 text-[13px] text-[#6f7a69]">{str(p.caption)}</figcaption>}
          </figure>
        </section>
      );
    case 'gallery': {
      const list = items(p.items);
      return (
        <section className="px-6 py-10">
          <div
            className="max-w-5xl mx-auto grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(Number(p.columns) || 3, 1), 4)}, minmax(0, 1fr))` }}
          >
            {list.map((it, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={str(it.image_url)} alt={str(it.alt_text)} className="w-full h-56 object-cover rounded-lg" />
            ))}
            {list.length === 0 && <p className="text-[13px] text-[#6f7a69]">No published images in this gallery yet.</p>}
          </div>
        </section>
      );
    }
    case 'featured-products': {
      const list = items(p.items);
      return (
        <section className="px-6 py-10">
          <div className="max-w-5xl mx-auto">
            {str(p.title) && <h2 className="text-2xl font-bold mb-6">{str(p.title)}</h2>}
            <div
              className="grid gap-5"
              style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(Number(p.columns) || 4, 1), 4)}, minmax(0, 1fr))` }}
            >
              {list.map((it, i) => (
                <div key={i} className="border border-[#dad9dd] rounded-xl overflow-hidden bg-white">
                  {str(it.image_url) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={str(it.image_url)} alt={str(it.name)} className="w-full h-40 object-cover" />
                  )}
                  <div className="p-3">
                    <div className="text-[13px] font-semibold">{str(it.name)}</div>
                    {it.price != null && <div className="text-[13px] text-[#6f7a69] mt-1">${Number(it.price).toFixed(2)}</div>}
                  </div>
                </div>
              ))}
              {list.length === 0 && <p className="text-[13px] text-[#6f7a69]">No products selected.</p>}
            </div>
          </div>
        </section>
      );
    }
    case 'testimonials': {
      const list = items(p.items);
      return (
        <section className="px-6 py-10 bg-[#faf9fc]">
          <div className="max-w-4xl mx-auto">
            {str(p.title) && <h2 className="text-2xl font-bold mb-6 text-center">{str(p.title)}</h2>}
            <div className="grid md:grid-cols-3 gap-5">
              {list.map((it, i) => (
                <blockquote key={i} className="bg-white border border-[#dad9dd] rounded-xl p-5">
                  <p className="text-[14px] leading-relaxed">&ldquo;{str(it.quote)}&rdquo;</p>
                  <footer className="mt-3 text-[12px] font-semibold">
                    {str(it.author)}
                    {it.rating != null && <span className="text-[#6f7a69] font-normal"> · {String(it.rating)}/5</span>}
                  </footer>
                </blockquote>
              ))}
              {list.length === 0 && <p className="text-[13px] text-[#6f7a69]">No testimonials yet.</p>}
            </div>
          </div>
        </section>
      );
    }
    case 'faq': {
      const list = items(p.items);
      return (
        <section className="px-6 py-10">
          <div className="max-w-3xl mx-auto">
            {str(p.title) && <h2 className="text-2xl font-bold mb-6">{str(p.title)}</h2>}
            {list.map((it, i) => (
              <details key={i} className="border-b border-[#dad9dd] py-4">
                <summary className="text-[14px] font-semibold cursor-pointer">{str(it.question)}</summary>
                <p className="mt-2 text-[14px] leading-relaxed text-[#444]">{str(it.answer)}</p>
              </details>
            ))}
            {list.length === 0 && <p className="text-[13px] text-[#6f7a69]">No FAQs yet.</p>}
          </div>
        </section>
      );
    }
    case 'cta':
      return (
        <section className="px-6 py-12" style={{ backgroundColor: str(p.background_color) || '#0a6400' }}>
          <div className="max-w-3xl mx-auto text-center text-white">
            {str(p.headline) && <h2 className="text-2xl font-bold">{str(p.headline)}</h2>}
            {str(p.body) && <p className="mt-3 text-[14px] leading-relaxed opacity-90 whitespace-pre-wrap">{str(p.body)}</p>}
            {str(p.cta_label) && str(p.cta_url) && (
              <a href={str(p.cta_url)} className="inline-block mt-6 h-10 px-5 rounded-full bg-white text-[#0a6400] text-[13px] font-semibold leading-10">
                {str(p.cta_label)}
              </a>
            )}
          </div>
        </section>
      );
    case 'banner':
      return null; // banners render in the page chrome, not as a section body
    case 'newsletter':
      return (
        <section className="px-6 py-12 bg-[#faf9fc]">
          <div className="max-w-xl mx-auto text-center">
            {str(p.headline) && <h2 className="text-2xl font-bold">{str(p.headline)}</h2>}
            {str(p.body) && <p className="mt-3 text-[14px] text-[#6f7a69] whitespace-pre-wrap">{str(p.body)}</p>}
            <form
              className="mt-6 flex gap-2 justify-center"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <input type="email" required placeholder="Email address" className="h-10 px-3 border border-[#dad9dd] rounded-md text-[13px] w-64 bg-white" />
              <button className="h-10 px-5 rounded-md bg-[#0a6400] text-white text-[13px] font-semibold">{str(p.button_label) || 'Subscribe'}</button>
            </form>
          </div>
        </section>
      );
    case 'video':
      return (
        <section className="px-6 py-8">
          <div className="max-w-4xl mx-auto">
            {str(p.video_url) && (
              <video src={str(p.video_url)} poster={str(p.poster_url) || undefined} controls={!p.autoplay} autoPlay={!!p.autoplay} muted={!!p.autoplay} loop className="w-full rounded-xl" />
            )}
          </div>
        </section>
      );
    case 'divider':
      return <div className="px-6" style={{ height: `${Math.max(Number(p.height) || 32, 8)}px`, borderBottom: `1px solid ${str(p.color) || '#dad9dd'}` }} />;
    default:
      return (
        <section className="px-6 py-6">
          <p className="text-[13px] text-[#6f7a69]">Unknown section type “{b.type}”.</p>
        </section>
      );
  }
}

export default function CmsPageRender({ blocks }: { blocks: CmsBlockView[] }) {
  return (
    <div className="bg-white">
      {blocks.map((b) => (
        <Section key={b.id} b={b} />
      ))}
      {blocks.length === 0 && <p className="px-6 py-16 text-center text-[13px] text-[#6f7a69]">This page has no sections yet.</p>}
    </div>
  );
}
