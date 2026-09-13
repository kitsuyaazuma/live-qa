import type { Question } from '../protocol';

type Compare = (a: Question, b: Question) => number;

export const byVotes: Compare = (a, b) => b.votes - a.votes || a.createdAt - b.createdAt;
export const byNewest: Compare = (a, b) => b.createdAt - a.createdAt;
export const byOldest: Compare = (a, b) => a.createdAt - b.createdAt;

const onStage = (question: Question) => (question.status === 'answering' ? 0 : 1);

export const forStage: Compare = (a, b) => onStage(a) - onStage(b) || byVotes(a, b);
