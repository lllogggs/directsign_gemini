import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { PRODUCT_NAME } from "../../domain/brand";
import { seoResources, seoResourcesBySlug } from "../../domain/seoResources";

function ResourceHeader({ ctaPath = "/intro/advertiser" }: { ctaPath?: string }) {
  return (
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
          to={ctaPath}
          className="inline-flex h-10 items-center justify-center rounded-[10px] bg-blue-600 px-4 text-[13px] font-extrabold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
        >
          시작하기
        </Link>
      </div>
    </header>
  );
}

export function SeoResourcesIndexPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] font-sans text-neutral-950">
      <ResourceHeader />
      <section className="mx-auto max-w-[1080px] px-5 py-12 sm:px-6 sm:py-16">
        <div className="max-w-[760px]">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-neutral-500 transition hover:text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            홈
          </Link>
          <h1 className="mt-6 text-[34px] font-extrabold leading-[1.12] tracking-normal text-neutral-950 sm:text-[46px]">
            광고 계약 가이드
          </h1>
          <p className="mt-5 text-[16px] font-semibold leading-7 text-neutral-600 sm:text-[17px]">
            협찬, PPL, 공동구매 계약을 시작하기 전에 조건과 증빙을 확인할 수 있는 공개 자료입니다.
          </p>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-2">
          {seoResources.map((resource) => (
            <Link
              key={resource.path}
              to={resource.path}
              className="group rounded-[8px] border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-[0_12px_34px_rgba(15,23,42,0.08)]"
            >
              <h2 className="text-[18px] font-extrabold leading-6 text-neutral-950">
                {resource.title}
              </h2>
              <p className="mt-3 text-[14px] font-semibold leading-6 text-neutral-600">
                {resource.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-[13px] font-extrabold text-blue-700">
                보기
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

export function SeoResourcePage() {
  const { resourceSlug = "" } = useParams();
  const resource = seoResourcesBySlug[resourceSlug];

  if (!resource) {
    return (
      <main className="min-h-screen bg-[#f7f7f4] px-5 py-6 font-sans text-neutral-950">
        <div className="mx-auto max-w-[760px]">
          <Link
            to="/resources"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] text-[13px] font-extrabold text-neutral-500 transition hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            자료 목록
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
      <ResourceHeader ctaPath={resource.primaryCta.path} />

      <article className="mx-auto max-w-[1080px] px-5 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-14">
          <div className="min-w-0">
            <Link
              to="/resources"
              className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-neutral-500 transition hover:text-neutral-950"
            >
              <ArrowLeft className="h-4 w-4" />
              자료 목록
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
                    {section.bullets ? (
                      <ul className="grid gap-2 pl-4">
                        {section.bullets.map((bullet) => (
                          <li key={bullet} className="list-disc pl-1">
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ))}

              <section>
                <h2 className="text-[22px] font-extrabold tracking-normal text-neutral-950">
                  {resource.checklist.heading}
                </h2>
                <ul className="mt-4 grid gap-2 text-[15px] font-medium leading-7 text-neutral-700">
                  {resource.checklist.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-[8px] border border-neutral-200 bg-white px-4 py-3"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="text-[22px] font-extrabold tracking-normal text-neutral-950">
                  {resource.comparison.heading}
                </h2>
                <div className="mt-4 overflow-x-auto rounded-[8px] border border-neutral-200 bg-white">
                  <table className="min-w-[640px] w-full border-collapse text-left text-[14px]">
                    <thead className="bg-neutral-50 text-[12px] font-extrabold text-neutral-500">
                      <tr>
                        {resource.comparison.columns.map((column) => (
                          <th key={column} className="px-4 py-3">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 font-semibold text-neutral-700">
                      {resource.comparison.rows.map((row) => (
                        <tr key={row.join("-")}>
                          {row.map((cell, index) => (
                            <td
                              key={`${row[0]}-${cell}`}
                              className={
                                index === 0
                                  ? "whitespace-nowrap px-4 py-3 font-extrabold text-neutral-950"
                                  : "px-4 py-3 leading-6"
                              }
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="text-[22px] font-extrabold tracking-normal text-neutral-950">
                  자주 묻는 질문
                </h2>
                <div className="mt-4 grid gap-4">
                  {resource.faqs.map((faq) => (
                    <section
                      key={faq.question}
                      className="rounded-[8px] border border-neutral-200 bg-white p-5"
                    >
                      <h3 className="text-[16px] font-extrabold leading-6 text-neutral-950">
                        {faq.question}
                      </h3>
                      <p className="mt-2 text-[14px] font-medium leading-6 text-neutral-700">
                        {faq.answer}
                      </p>
                    </section>
                  ))}
                </div>
              </section>
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
