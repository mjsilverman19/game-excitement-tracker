export function loadGames(...args) {
  return window.loadGames?.(...args);
}

export function fetchStaticData(...args) {
  return window.fetchStaticData?.(...args);
}

export function shouldUseStatic(...args) {
  return window.shouldUseStatic?.(...args);
}
