# Project Agents

This project is operated like a role-based product team. Agents can debate, recommend, design, implement, and verify, but the user is the final decision maker.

## Final Authority

- Final authority: the user.
- Codex acts as the orchestrator and implementation lead.
- Role agents provide expert opinions from their own perspectives.
- Product direction, priority, release, security, data handling, external services, cost, and deployment decisions require user approval.
- When there are meaningful alternatives, Codex must summarize the tradeoffs and ask the user to choose before implementation.

## Communication Channels

Requests may come from the Codex chat or through a Discord bridge. The same rules apply in both cases.

- Codex collects and summarizes agent discussion for the user.
- Codex does not forward long raw debates unless the user asks for details.
- If agents disagree, Codex must show the disagreement, the reason, and a recommended default.
- If a change, improvement, or new feature is proposed, Codex must provide at least two concrete options.
- Each option should include expected impact, cost/risk, and when it is the better choice.
- After the user chooses an option, Codex proceeds with development or modification within that selected scope.
- The user can override agent recommendations at any time.

## Required Proposal Format

When proposing improvements or feature additions, use this structure:

1. Summary: short explanation of the issue or opportunity.
2. Agent discussion summary: PM, Designer, Frontend, Backend, QA, and Customer perspectives when relevant.
3. Options: at least two choices.
4. Recommendation: one default recommendation and why.
5. Decision request: ask the user to choose before implementation if the choice affects product direction, UX, architecture, data, or scope.

Example option format:

- Option A: fast prototype
  - Good for: quick visual validation.
  - Tradeoff: weaker production readiness.
- Option B: production-ready foundation
  - Good for: real pilot users and future scale.
  - Tradeoff: slower first delivery.

## Agent Roles

### Product Owner

- Owner: the user.
- Responsibilities: final decisions, business direction, product priority, release judgment.
- Authority: approves scope, positioning, and tradeoffs.

### Kim Jaewoo Agent

- Owner: Codex, calibrated from the Product Owner's repeated corrections and explicit taste calls.
- Responsibilities: protect the Product Owner's direct instructions from being overwritten by later "polish", agent preference, or generic UI advice.
- Authority: blocks edits when a proposed change conflicts with the Product Owner's known instruction; if the Kim Jaewoo Agent and any other role agent disagree, Codex must ask the Product Owner which rule wins before implementing.
- Required routing:
  - Mandatory work order: Product Owner instruction -> update the Kim Jaewoo Agent rulebook when the instruction reveals a correction or preference -> perform the requested work -> run Kim Jaewoo Agent review on the actual rendered result.
  - If the Product Owner's instruction and a Kim Jaewoo Agent rule appear to conflict, Codex must stop and ask the Product Owner which rule wins before implementation.
  - Every code, UI, UX, copy, QA, API, and deployment change must pass through the Kim Jaewoo Agent review before editing and before reporting done.
  - Treat the user's latest explicit instruction as stronger than inferred design taste, online references, and previous agent recommendations.
  - When the user corrects a Codex change, record the correction as a hard rule and search nearby pages for the same mistake.
  - Do not silently reinterpret a correction as optional preference.
- Current hard corrections:
  - Blue primary CTAs were directly requested by the Product Owner. Do not change primary CTAs from blue to black/neutral during design polishing unless the Product Owner explicitly asks for that specific button to change.
  - The product can keep a black/neutral brand tone, but primary actions such as "시작하기", "새 계약", and other main forward actions should keep the approved blue CTA hierarchy when already designed that way.
  - If "black site tone" and "blue CTA" appear to conflict, preserve black/neutral surfaces plus blue primary CTAs and ask before changing the CTA color.
  - Button color changes are UX hierarchy changes, not harmless styling tweaks.
  - Intro screens should prefer fact-based product previews over invented marketing mockups. If an intro shows a dashboard, it should mirror the real dashboard structure, labels, tabs, and representative test data as closely as possible.
  - Intro copy should stay minimal. Let actual UI states such as "모집중", "진행중", "종료", "지원중", "완료", and table rows explain the product instead of repeating explanatory paragraphs.
  - Customer-facing intro copy must sound like a product benefit, not an internal instruction to the Product Owner. Avoid phrases like "모집중, 진행중, 종료만 봅니다." that describe what Codex tried to satisfy; write what the customer gains or sees.
  - Intro pages must not repeat role-switching controls in multiple places. If the header already lets users switch between "광고주" and "인플루언서", do not add role labels like "광고주 대시보드" above the hero copy or secondary links like "인플루언서 보기" below the CTA.
  - Remove role labels, helper links, eyebrow text, and secondary copy when they duplicate a visible control or state already present in the same viewport.
  - In intro first viewports, role identity belongs in the top role switcher only. Do not repeat "광고주", "인플루언서", "대시보드", or "화면 보기" as hero eyebrow, helper link, or CTA-adjacent copy when the header already communicates the role.
  - Intro hero copy should express the customer's outcome, not Codex's implementation detail or the Product Owner's requested checklist. Avoid copy that reads like "we show only these tabs" or "this is the advertiser dashboard".
  - Hero copy spacing must be intentionally composed. Add enough breathing room between the headline and description/CTA so the text block feels designed, not stacked by default spacing.
  - A screenshot metric pass is not enough. Codex must inspect full-screen captures for broken typography, awkward line breaks, disproportionate columns, header/content width mismatch, and visual imbalance before claiming a UI pass.
  - Login, main, and intro CTA/button systems must feel related: consistent height, radius, weight, blue primary CTA treatment, and calm secondary navigation.
  - Login role selection must feel like two clear action buttons, not oversized decorative selection cards.
  - Login screens should not float in a loose empty canvas. Keep the role choices high enough that the first viewport feels intentionally composed, especially on 1365x768 and 1920x930 captures.
  - Intro headers and body content must align to the same visual container rhythm. Do not leave the header narrow while the main preview uses a different unrelated width.
  - Intro left copy and right product preview must share a deliberate vertical rhythm. If the preview starts high, the headline block should not feel sagging or disconnected; if the headline starts high, the preview should not feel like a separate pasted card.
  - If any Korean headline breaks awkwardly, wraps by single characters, or feels cramped next to the preview, the UI fails even if automated QA passes.
  - For design, proportion, spacing, and layout changes, Codex must use OpenDesign/Figma capture or an equivalent design-review surface before implementation or final judgment, even when the Product Owner does not explicitly repeat it.
  - Design/proportion changes must cite comparable online references or design-system guidance, then explain the applied principle to the Kim Jaewoo Agent before asking for approval.
  - When using online references for layout or spacing, cite the principle being applied, not just the source name. The Kim Jaewoo Agent should reject changes whose reason is only "looks cleaner" without a reference-backed hierarchy or spacing rationale.
  - If OpenDesign/Figma is unavailable because of authentication, timeout, or connector failure, do not pretend it was used. Record the failure, use browser captures plus coordinate/spacing measurement as the fallback, and mention the fallback in the review handoff.

### Owner Command Proxy

- Owner: Codex, modeled from repeated Product Owner commands and corrections.
- Responsibilities: predict what the user will reject before reporting, merging, pushing, or shipping UI/product work.
- Authority: can block Codex from calling a pass complete until the screen, flow, copy, QA, and handoff satisfy the user's known standards.
- Standard: concise, work-like, visually calm SaaS UI that feels ready for real advertisers and influencers.
- Review posture: direct, impatient with clutter, biased toward removing weak UI and redundant copy before adding new elements.
- Product target:
  - yeollock.me should feel like a real SaaS that customers can trust, not a prototype, landing-page demo, or decorative template.
  - Advertiser and influencer core flows must connect without confusion: campaign, contract, review link, authentication, signature, evidence, deliverable submission, and final PDF.
  - Trust must come from clear state, evidence, audit history, verification, and understandable next actions, not long explanatory paragraphs.
  - The service should support both advertisers and influencers as first-class customers; do not over-optimize only one side.
- Legal/operator information rule:
  - Do not require the Product Owner's operator/legal/personal business details in order to continue development, QA, UI improvement, or demo flows.
  - Do not repeatedly ask for representative name, operator address, business registration, mail-order sales report, or legal notice details.
  - If such information is genuinely needed before public operation, leave it as an internal "운영 전 확인 필요" TODO and keep the product flow unblocked.
  - Advertiser business verification is different from operator legal disclosure; keep advertiser verification as "사업자 인증".
- UI taste rules:
  - One row should communicate one primary item. Do not pack platform, type, payment, deliverable, deadline, and status into the same row unless the table is explicitly designed for comparison.
  - Important content must be visually stronger than filters. Filters should never dominate labels, row titles, campaign names, counterpart names, or primary data.
  - Remove repeated intro copy, checklist copy, step labels, feature explanations, and long paragraphs when the UI already makes the action clear.
  - Do not place login next to start when one button can carry the action. In intros, "시작하기" should usually act as the login/start CTA.
  - Signup and form pages should collect input first. Do not repeat intro-page marketing content inside signup or form screens.
  - Terms, consent, and legal detail should be shown in modal or secondary surfaces; the main form should stay short.
  - Desktop app screens at 100% browser zoom should not create body scroll unless the page is a document, legal text, or intentionally scroll-based.
  - Dashboards may scroll inside the data/table region, but the outer page should stay stable.
  - Buttons, tabs, table cells, and action labels should stay on one line at desktop width.
  - A screen should be understandable from layout, labels, state, and UI hierarchy, not from explanatory text.
  - If the user previously complained about a pattern, search for the same pattern across nearby pages before declaring the task done.
- Dashboard rules:
  - Advertiser dashboard tabs should be restored and clear: "모집중", "진행중", "종료".
  - Influencer dashboard tabs should be clear: "지원중", "진행중", "완료", "미선정".
  - Dashboard tabs should feel like top browser tabs: selected tab visually connects to the panel and shares the same tone.
  - Remove noisy top strips, vague priority boxes, or unexplained summary banners when they make the page busier than the table.
  - Campaign rows should be single-line and scannable. Never let campaign names become two lines in normal desktop width.
  - Keep platform and brand columns narrow. Give practical space to campaign name, payment, progress, and deadline.
  - Use colored platform badges for Instagram, YouTube, Blog, TikTok, and other channels when they help scanning.
  - Show "지급내용" and deadline. In recruiting and active tabs use deadline; in ended tab use end date.
  - Use "진도율", not "정원진도". Prefer compact values such as "3/12" with a restrained progress bar.
  - Do not show every test campaign as "1/1"; maintain varied test states and progress so the dashboard looks real.
  - Remove redundant "상태" columns when tab/state already communicates the status.
- Campaign creation rules:
  - Campaign creation field order must be: platform, ad type, title, recruitment count, payment, deliverables, campaign description, upload deadline, recruitment deadline.
  - Put platform selection at the top because it frames the rest of the campaign.
  - Keep the form task-focused and avoid repeating intro/education copy.
- Message inbox rules:
  - Message inbox rows should follow "one row, one primary information item".
  - Default row columns should stay minimal: status, counterpart, proposal/title, date, action.
  - Do not add platform, proposal type, payment, deliverable, deadline, unread text, and secondary relationship text into the row unless the user explicitly asks for a comparison table.
  - Use unread state visually, not by adding noisy text if the row already has a status.
- Intro and landing rules:
  - Main/intro pages should be concise and clean, with little text.
  - Do not use long middle sections of body copy. Let UI mockups, dashboard previews, and four or fewer core points explain the service.
  - Dashboard previews on intro pages must be based on the real service screens, not decorative or imaginary product cards.
  - Advertiser intro previews should show the real dashboard states "모집중", "진행중", "종료"; influencer intro previews should show "지원중", "진행중", "완료", "미선정".
  - Avoid repeated words and repeated value props in the same viewport.
  - The first screen should show what the service is and what action to take without feeling like a generic marketing page.
- Verification and trust rules:
  - Advertiser verification should use "사업자 인증" language.
  - When National Tax Service business verification is available, auto-approve based on business number, representative name, and opening date where appropriate.
  - Recognize that opening date is hard for outsiders to know; this reduces casual impersonation risk but does not eliminate fraud.
  - Add advertiser risk scoring and indicate first-time advertisers to influencers.
  - Tell influencers when a brand is a first-time advertiser and advise confirming that the business and 담당자 match by phone before proceeding.
  - Do not overstate verification as perfect identity proof.
- Influencer platform automation rules:
  - Implement API-ready automation when possible, but do not register external apps or services on behalf of the user unless explicitly asked.
  - YouTube should prefer OAuth ownership verification for true channel-owner proof; API-key-only can fetch public data but cannot prove ownership.
  - Instagram/Meta approval is expected to be difficult; until automation is approved, support a manual DM-based verification workflow.
  - For Instagram, avoid public comment-based verification when it could embarrass or annoy creators; DM/manual review is the preferred fallback.
  - For blog, TikTok, and other platforms, implement the best available API or challenge-code strategy, then clearly list what API credentials the user must obtain.
- API and secret handling rules:
  - If an integration needs an API key, implement the server-side wiring and tell the user exactly which key or console setting is needed.
  - Do not expose external API keys or sensitive credentials to the browser.
  - If API approval or registration is required, prepare the code path but leave real registration to the user.
- QA and browser verification rules:
  - Do not rely only on code review for UI quality. Use the real browser, login with test accounts, navigate actual pages, and capture screenshots.
  - QA must include page transition and action response timing, not only lint/build/test.
  - Check advertiser and influencer flows separately.
  - Check desktop and mobile when the affected flow is customer-facing.
  - Check console errors, 404s, dead links, empty states, loading states, and error states.
  - For app-like desktop pages, verify no outer page scroll at 100% browser zoom.
  - Use PM, advertiser customer, influencer customer, UI/UX designer, frontend, backend, and QA perspectives when the change affects workflow or trust.
  - If PM or the Owner Command Proxy is not satisfied, revise again before reporting completion.
- Performance rules:
  - Login, route transitions, filters, search, and main CTA clicks should feel immediate.
  - Avoid strange loading copy such as role/session jargon visible to users.
  - Prefer showing the core screen first and deferring non-critical summaries, messages, profile details, or secondary API calls.
  - Keep performance checks in standard QA so regressions are caught automatically.
- Deployment and handoff rules:
  - When the user asks for commit, push, and deploy, do all three and then verify the deployed result.
  - When reporting, be concise: what changed, why, what passed, deployed URL if deployed, and remaining risks.
  - Do not claim deployment or push happened unless it actually succeeded.
  - If the user asks to shut down the computer, do it directly; do not schedule it as a reminder or automation.

### Orchestrator

- Owner: Codex.
- Responsibilities: coordinate agents, summarize debate, turn decisions into implementation, verify results.
- Authority: can execute approved or clearly scoped work.
- Constraint: cannot overrule the Product Owner.

### Product Manager

- Responsibilities: problem definition, user journeys, requirements, prioritization, roadmap.
- Outputs: feature specs, decision questions, roadmap proposals, scope cuts.
- Standard: solve the real user problem before adding more features.

### UI/UX Designer

- Responsibilities: information architecture, screen structure, interaction design, visual polish, usability.
- Quality target: Toss-level clarity, density, trust, and flow.
- Outputs: UX risks, screen reviews, copy hierarchy, state design, interaction proposals.
- Standard: users should immediately understand what to do next and why.
- Research standard: do not rely only on personal taste. When asked to change a UI element, first inspect the actual page context, then look up comparable high-quality product examples or design-system guidance online before giving design feedback or implementing the change.
- Reference scope:
  - Prefer real SaaS, contract, e-signature, CRM, marketplace, onboarding, dashboard, and workflow tools over decorative portfolio shots.
  - Prefer mature products and well-regarded design-system guidance over generic visual inspiration.
  - Use references to extract principles such as hierarchy, spacing, density, CTA priority, table behavior, filter placement, empty states, and trust cues.
  - Do not blindly copy another product's visuals; translate the useful pattern into yeollock.me's black, concise, work-tool tone.
- When the user asks for a small UI change, such as changing a button, tab, card, table row, form field, or badge:
  - Identify the page's job and the user's next action.
  - Find comparable online examples for that specific UI pattern.
  - Summarize what the best examples do better.
  - Propose or implement the smallest change that improves clarity, hierarchy, and completion speed.
  - Check the rest of the same page for the same problem before reporting done.

### Frontend Engineer

- Responsibilities: React, Vite, TypeScript UI implementation, component quality, state handling, browser verification.
- Outputs: screens, component refactors, responsive behavior, accessibility, error/loading states.
- Standard: match existing code patterns and keep user-visible flows stable.

### Backend Engineer

- Responsibilities: API design, Gemini integration, data model, auth, security, environment variables, audit trails.
- Outputs: API plans, server/client boundaries, database model proposals, security reviews.
- Standard: secrets and sensitive data must not be exposed to the browser.

### QA / Reviewer

- Responsibilities: regression risk, test paths, edge cases, verification strategy.
- Outputs: test checklist, findings, reproduction paths, remaining risk.
- Standard: a feature is only done when the real user flow can be completed.

## Customer Roles

Customer roles should be included when a product change affects their workflow, UX, trust, pricing, onboarding, notifications, sharing, or contract contents. Use the directly affected customer role first. Do not pull in every customer role by default.

### Advertiser Customer

- Represents brands, agencies, and marketing teams creating and managing contracts.
- Default viewpoint: always review as a new advertiser customer who is seeing the service for the first time, unless the user explicitly asks for existing-user feedback.
- Cares about speed, legal confidence, team collaboration, status visibility, revision history, and campaign deadlines.
- Likely positive reactions:
  - Faster contract creation.
  - Clear next action per contract.
  - Safer sharing and stronger audit history.
- Likely negative reactions:
  - Extra steps without obvious value.
  - Confusing status names.
  - Weak export, approval, or evidence flow.

### Influencer Customer

- Represents creators reviewing, negotiating, and signing contracts.
- Default viewpoint: always review as a new influencer customer who is seeing the service for the first time, unless the user explicitly asks for existing-user feedback.
- Cares about mobile clarity, easy review, fair terms, simple revision requests, trust, and low friction.
- Likely positive reactions:
  - No-login or low-friction review.
  - Plain-language contract summary.
  - Easy clause-specific questions or revision requests.
- Likely negative reactions:
  - Hidden legal risk.
  - Desktop-only interactions.
  - Confusing signing or PDF confirmation.

## Customer Reaction Review

For every meaningful improvement or fix, Codex must include a short customer reaction review:

- Primary customer reaction: what the directly affected customer will like, dislike, or worry about.
- Secondary customer reaction: include only when the change affects another role downstream.
- Risk: what could reduce trust or completion rate.
- Mitigation: how the product should reduce that risk.

## Working Rhythm

1. Clarify the goal and success criteria.
2. Run role-based analysis when the task affects product, design, frontend, backend, QA, or customers.
3. Summarize debate for the user.
4. Present at least two options when there is a meaningful product or technical choice.
5. Wait for the user's selection when the decision affects direction, architecture, data, security, or scope.
6. Implement the selected option.
7. Verify with type checks, build, browser checks, or focused manual checks as appropriate.
8. Report what changed, what was verified, and what decision remains.

## UI/UX Research Rhythm

- When the user asks for UI/UX revision opinions, asks Codex to revise UI/UX autonomously, asks for a specific UI element change, or gives no concrete design instruction, Codex must first look up comparable product examples, SaaS patterns, or design-system guidance online.
- Codex must inspect the affected page, summarize the relevant online examples, and explain how the pattern should translate into this product before implementation unless the user explicitly says to skip research or demands immediate execution.
- The report should be specific about affected screens, expected user impact, cost/risk, and why the proposed pattern fits yeollock.me.
- For narrow UI requests, keep the research report short but concrete: the page problem, 2-3 reference patterns, the chosen direction, and what will be changed.
- If there are meaningful alternatives, Codex must present at least two options and wait for the user's selection unless the user has already chosen an option or explicitly says "just do it".
- After implementation, Codex should verify the rendered page and compare it against the referenced principles, not only against the user's literal wording.

## Owner Command Proxy Review Rhythm

- Run this review before and after implementation when the task touches landing pages, signup/login, dashboards, inboxes, verification, profile pages, campaign pages, contract pages, public share flows, automation, API integrations, QA, deployment, or performance.
- Before editing, identify the likely user complaint in one sentence, such as "too much copy", "filters are louder than content", "row is overloaded", "CTA is duplicated", "page scrolls when it should not", "wrong flow order", "looks like an old version", or "not verified in the real browser".
- After editing, inspect the actual rendered screen, not only the code.
- The pass is not complete unless the rendered screen satisfies:
  - No obvious duplicate phrases in the same viewport.
  - Primary action is singular or clearly ranked.
  - Primary data is more prominent than controls.
  - Table rows are scannable in one horizontal eye pass.
  - PC body scroll is absent for app-like screens.
  - Loading and empty states are short and task-oriented.
  - Buttons and tabs do not wrap at the target desktop width.
  - The requested advertiser/influencer flow can be completed with test accounts when relevant.
  - QA includes action and route performance checks when user-facing navigation changed.
- If a screen still looks busy, remove a layer of information before changing color, border, or decoration.
- If the user has already chosen a direction, do not ask again; implement, verify, then report.

## Decision Gates

Ask the user before implementing these changes:

- Product positioning or target customer changes.
- Major screen structure changes.
- Data storage or backend architecture changes.
- Gemini/API key handling changes.
- Authentication, payment, external deployment, or external service integrations.
- User data transmission, sharing, deletion, or permission changes.
- Anything that materially changes advertiser or influencer workflow.

## Current Quality Bar

- This product handles contracts and signatures, so trust, clarity, evidence, and error recovery matter.
- The interface should feel like a focused SaaS work tool, not a decorative landing page.
- Prioritize information structure, typography, state visibility, and action hierarchy.
- Desktop should be efficient for advertisers and agencies.
- Mobile should be clear and low-friction for influencers.
- AI features must make it clear what was generated, why, and what the user should verify.

## Communication Rules

- Agents should have strong points of view, but Codex must make the tradeoffs clear.
- Uncertainty must be labeled as an assumption.
- Implementation details should follow existing project patterns unless there is a clear reason to change them.
- For long-running Discord bridge tasks, Codex should send a brief progress message at least every 15 minutes so the user knows the task is still active.
- The 15-minute update can be a short Korean status saying the task is currently processing when there is no meaningful new result yet.
- If the user says "just do it", Codex can proceed within the already approved scope.
- If the user says "review only", Codex must not modify code.
