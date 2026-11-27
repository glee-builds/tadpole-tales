// plan.js: "Plan your story" as plain functions (no screen, no database).
//
// A book's `plan` is { <question id>: short text }, e.g. { who: 'Pip, a small frog' }.
// The questions come from data/lessons.json (`planning`). A question left empty is
// simply not in the plan. Nothing here is checked or graded.

export const PLAN_LIMIT = 40; // characters an answer can hold (about one line)

// A short name and an icon for each question's idea card (a new question id gets the plain one).
const CARDS = {
  who: ['🐸', 'Who'],
  where: ['📍', 'Where'],
  want: ['⭐', 'Wants'],
  problem: ['🚧', 'In the way'],
  ending: ['🏁', 'Ending'],
};

/** The book's plan as { id: text }, whatever a damaged backup put there: only non-empty text is kept. */
export function planOf(book) {
  const plan = book?.plan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return {};
  return Object.fromEntries(Object.entries(plan).filter(([, text]) => typeof text === 'string' && text.trim() !== ''));
}

/** The book with one answer saved (an empty answer takes it out of the plan). */
export function setPlanAnswer(book, id, text, now) {
  const plan = planOf(book);
  const answer = String(text).slice(0, PLAN_LIMIT);
  if (answer.trim() === '') delete plan[id];
  else plan[id] = answer;
  return { ...book, plan, changed: now };
}

/** The idea cards to show, in the questions' order: [{ id, icon, label, text }]. Unanswered questions have none. */
export function ideaCards(planning, book) {
  const plan = planOf(book);
  return (planning ?? []).filter((q) => plan[q.id]).map((q) => ({
    id: q.id,
    icon: CARDS[q.id]?.[0] ?? '💡',
    label: CARDS[q.id]?.[1] ?? 'Idea',
    text: plan[q.id],
  }));
}
