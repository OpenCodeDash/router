// Upstream statuses that mean "this model can't serve you right now", so the
// next model in the route should be tried. Other 4xx (400, 422, ...) mean the
// request itself is bad and would fail on every model, so they pass through.
export const FALLBACK_STATUSES = [401, 403, 404, 408, 429] as const;
