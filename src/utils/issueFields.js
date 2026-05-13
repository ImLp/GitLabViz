// Multi-assignee aware: GitLab issues expose `assignees` (array, source of truth)
// and `assignee` (deprecated singular, often == assignees[0] but may be null on multi-assignee).
export function getAssigneeNames (raw) {
  if (!raw) return []
  if (Array.isArray(raw.assignees) && raw.assignees.length) {
    return raw.assignees.map(a => a?.name).filter(Boolean)
  }
  return raw.assignee?.name ? [raw.assignee.name] : []
}
