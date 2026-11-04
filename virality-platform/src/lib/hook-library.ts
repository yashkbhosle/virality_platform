// F6: Proven hook structures. Also used by F3 to map an analyzed hook formula
// onto a known structure (ViralAnalysis.hookFormula.libraryId).

export interface HookStructure {
  id: string;
  name: string;
  template: string;
  whyItWorks: string;
  bestFor: string;
  example: string;
}

export const DEFAULT_HOOKS: HookStructure[] = [
  {
    id: "bold-claim-news",
    name: "Bold claim / unexpected news",
    template: "I just got the most [description of opportunity] ever.",
    whyItWorks: "Curiosity gap plus a hard stance: viewers stay to find out what the opportunity is and whether it's real.",
    bestFor: "Creators sharing deals, opportunities, launches or personal wins",
    example: "I just got the most ridiculous mortgage rate offer I've seen all year.",
  },
  {
    id: "problem-solution-reveal",
    name: "Problem → solution reveal",
    template: "[Technique] got me [positive result], but [surprising counter-expectation].",
    whyItWorks: "Promises a result (relevance) and immediately opens a loop with a twist (non-obvious).",
    bestFor: "How-to and method content where the obvious takeaway is wrong",
    example: "Batch cooking saved me $400 a month, but not for the reason you think.",
  },
  {
    id: "authority-time-saving",
    name: "Authority + time-saving",
    template: "I'm a [profession]. It took me [duration] to learn [subject], and I'll teach you in [short time].",
    whyItWorks: "Credibility plus a short distance to the result: years of knowledge in seconds.",
    bestFor: "Professionals and experts (doctors, brokers, coaches, developers)",
    example: "I'm a mortgage broker. It took me 8 years to learn how lenders think, and I'll teach you in 60 seconds.",
  },
  {
    id: "secret-opportunity",
    name: "Secret / opportunity reveal",
    template: "There's a wave of [content type] blowing up right now that's [achieving success], and most people have no idea.",
    whyItWorks: "Fear of missing out plus insider knowledge; the viewer feels early.",
    bestFor: "Trend, business and growth niches",
    example: "There's a wave of faceless finance channels blowing up right now that are making six figures, and most people have no idea.",
  },
  {
    id: "contrarian-myth-bust",
    name: "Contrarian / myth bust",
    template: "Everything you heard about [common belief] was a lie.",
    whyItWorks: "Contrarian take and hard stance: a top comment trigger. People comment to agree or argue.",
    bestFor: "Educational niches with common misconceptions",
    example: "Everything you heard about needing 20% down for a house was a lie.",
  },
  {
    id: "curiosity-list",
    name: "Curiosity list",
    template: "These are the only [number] [resources] you need to [outcome], and you've probably never heard of them.",
    whyItWorks: "A specific number sets expectations (easy to absorb) and 'never heard of them' makes it non-obvious.",
    bestFor: "Tools, resources, apps and recommendation content",
    example: "These are the only 3 government programs you need to buy your first home, and you've probably never heard of them.",
  },
  {
    id: "surprising-outcome",
    name: "Surprising outcome",
    template: "This [thing] pulled [remarkable result]. At first that sounds [assessment] until you see [key factor].",
    whyItWorks: "Leads with a striking result, then reframes it so the viewer has to keep watching for the explanation.",
    bestFor: "Case studies, breakdowns and results content",
    example: "This one-bedroom condo pulled 14 offers. At first that sounds crazy until you see the price.",
  },
  {
    id: "bold-claim-how-to",
    name: "Bold claim + how-to",
    template: "[Entity] went from [start] to [impressive outcome] in [time] by [unique strategy].",
    whyItWorks: "Transformation story with a named method; viewers stay to learn the strategy.",
    bestFor: "Business, fitness and personal finance transformations",
    example: "This couple went from renting to owning in 18 months by using one tax-free account.",
  },
  {
    id: "warning-mistake",
    name: "Warning / mistake",
    template: "Don't [action] without [thing], or [consequence].",
    whyItWorks: "Loss aversion and personal stakes: people hate losing more than they like winning.",
    bestFor: "Finance, insurance, legal, health and any niche with costly mistakes",
    example: "Don't sign a pre-approval without checking this clause, or you could lose your deposit.",
  },
  {
    id: "direct-call-out",
    name: "Direct call-out",
    template: "If you're a [avatar] and you [situation], stop scrolling.",
    whyItWorks: "Names the exact viewer, which boosts fit score and makes the right person feel seen.",
    bestFor: "Narrow niches with a clear audience avatar",
    example: "If you're a newcomer in Canada and you're still renting, stop scrolling.",
  },
  {
    id: "story-open-loop",
    name: "Story open loop",
    template: "[Time] ago I [mistake/event], and it changed how I [topic] forever.",
    whyItWorks: "Personal story plus an unresolved loop; viewers need the ending.",
    bestFor: "Personal brands, coaches and lessons-learned content",
    example: "Two years ago I missed my mortgage renewal date, and it changed how I handle money forever.",
  },
  {
    id: "question",
    name: "Question",
    template: "Why does [surprising fact] happen to [avatar]?",
    whyItWorks: "A specific question the viewer can't answer creates a curiosity gap and invites comments.",
    bestFor: "Explainers and educational content",
    example: "Why do first-time buyers in Ontario pay more in closing costs than anyone else?",
  },
  {
    id: "comparison",
    name: "Comparison",
    template: "[Option A] vs [Option B]: which actually [outcome]?",
    whyItWorks: "Familiar targets people already have opinions on; strong comment trigger and easy to absorb.",
    bestFor: "Product, method and decision content",
    example: "Fixed vs variable mortgage: which actually saves you more in 2026?",
  },
  {
    id: "statistic-shock",
    name: "Statistic shock",
    template: "[X]% of [group] [surprising behaviour]. Here's why.",
    whyItWorks: "A surprising number is non-obvious and instantly credible; 'here's why' opens the loop.",
    bestFor: "Data-driven niches (use real, verified numbers only)",
    example: "[X]% of first-time buyers overpay for their mortgage. Here's why.",
  },
  {
    id: "before-after",
    name: "Before / after",
    template: "This is what [thing] looked like before [change]… and after.",
    whyItWorks: "Visual transformation; the brain wants to see the payoff, so completion rates are high.",
    bestFor: "Visual niches: renovation, design, fitness, editing, cleaning",
    example: "This is what my credit score looked like before I changed one habit… and after.",
  },
];

export function getHookStructure(id: string | undefined | null): HookStructure | undefined {
  return id ? DEFAULT_HOOKS.find((h) => h.id === id) : undefined;
}

/** Split a template into text and [variable] parts for highlighting. */
export function splitTemplate(template: string): { text: string; isVar: boolean }[] {
  return template
    .split(/(\[[^\]]+\])/g)
    .filter(Boolean)
    .map((text) => ({ text, isVar: /^\[[^\]]+\]$/.test(text) }));
}
