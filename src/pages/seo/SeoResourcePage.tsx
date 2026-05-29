import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PRODUCT_NAME } from "../../domain/brand";
import { seoResources, seoResourcesBySlug } from "../../domain/seoResources";

export function SeoResourcePage() {
  const { resourceSlug = "" } = useParams();
  const resource = seoResourcesBySlug[resourceSlug];

  if (!resource) {
    return (
      <main className="min-h-screen bg-[#f7f7f4] px-5 py-6 font-sans text-neutral-950">
        <div className="mx-auto max-w-[760px]">
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] text-[13px] font-extrabold text-neutral-500 transition hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            처음으로
          </Link>
          <section className="mt-20">
            <p className="text-[13px] font-extrabold text-neutral-500">
              {PRODUCT_NAME}
            </p>
            <h1 className="mt-3 text-[30px] font-extrabold leading-tight">
              자료를 찾을 수 없습니다
            </h1>
          </section>
        </div>
      </main>
    );
  }

  const relatedResources = seoResources.filter(
    (item) => item.path !== resource.path,
  );

  return (
    <main className="min-h-screen bg-[#f7f7f4] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-[#f7f7f4]/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-5 sm:px-6">
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] text-[13px] font-extrabold text-neutral-700 transition hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[9px] bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </span>
            {PRODUCT_NAME}
          </Link>
          <Link
            to={resource.primaryCta.path}
            className="inline-flex h-10 items-center justify-center rounded-[10px] bg-blue-600 px-4 text-[13px] font-extrabold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
          >
            {resource.primaryCta.label}
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-[1080px] px-5 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-14">
          <div className="min-w-0">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-neutral-500 transition hover:text-neutral-950"
            >
              <ArrowLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-6 max-w-[760px] text-[34px] font-extrabold leading-[1.12] tracking-normal text-neutral-950 sm:text-[46px]">
              {resource.title}
            </h1>
            <p className="mt-5 max-w-[720px] text-[16px] font-semibold leading-7 text-neutral-600 sm:text-[17px]">
              {resource.summary}
            </p>

            <div className="mt-10 space-y-10">
              {resource.sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-[22px] font-extrabold tracking-normal text-neutral-950">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4 text-[15px] font-medium leading-7 text-neutral-700">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <aside className="lg:pt-[92px]">
            <div className="sticky top-24 space-y-6">
              <section>
                <h2 className="text-[13px] font-extrabold text-neutral-950">
                  관련 검색 의도
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {resource.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-bold text-neutral-600"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-[13px] font-extrabold text-neutral-950">
                  다른 자료
                </h2>
                <div className="mt-3 grid gap-2">
                  {relatedResources.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className="rounded-[8px] border border-neutral-200 bg-white px-3 py-3 text-[13px] font-bold leading-5 text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
                    >
                      {item.title}
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </article>
    </main>
  );
}
