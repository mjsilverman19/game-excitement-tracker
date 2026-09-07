// Only the most recent load for the current selection may update the UI.
let generation = 0;

export function beginLoad() {
    const id = ++generation;
    const selection = ['selectedSport', 'selectedSeason', 'selectedWeek', 'selectedDate', 'viewMode', 'rangeMode'];
    const values = selection.map(key => window[key]);
    return () => id === generation && selection.every((key, index) => window[key] === values[index]);
}
