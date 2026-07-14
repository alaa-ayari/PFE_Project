export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['under_review', 'rejected', 'cancelled', 'visit_scheduled'],
  under_review: ['visit_scheduled', 'pre_approved', 'rejected', 'cancelled'],
  visit_scheduled: ['pre_approved', 'rejected', 'cancelled'],
  pre_approved: ['accepted', 'rejected', 'cancelled'],
  accepted: ['negotiation', 'rejected'],
  negotiation: ['awaiting_lawyer'],
  awaiting_lawyer: ['contract_drafting'],
  contract_drafting: [],
  rejected: [],
  cancelled: [],
};

export const STATUS_LABELS: Record<string, string> = {
  under_review: 'Under Review',
  visit_scheduled: 'Visit Scheduled',
  pre_approved: 'Pre-Approved',
  accepted: 'Accepted',
  negotiation: 'In Negotiation',
  awaiting_lawyer: 'Awaiting Lawyer',
  contract_drafting: 'Contract Drafting',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const ALL_STATUSES = Object.keys(VALID_TRANSITIONS);

export const TERMINAL_STATUSES = ALL_STATUSES.filter(
  (s) => VALID_TRANSITIONS[s].length === 0,
);

export const ACTIVE_STATUSES = ALL_STATUSES.filter(
  (s) => !TERMINAL_STATUSES.includes(s),
);
